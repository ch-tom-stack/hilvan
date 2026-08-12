import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/crm/bitacora?prospecto_id=...
//
// La conversación completa con una marca, en líneas.
//
// `hilvan_interacciones` devuelve filas planas; esto devuelve el diálogo: quién
// dijo qué, a quién, en qué línea y contestando a qué. Sin la dirección, un
// agente que lee la bitácora no distingue "le escribimos tres veces" de "nos
// escribieron tres veces", que son situaciones opuestas.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const prospectoId = new URL(req.url).searchParams.get('prospecto_id')?.trim()
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: p } = await admin
    .from('prospectos')
    .select('id, empresa, etapa, responsable:profiles!prospectos_responsable_id_fkey(id, nombre)')
    .eq('id', prospectoId)
    .maybeSingle<any>()
  if (!p) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  const [{ data: hilos }, { data: msgs }, { data: contactos }, { data: perfiles }] = await Promise.all([
    admin.from('crm_hilos').select('*').eq('prospecto_id', prospectoId).order('abierto_at', { ascending: true }),
    admin.from('crm_interacciones').select('*').eq('prospecto_id', prospectoId)
      .order('fecha', { ascending: true }).order('created_at', { ascending: true }),
    admin.from('crm_contactos').select('id, nombre, cargo, email').eq('prospecto_id', prospectoId),
    admin.from('profiles').select('id, nombre'),
  ])

  const nombreContacto = new Map((contactos ?? []).map((c: any) => [c.id, c.nombre ?? c.email]))
  const nombrePersona = new Map((perfiles ?? []).map((x: any) => [x.id, x.nombre]))

  const aMensaje = (i: any) => ({
    id: i.id,
    fecha: i.fecha,
    direccion: i.direccion ?? 'enviado',
    tipo: i.tipo,
    // Quién habló: nosotros (nombre del emisor) o ellos (nombre del contacto).
    quien: i.direccion === 'recibido'
      ? (nombreContacto.get(i.contacto_id) ?? 'contraparte')
      : (nombrePersona.get(i.enviado_por_id) ?? i.enviado_por ?? 'Casa Hiedra'),
    resumen: i.resumen,
    cuerpo: i.cuerpo,
    responde_a: i.responde_a,
    respondido: i.respondido,
    proximo_paso: i.proximo_paso,
    fecha_proximo: i.fecha_proximo,
    gmail_thread: i.gmail_thread,
    cuenta_cadencia: i.cuenta_cadencia !== false,
  })

  const todos = (msgs ?? []) as any[]
  const lineas = (hilos ?? []).map((h: any) => ({
    hilo_id: h.id,
    titulo: h.titulo,
    con: nombreContacto.get(h.contacto_id) ?? null,
    lleva: nombrePersona.get(h.responsable_id) ?? null,
    abierta: !h.cerrado_at,
    abierto_at: h.abierto_at,
    cerrado_at: h.cerrado_at,
    motivo_cierre: h.motivo_cierre,
    mensajes: todos.filter(i => i.hilo_id === h.id).map(aMensaje),
  }))

  const sueltos = todos.filter(i => !i.hilo_id).map(aMensaje)

  return NextResponse.json({
    prospecto: { id: p.id, empresa: p.empresa, etapa: p.etapa, responsable: p.responsable?.nombre ?? null },
    contactos: contactos ?? [],
    lineas,
    // Mensajes anteriores a los hilos. Son historia real: no se esconden.
    sin_hilo: sueltos,
    total_mensajes: todos.length,
    enviados: todos.filter(i => (i.direccion ?? 'enviado') === 'enviado').length,
    recibidos: todos.filter(i => i.direccion === 'recibido').length,
  })
}
