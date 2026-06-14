import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/generar-citaciones (JSON: { rodaje_id })
// Crea las citaciones (links con token) de cada persona del equipo SIN citación.
// NUNCA envía email/WhatsApp: el envío lo hace un humano desde la UI.
// Reversible con /deshacer (borra SOLO las citaciones creadas, no el rodaje).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { rodaje_id } = body ?? {}
  if (!rodaje_id || typeof rodaje_id !== 'string') {
    return NextResponse.json({ error: 'Falta rodaje_id' }, { status: 400 })
  }

  const admin = createAdminClient()

  // El rodaje debe existir.
  const { data: rodaje, error: rodajeError } = await admin
    .from('rodajes')
    .select('id')
    .eq('id', rodaje_id)
    .single()
  if (rodajeError || !rodaje) {
    return NextResponse.json({ error: 'Rodaje no encontrado' }, { status: 404 })
  }

  // Equipo del rodaje.
  const { data: equipo, error: equipoError } = await admin
    .from('rodaje_equipo_tecnico')
    .select('id, nombre')
    .eq('rodaje_id', rodaje_id)
  if (equipoError) return NextResponse.json({ error: equipoError.message }, { status: 500 })

  if (!equipo || equipo.length === 0) {
    return NextResponse.json({ creadas: 0, citaciones: [] })
  }

  // Personas que ya tienen citación.
  const { data: existentes, error: existError } = await admin
    .from('rodaje_citaciones')
    .select('persona_id')
    .eq('rodaje_id', rodaje_id)
  if (existError) return NextResponse.json({ error: existError.message }, { status: 500 })

  const yaTienen = new Set((existentes ?? []).map((c: any) => c.persona_id as string))
  const sinCitacion = equipo.filter((p: any) => !yaTienen.has(p.id))

  if (sinCitacion.length === 0) {
    return NextResponse.json({ creadas: 0, citaciones: [] })
  }

  const nuevas = sinCitacion.map((p: any) => ({
    rodaje_id,
    persona_id: p.id as string,
    token: randomUUID(),
  }))

  const { data: insertadas, error: insertError } = await admin
    .from('rodaje_citaciones')
    .insert(nuevas)
    .select('id, persona_id, token')
  if (insertError) {
    await registrarAccion({
      herramienta: 'generar-citaciones',
      payload: body,
      ok: false,
      error: insertError.message,
    })
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const nombrePorPersona = new Map(
    sinCitacion.map((p: any) => [p.id as string, p.nombre as string]),
  )

  const citacion_ids = (insertadas ?? []).map((c: any) => c.id as string)

  await registrarAccion({
    herramienta: 'generar-citaciones',
    payload: { ...body, citacion_ids },
    resultado_tabla: 'rodaje_citaciones',
    resultado_id: rodaje_id, // referencia al rodaje; el deshacer usa payload.citacion_ids
    ok: true,
  })

  const citaciones = (insertadas ?? []).map((c: any) => ({
    persona: nombrePorPersona.get(c.persona_id as string) ?? null,
    token: c.token as string,
    url: `/citacion/${c.token}`,
  }))

  return NextResponse.json({ creadas: citaciones.length, citaciones })
}
