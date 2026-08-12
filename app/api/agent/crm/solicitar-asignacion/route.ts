import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA } from '@/lib/agent-crm'

export const runtime = 'nodejs'

// POST /api/agent/crm/solicitar-asignacion { prospecto_id, para (email), motivo? }
//
// Pide que un prospecto pase a otra persona. NO reasigna: deja una propuesta en
// la Bandeja.
//
// Que la pida el interesado y la resuelva quien ve la carga completa es todo el
// punto: las reglas de reparto existen para que nadie elija su propia carga, y
// una reasignación directa las vaciaría de sentido sin que se notara.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const prospectoId = strA(body?.prospecto_id)
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const paraEmail = strA(body?.para)?.toLowerCase()
  if (!paraEmail) return NextResponse.json({ error: 'Falta "para" (email de quien lo va a llevar)' }, { status: 400 })

  const admin = createAdminClient()

  const { data: p } = await admin
    .from('prospectos')
    .select('id, empresa, responsable_id, responsable:profiles!prospectos_responsable_id_fkey(nombre)')
    .eq('id', prospectoId)
    .maybeSingle<any>()
  if (!p) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  // Se resuelve contra profiles y se falla si no calza: inventar el destinatario
  // por parecido de nombre reasignaría trabajo a la persona equivocada.
  const { data: destino } = await admin
    .from('profiles').select('id, nombre').ilike('email', paraEmail).maybeSingle<any>()
  if (!destino) {
    return NextResponse.json({ error: `No hay ningún usuario con el correo ${paraEmail}` }, { status: 404 })
  }
  if (destino.id === p.responsable_id) {
    return NextResponse.json({ error: `${p.empresa} ya está asignado a ${destino.nombre}` }, { status: 400 })
  }

  const { data: yaHay } = await admin
    .from('crm_aprobaciones').select('id')
    .eq('prospecto_id', prospectoId).eq('tipo', 'reasignacion').eq('estado', 'pendiente')
    .maybeSingle()
  if (yaHay) return NextResponse.json({ error: 'Ya hay una solicitud pendiente para este prospecto' }, { status: 409 })

  const quienPide = strA(body?.pedido_por) ?? destino.nombre

  const { data, error } = await admin.from('crm_aprobaciones').insert({
    tipo: 'reasignacion',
    prospecto_id: prospectoId,
    estado: 'pendiente',
    origen: 'agente',
    payload: {
      empresa: p.empresa,
      hacia_id: destino.id,
      hacia_nombre: destino.nombre,
      desde_id: p.responsable_id,
      desde_nombre: p.responsable?.nombre ?? null,
      pedido_por_nombre: quienPide,
      motivo: strA(body?.motivo),
    },
    nota_agente: `${quienPide} pide que ${p.empresa} pase a ${destino.nombre}.`,
  }).select('id').maybeSingle<{ id: string }>()

  if (error) {
    await registrarAccion({ herramienta: 'crm-solicitar-asignacion', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'crm-solicitar-asignacion', payload: body,
    resultado_tabla: 'crm_aprobaciones', resultado_id: data?.id ?? null, ok: true,
  })

  return NextResponse.json({
    aprobacion_id: data?.id,
    prospecto_id: prospectoId,
    empresa: p.empresa,
    hacia: destino.nombre,
    estado: 'pendiente',
    nota: 'Queda en la Bandeja: la resuelve quien gestiona el reparto.',
  })
}
