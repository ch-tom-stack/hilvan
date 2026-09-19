import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA } from '@/lib/agent-crm'
import { resolverDesconocido } from '@/lib/whatsapp-io'

export const runtime = 'nodejs'

// La cuarentena de WhatsApp: números que escribieron (o a los que escribimos) y
// que no calzan con ningún prospecto ni contacto. Acá NO hay contenido: solo
// el número, el nombre de perfil y las fechas. Se purga sola a los 30 días.
//
// GET  → los que esperan decisión.
// POST { telefono, accion: 'vincular', prospecto_id, nombre? }
//        El número es de ese prospecto. Desde ahora sus mensajes se guardan; lo
//        que escribió ANTES no se recupera (nunca se guardó).
// POST { telefono, accion: 'ignorar' }
//        No es venta. No se vuelve a preguntar por él.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { data, error } = await createAdminClient()
    .from('whatsapp_desconocidos')
    .select('telefono, nombre_perfil, primer_mensaje, ultimo_mensaje, mensajes')
    .eq('estado', 'pendiente')
    .order('ultimo_mensaje', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ desconocidos: data ?? [] })
}

export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const accion = strA(body?.accion)
  if (accion !== 'vincular' && accion !== 'ignorar') {
    return NextResponse.json({ error: 'accion debe ser "vincular" o "ignorar"' }, { status: 400 })
  }

  const res = await resolverDesconocido(createAdminClient(), {
    telefono: strA(body?.telefono) ?? '', accion,
    prospecto_id: strA(body?.prospecto_id), nombre: strA(body?.nombre),
  })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })

  // resultado_id es uuid y la cuarentena se identifica por teléfono: el deshacer
  // de esta herramienta trabaja desde el payload, no desde resultado_id.
  await registrarAccion({
    herramienta: 'whatsapp-desconocido',
    payload: { ...body, ...res.auditoria },
    resultado_tabla: 'whatsapp_desconocidos', resultado_id: res.prospecto_id, ok: true,
  })
  return NextResponse.json(res.respuesta)
}
