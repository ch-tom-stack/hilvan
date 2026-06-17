import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA, FORMATO_FECHA } from '@/lib/agent-crm'

export const runtime = 'nodejs'

// POST /api/agent/crm/lectura { prospecto_id, url?, dossier_ref?, producto_derivado?, fecha? }
// Guarda "La Lectura" y aplica la heurística E7: feed→banco, temporadas→lookbook.
// Si el prospecto no tiene producto/arquetipo definido los completa y avanza a
// lectura_entregada.
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

  const fecha = strA(body?.fecha)
  if (fecha && !FORMATO_FECHA.test(fecha)) return NextResponse.json({ error: 'fecha inválida (YYYY-MM-DD)' }, { status: 400 })

  const prod = strA(body?.producto_derivado)

  const admin = createAdminClient()
  const { data: prospecto } = await admin
    .from('prospectos')
    .select('id, arquetipo, producto_objetivo, etapa')
    .eq('id', prospectoId)
    .maybeSingle<{ id: string; arquetipo: string | null; producto_objetivo: string | null; etapa: string }>()
  if (!prospecto) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  const { data, error } = await admin
    .from('crm_lecturas')
    .insert({ prospecto_id: prospectoId, url: strA(body?.url), dossier_ref: strA(body?.dossier_ref), producto_derivado: prod, fecha })
    .select('id')
    .single()
  if (error || !data) {
    await registrarAccion({ herramienta: 'crm-lectura', payload: body, ok: false, error: error?.message })
    return NextResponse.json({ error: error?.message ?? 'No se pudo registrar la lectura' }, { status: 500 })
  }

  // ── Heurística E7 ───────────────────────────────────────────────────────────
  const patch: Record<string, string> = {}
  if (prod && (!prospecto.producto_objetivo || prospecto.producto_objetivo === 'sin_definir')) patch.producto_objetivo = prod
  if (!prospecto.arquetipo || prospecto.arquetipo === 'sin_definir') {
    if (prod === 'banco') patch.arquetipo = 'feed'
    else if (prod === 'lookbook') patch.arquetipo = 'temporadas'
  }
  if (prospecto.etapa === 'prospecto' || prospecto.etapa === 'calificado') patch.etapa = 'lectura_entregada'
  if (Object.keys(patch).length) await admin.from('prospectos').update(patch).eq('id', prospectoId)

  await registrarAccion({ herramienta: 'crm-lectura', payload: body, resultado_tabla: 'crm_lecturas', resultado_id: data.id, ok: true })
  return NextResponse.json({ id: data.id, prospecto_id: prospectoId, aplicado: patch })
}
