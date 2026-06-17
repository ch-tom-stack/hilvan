import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/crm/brief { prospecto_id, nota_agente? }
// Genera un brief estratégico desde los datos del prospecto y lo deja como
// PROPUESTA (tipo brief_cotizacion) en la Bandeja. NUNCA deriva solo: la
// derivación al flujo de cotizaciones ocurre al aprobar (F5).
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

  const admin = createAdminClient()
  const { data: p } = await admin
    .from('prospectos')
    .select('id, empresa, nombre_contacto, decisor, angulo, arquetipo, producto_objetivo, etapa, cliente_id')
    .eq('id', prospectoId)
    .maybeSingle()
  if (!p) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  const { data: lecturas } = await admin
    .from('crm_lecturas')
    .select('url, dossier_ref, producto_derivado, fecha')
    .eq('prospecto_id', prospectoId)
    .order('fecha', { ascending: false })

  const brief = {
    empresa: p.empresa,
    contacto: p.nombre_contacto,
    decisor: p.decisor,
    angulo: p.angulo,
    arquetipo: p.arquetipo,
    producto_objetivo: p.producto_objetivo,
    cliente_id: p.cliente_id,
    lectura: lecturas?.[0] ?? null,
  }

  const { data, error } = await admin
    .from('crm_aprobaciones')
    .insert({
      tipo: 'brief_cotizacion',
      prospecto_id: prospectoId,
      payload: brief,
      estado: 'pendiente',
      origen: 'agente',
      nota_agente: typeof body?.nota_agente === 'string' ? body.nota_agente : null,
    })
    .select('id')
    .single()
  if (error || !data) {
    await registrarAccion({ herramienta: 'crm-brief', payload: body, ok: false, error: error?.message })
    return NextResponse.json({ error: error?.message ?? 'No se pudo crear el brief' }, { status: 500 })
  }

  await registrarAccion({ herramienta: 'crm-brief', payload: body, resultado_tabla: 'crm_aprobaciones', resultado_id: data.id, ok: true })
  return NextResponse.json({ propuesta_id: data.id, estado: 'pendiente', brief, mensaje: 'Brief dejado en la Bandeja. Requiere aprobación para derivar a cotización.' })
}
