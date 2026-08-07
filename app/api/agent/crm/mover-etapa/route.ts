import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { esEtapaValida } from '@/lib/agent-crm'

export const runtime = 'nodejs'

// POST /api/agent/crm/mover-etapa { prospecto_id, etapa, como_propuesta?, evidencia? }
// Cambia la etapa de un prospecto. Validar transición = etapa permitida.
//
// `como_propuesta: true` NO mueve: deja una propuesta `cambio_etapa` en la
// Bandeja para que la apruebe un humano. Es la vía de los RETROCESOS: avanzar
// se apoya en evidencia positiva (existe un correo), retroceder se apoya en
// una ausencia, y una ausencia siempre puede ser un fallo de búsqueda.
// Ver docs/crm/operador-contexto.md.
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
  if (!esEtapaValida(body?.etapa)) return NextResponse.json({ error: 'etapa inválida' }, { status: 400 })

  const admin = createAdminClient()
  const { data: existe } = await admin.from('prospectos').select('id, empresa, etapa').eq('id', prospectoId).maybeSingle()
  if (!existe) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  const etapaAnterior = existe.etapa

  // ── Vía propuesta: no toca el prospecto ──────────────────────────────────
  if (body?.como_propuesta === true) {
    const evidencia = typeof body?.evidencia === 'string' ? body.evidencia.trim().slice(0, 2000) : ''
    if (!evidencia) {
      return NextResponse.json(
        { error: 'Una propuesta de cambio de etapa exige "evidencia" (por qué se propone)' },
        { status: 400 },
      )
    }

    const { data: prop, error: errProp } = await admin
      .from('crm_aprobaciones')
      .insert({
        tipo: 'cambio_etapa',
        prospecto_id: prospectoId,
        estado: 'pendiente',
        origen: 'agente',
        nota_agente: `${existe.empresa}: ${etapaAnterior} → ${body.etapa}. ${evidencia}`,
        payload: { prospecto_id: prospectoId, etapa: body.etapa, etapa_anterior: etapaAnterior, evidencia },
      })
      .select('id')
      .single<{ id: string }>()

    if (errProp || !prop) {
      await registrarAccion({ herramienta: 'crm-mover-etapa', payload: body, ok: false, error: errProp?.message })
      return NextResponse.json({ error: errProp?.message ?? 'No se pudo crear la propuesta' }, { status: 500 })
    }

    await registrarAccion({
      herramienta: 'crm-mover-etapa',
      payload: { ...body, modo: 'propuesta' },
      resultado_tabla: 'crm_aprobaciones',
      resultado_id: prop.id,
      ok: true,
    })
    return NextResponse.json({
      propuesta_id: prop.id,
      estado: 'pendiente',
      empresa: existe.empresa,
      de: etapaAnterior,
      a: body.etapa,
    })
  }

  const { error } = await admin.from('prospectos').update({ etapa: body.etapa }).eq('id', prospectoId)
  if (error) {
    await registrarAccion({ herramienta: 'crm-mover-etapa', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Guardamos etapa_anterior para que hilvan_deshacer pueda restaurarla.
  await registrarAccion({ herramienta: 'crm-mover-etapa', payload: { ...body, etapa_anterior: etapaAnterior }, resultado_tabla: 'prospectos', resultado_id: prospectoId, ok: true })
  return NextResponse.json({ id: prospectoId, empresa: existe.empresa, etapa: body.etapa })
}
