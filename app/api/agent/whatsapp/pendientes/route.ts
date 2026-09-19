import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { agruparPorDia, type FilaMensaje } from '@/lib/whatsapp'

export const runtime = 'nodejs'

const TOPE_FILAS = 1000
const TOPE_TEXTO = 600
const TOPE_MENSAJES = 80

// GET /api/agent/whatsapp/pendientes?prospecto_id=&limite=
//
// Las conversaciones de WhatsApp que todavía no están en el CRM, agrupadas por
// prospecto y día, de la más antigua a la más nueva. SOLO LECTURA.
//
// El operador las lee, resume cada una y la registra con
// /api/agent/whatsapp/registrar. Es el equivalente, para WhatsApp, del cotejo
// de correos: sin esto la ficha muestra abandono donde hubo conversación.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const q = new URL(req.url).searchParams
  const prospectoId = q.get('prospecto_id')?.trim() || null
  const limiteRaw = Number(q.get('limite') ?? 20)
  const limite = Number.isFinite(limiteRaw) ? Math.min(Math.max(Math.trunc(limiteRaw), 1), 50) : 20

  const admin = createAdminClient()
  let consulta = admin
    .from('whatsapp_mensajes')
    .select('id, prospecto_id, direccion, tipo, texto, enviado_at')
    .is('procesado_at', null)
    .order('enviado_at', { ascending: true })
    .limit(TOPE_FILAS)
  if (prospectoId) consulta = consulta.eq('prospecto_id', prospectoId)

  const { data, error } = await consulta
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = (data ?? []) as FilaMensaje[]
  let conversaciones = agruparPorDia(filas)
  // Si se topó el límite de filas, el último día puede venir cortado: se deja
  // para la próxima corrida en vez de resumir media conversación.
  const cortado = filas.length === TOPE_FILAS
  if (cortado && conversaciones.length > 1) conversaciones = conversaciones.slice(0, -1)

  const total = conversaciones.length
  conversaciones = conversaciones.slice(0, limite)

  const ids = [...new Set(conversaciones.map(c => c.prospecto_id))]
  const { data: pros } = ids.length
    ? await admin.from('prospectos').select('id, empresa, etapa, origen').in('id', ids)
    : { data: [] }
  const proPor = new Map((pros ?? []).map(p => [(p as { id: string }).id, p as any]))

  const { count: desconocidos } = await admin
    .from('whatsapp_desconocidos').select('telefono', { count: 'exact', head: true }).eq('estado', 'pendiente')

  return NextResponse.json({
    conversaciones: conversaciones.map(c => {
      const p = proPor.get(c.prospecto_id)
      return {
        prospecto_id: c.prospecto_id,
        empresa: p?.empresa ?? null,
        etapa: p?.etapa ?? null,
        fecha: c.fecha,
        enviados: c.enviados,
        recibidos: c.recibidos,
        ultimo_en_hablar: c.ultimo === 'recibido' ? 'ellos' : 'nosotros',
        sin_texto: c.sin_texto,
        truncada: c.mensajes.length > TOPE_MENSAJES,
        mensajes: c.mensajes.slice(0, TOPE_MENSAJES).map(m => ({
          hora: m.hora,
          de: m.direccion === 'recibido' ? 'ellos' : 'nosotros',
          tipo: m.tipo,
          texto: m.texto && m.texto.length > TOPE_TEXTO ? m.texto.slice(0, TOPE_TEXTO) + '…' : m.texto,
        })),
      }
    }),
    total_pendientes: total,
    hay_mas: total > limite || cortado,
    desconocidos_pendientes: desconocidos ?? 0,
  })
}
