import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { esEtapaValida } from '@/lib/agent-crm'

export const runtime = 'nodejs'

// POST /api/agent/crm/mover-etapa { prospecto_id, etapa }
// Cambia la etapa de un prospecto. Validar transición = etapa permitida.
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

  const { error } = await admin.from('prospectos').update({ etapa: body.etapa }).eq('id', prospectoId)
  if (error) {
    await registrarAccion({ herramienta: 'crm-mover-etapa', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Guardamos etapa_anterior para que hilvan_deshacer pueda restaurarla.
  await registrarAccion({ herramienta: 'crm-mover-etapa', payload: { ...body, etapa_anterior: etapaAnterior }, resultado_tabla: 'prospectos', resultado_id: prospectoId, ok: true })
  return NextResponse.json({ id: prospectoId, empresa: existe.empresa, etapa: body.etapa })
}
