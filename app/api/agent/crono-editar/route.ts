import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { cargarCrono, cargarFeriados, serializarCrono } from '@/lib/agent-crono'
import { columnasEtapasDesde, rangoInvertido } from '@/lib/crono'

export const runtime = 'nodejs'

const ESTADOS = ['borrador', 'vigente', 'cerrado']
const CAMPOS_TEXTO = ['cliente', 'responsable', 'notas'] as const

// POST /api/agent/crono-editar (JSON)
//   { crono_id, nombre?, proyecto_id?, cliente?, responsable?, notas?, estado?,
//     etapas?: { desarrollo?: {desde, hasta}, ... } }
// Edita la ficha y/o las etapas. Solo toca lo que viene; una etapa que viene con
// desde/hasta null las borra. Reversible con /deshacer (restaura los valores previos).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const crono_id = typeof body?.crono_id === 'string' ? body.crono_id : ''
  if (!crono_id) return NextResponse.json({ error: 'Falta crono_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: actual, error: eSel } = await admin.from('cronos').select('*').eq('id', crono_id).single()
  if (eSel || !actual) return NextResponse.json({ error: 'Crono no encontrado' }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (typeof body.nombre === 'string' && body.nombre.trim()) update.nombre = body.nombre.trim()
  if (body.proyecto_id !== undefined) {
    if (body.proyecto_id === null || body.proyecto_id === '') update.proyecto_id = null
    else if (typeof body.proyecto_id === 'string') {
      const { data: proy } = await admin.from('proyectos').select('id').eq('id', body.proyecto_id).maybeSingle()
      if (!proy) return NextResponse.json({ error: 'proyecto_id no encontrado' }, { status: 404 })
      update.proyecto_id = body.proyecto_id
    }
  }
  for (const k of CAMPOS_TEXTO) {
    if (body[k] !== undefined) update[k] = typeof body[k] === 'string' && body[k].trim() ? body[k].trim() : null
  }
  if (body.estado !== undefined) {
    if (!ESTADOS.includes(body.estado)) return NextResponse.json({ error: `estado debe ser: ${ESTADOS.join(', ')}` }, { status: 400 })
    update.estado = body.estado
  }
  if (body.etapas !== undefined) {
    const cols = columnasEtapasDesde(body.etapas)
    Object.assign(update, cols)
    for (const k of ['desarrollo', 'pre', 'produccion', 'post'] as const) {
      const d = (update[`${k}_desde`] ?? actual[`${k}_desde`]) as string | null
      const h = (update[`${k}_hasta`] ?? actual[`${k}_hasta`]) as string | null
      if (rangoInvertido(d, h)) return NextResponse.json({ error: `La etapa ${k} termina antes de empezar` }, { status: 400 })
    }
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nada que editar' }, { status: 400 })

  const previo: Record<string, unknown> = {}
  for (const k of Object.keys(update)) previo[k] = actual[k] ?? null

  const { error } = await admin.from('cronos').update(update).eq('id', crono_id)
  if (error) {
    await registrarAccion({ herramienta: 'crono-editar', payload: body, resultado_tabla: 'cronos', resultado_id: crono_id, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const accionId = await registrarAccion({ herramienta: 'crono-editar', payload: { ...body, previo }, resultado_tabla: 'cronos', resultado_id: crono_id, ok: true })
  const [crono, feriados] = await Promise.all([cargarCrono(admin, crono_id), cargarFeriados(admin)])
  return NextResponse.json({ ok: true, accion_id: accionId, cambiados: Object.keys(update), crono: crono ? serializarCrono(crono, feriados) : null })
}
