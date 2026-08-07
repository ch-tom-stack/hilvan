import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA, FORMATO_FECHA } from '@/lib/agent-crm'

export const runtime = 'nodejs'

// POST /api/agent/crm/interaccion { prospecto_id, fecha?, tipo?, resumen?, proximo_paso?, fecha_proximo?, gmail_thread? }
// Agrega un toque a la bitácora. Fechas en formato YYYY-MM-DD (planas).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const prospectoId = typeof body?.prospecto_id === 'string' ? body.prospecto_id.trim() : ''
  if (!prospectoId) return NextResponse.json({ error: 'Falta "prospecto_id"' }, { status: 400 })

  const resumen = strA(body?.resumen)
  const proximoPaso = strA(body?.proximo_paso)
  if (!resumen && !proximoPaso) {
    return NextResponse.json({ error: 'Indica al menos "resumen" o "proximo_paso"' }, { status: 400 })
  }

  const fecha = strA(body?.fecha)
  const fechaProximo = strA(body?.fecha_proximo)
  if (fecha && !FORMATO_FECHA.test(fecha)) return NextResponse.json({ error: 'fecha inválida (YYYY-MM-DD)' }, { status: 400 })
  if (fechaProximo && !FORMATO_FECHA.test(fechaProximo)) return NextResponse.json({ error: 'fecha_proximo inválida (YYYY-MM-DD)' }, { status: 400 })

  const admin = createAdminClient()
  const { data: existe } = await admin.from('prospectos').select('id').eq('id', prospectoId).maybeSingle()
  if (!existe) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  const { data, error } = await admin
    .from('crm_interacciones')
    .insert({
      prospecto_id: prospectoId,
      fecha,
      tipo: strA(body?.tipo),
      resumen,
      respondido: body?.respondido === true,
      proximo_paso: proximoPaso,
      fecha_proximo: fechaProximo,
      gmail_thread: strA(body?.gmail_thread),
      // Quién hizo el contacto (Simón / Natalia). Trazabilidad, no ranking.
      // Se omite si no viene: no exige la columna antes de su migración.
      ...(strA(body?.enviado_por) ? { enviado_por: strA(body?.enviado_por) } : {}),
    })
    .select('id')
    .single()

  if (error || !data) {
    await registrarAccion({ herramienta: 'crm-interaccion', payload: body, ok: false, error: error?.message })
    return NextResponse.json({ error: error?.message ?? 'No se pudo registrar' }, { status: 500 })
  }

  await registrarAccion({ herramienta: 'crm-interaccion', payload: body, resultado_tabla: 'crm_interacciones', resultado_id: data.id, ok: true })
  return NextResponse.json({ id: data.id, prospecto_id: prospectoId })
}
