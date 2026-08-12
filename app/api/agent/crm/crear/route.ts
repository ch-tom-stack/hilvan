import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { resolverPerfilAgente } from '@/lib/agent-perfil'
import { normalizarProspectoBody, esEtapaValida } from '@/lib/agent-crm'

export const runtime = 'nodejs'

// POST /api/agent/crm/crear (JSON)
// Crea un prospecto. Si `como_propuesta` es true, NO crea el prospecto: deja una
// propuesta (tipo prospecto_nuevo) en la Bandeja para que un humano la apruebe.
// Esto último es lo correcto cuando el lead viene de un correo entrante.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const datos = normalizarProspectoBody(body)
  if (!datos.empresa) return NextResponse.json({ error: 'Falta "empresa"' }, { status: 400 })

  const etapa = body?.etapa
  if (etapa !== undefined && etapa !== null && !esEtapaValida(etapa)) {
    return NextResponse.json({ error: 'etapa inválida' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Modo propuesta: va a la Bandeja, no se crea el prospecto ────────────────
  if (body?.como_propuesta === true) {
    const { data, error } = await admin
      .from('crm_aprobaciones')
      .insert({
        tipo: 'prospecto_nuevo',
        prospecto_id: null,
        payload: { ...datos, etapa: etapa ?? 'prospecto' },
        estado: 'pendiente',
        origen: 'agente',
        nota_agente: typeof body?.nota_agente === 'string' ? body.nota_agente : null,
      })
      .select('id')
      .single()
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'No se pudo crear la propuesta' }, { status: 500 })
    }
    await registrarAccion({ herramienta: 'crm-crear-propuesta', payload: body, resultado_tabla: 'crm_aprobaciones', resultado_id: data.id, ok: true })
    return NextResponse.json({ propuesta_id: data.id, estado: 'pendiente', mensaje: 'Propuesta creada en la Bandeja' })
  }

  // ── Validar FK responsable si viene ─────────────────────────────────────────
  if (datos.responsable_id) {
    const { data: prof } = await admin.from('profiles').select('id').eq('id', datos.responsable_id).maybeSingle()
    if (!prof) return NextResponse.json({ error: 'responsable_id no encontrado' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('prospectos')
    .insert({ ...datos, etapa: etapa ?? 'prospecto' })
    .select('id, empresa, etapa')
    .single()

  if (error || !data) {
    await registrarAccion({ herramienta: 'crm-crear', payload: body, ok: false, error: error?.message })
    return NextResponse.json({ error: error?.message ?? 'No se pudo crear el prospecto' }, { status: 500 })
  }

  // `notas` ya no es una columna del prospecto: es una nota suelta. No aborta
  // la creación si falla — el prospecto existe y es lo que importa.
  const notas = typeof body?.notas === 'string' ? body.notas.trim() : ''
  if (notas) {
    const { error: errNota } = await admin
      .from('crm_notas')
      .insert({ prospecto_id: data.id, tipo: 'nota', cuerpo: notas })
    if (errNota) console.error('[crm] no se pudo guardar la nota del prospecto:', errNota.message)
  }

  await registrarAccion({ herramienta: 'crm-crear', payload: body, resultado_tabla: 'prospectos', resultado_id: data.id, ok: true })
  return NextResponse.json(data)
}
