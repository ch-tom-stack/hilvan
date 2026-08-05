import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

const ESTADOS = ['borrador', 'listo', 'enviado']
const strA = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const arrA = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => (x as string).trim()).filter(Boolean) : []

// GET /api/agent/crm/borrador?prospecto_id=UUID
// Lee la casilla de borradores de respuesta de un prospecto.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const prospectoId = new URL(req.url).searchParams.get('prospecto_id')?.trim()
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('crm_borradores')
    .select('*')
    .eq('prospecto_id', prospectoId)
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prospecto_id: prospectoId, borradores: data ?? [] })
}

// POST /api/agent/crm/borrador
// { prospecto_id, id?, asunto?, cuerpo?, links?[], adjuntos?[], estado?, contacto_id? }
// Crea o actualiza un borrador (autor 'ia'). NO envía nada — solo rellena la casilla.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const prospectoId = strA(body?.prospecto_id)
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const asunto = strA(body?.asunto)
  const cuerpo = strA(body?.cuerpo)
  if (!asunto && !cuerpo) return NextResponse.json({ error: 'El borrador necesita asunto o cuerpo' }, { status: 400 })

  const payload = {
    asunto,
    cuerpo,
    links: arrA(body?.links),
    adjuntos: arrA(body?.adjuntos),
    estado: ESTADOS.includes(body?.estado) ? body.estado : 'borrador',
    contacto_id: strA(body?.contacto_id),
  }

  const admin = createAdminClient()
  const id = strA(body?.id)

  if (id) {
    const { error } = await admin.from('crm_borradores').update(payload).eq('id', id)
    if (error) {
      await registrarAccion({ herramienta: 'crm-borrador', payload: body, ok: false, error: error.message })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    await registrarAccion({ herramienta: 'crm-borrador', payload: body, resultado_tabla: 'crm_borradores', resultado_id: id, ok: true })
    return NextResponse.json({ id, prospecto_id: prospectoId, actualizado: true })
  }

  const { data, error } = await admin
    .from('crm_borradores')
    .insert({ prospecto_id: prospectoId, autor: 'ia', ...payload })
    .select('id')
    .single()
  if (error || !data) {
    await registrarAccion({ herramienta: 'crm-borrador', payload: body, ok: false, error: error?.message })
    return NextResponse.json({ error: error?.message ?? 'No se pudo guardar' }, { status: 500 })
  }
  await registrarAccion({ herramienta: 'crm-borrador', payload: body, resultado_tabla: 'crm_borradores', resultado_id: data.id, ok: true })
  return NextResponse.json({ id: data.id, prospecto_id: prospectoId, creado: true })
}
