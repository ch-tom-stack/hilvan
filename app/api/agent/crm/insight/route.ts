import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA } from '@/lib/agent-crm'

export const runtime = 'nodejs'

const TIPOS = new Set(['investigacion', 'lectura', 'literatura'])

// GET  /api/agent/crm/insight?prospecto_id=UUID   → los insights del prospecto
// POST /api/agent/crm/insight { prospecto_id, tipo, titulo, detalle?, fuente? }
//
// El "porqué" del abordaje, visible para Nati y Simón en la ficha. Lo que el
// operador averigua investigando se evaporaba en el chat: recibían el borrador
// sin ver en qué se basaba, así que no podían corregirlo con criterio.

export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const prospectoId = (searchParams.get('prospecto_id') ?? '').trim()
  if (!prospectoId) return NextResponse.json({ error: 'Falta "prospecto_id"' }, { status: 400 })

  const { data, error } = await createAdminClient()
    .from('crm_insights')
    .select('*')
    .eq('prospecto_id', prospectoId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ total: (data ?? []).length, insights: data ?? [] })
}

export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const prospectoId = strA(body?.prospecto_id)
  if (!prospectoId) return NextResponse.json({ error: 'Falta "prospecto_id"' }, { status: 400 })

  const titulo = strA(body?.titulo)
  if (!titulo) return NextResponse.json({ error: 'Falta "titulo"' }, { status: 400 })

  const tipo = (strA(body?.tipo) ?? 'investigacion').toLowerCase()
  if (!TIPOS.has(tipo)) {
    return NextResponse.json({ error: 'tipo debe ser investigacion | lectura | literatura' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existe } = await admin.from('prospectos').select('id').eq('id', prospectoId).maybeSingle()
  if (!existe) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  const { data, error } = await admin
    .from('crm_insights')
    .insert({
      prospecto_id: prospectoId,
      tipo,
      titulo: titulo.slice(0, 200),
      detalle: strA(body?.detalle)?.slice(0, 4000) ?? null,
      fuente: strA(body?.fuente)?.slice(0, 500) ?? null,
    })
    .select('id')
    .single<{ id: string }>()

  if (error || !data) {
    await registrarAccion({ herramienta: 'crm-insight', payload: body, ok: false, error: error?.message })
    return NextResponse.json({ error: error?.message ?? 'No se pudo guardar' }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'crm-insight',
    payload: { prospecto_id: prospectoId, tipo, titulo },
    resultado_tabla: 'crm_insights',
    resultado_id: data.id,
    ok: true,
  })
  return NextResponse.json({ id: data.id, prospecto_id: prospectoId, tipo })
}
