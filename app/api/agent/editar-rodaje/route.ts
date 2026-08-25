import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

const ESTADOS = ['borrador', 'confirmado', 'completado']
const HORA_RE = /^\d{2}:\d{2}$/

// POST /api/agent/editar-rodaje (JSON)
// Edita la metadata de un rodaje ya creado. Solo cambia los campos presentes.
//   { rodaje_id, nombre?, fecha?, locacion?, hora_call?, estado?, notas? }
// Reversible con /deshacer (restaura los valores previos, no borra el rodaje).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const rodaje_id = typeof body?.rodaje_id === 'string' ? body.rodaje_id : ''
  if (!rodaje_id) return NextResponse.json({ error: 'Falta rodaje_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: actual, error: eSel } = await admin
    .from('rodajes')
    .select('id, nombre, fecha, locacion_nombre, hora_llamado_general, estado, notas_generales')
    .eq('id', rodaje_id)
    .single()
  if (eSel || !actual) return NextResponse.json({ error: 'Rodaje no encontrado' }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (typeof body.nombre === 'string' && body.nombre.trim()) update.nombre = body.nombre.trim()
  if (body.fecha !== undefined) {
    if (typeof body.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
      return NextResponse.json({ error: 'fecha debe ser YYYY-MM-DD' }, { status: 400 })
    }
    update.fecha = body.fecha
  }
  if (body.locacion !== undefined) {
    update.locacion_nombre = typeof body.locacion === 'string' && body.locacion.trim() ? body.locacion.trim() : null
  }
  if (body.hora_call !== undefined) {
    if (typeof body.hora_call !== 'string' || !HORA_RE.test(body.hora_call.trim())) {
      return NextResponse.json({ error: 'hora_call debe ser HH:MM' }, { status: 400 })
    }
    update.hora_llamado_general = body.hora_call.trim()
  }
  if (body.estado !== undefined) {
    if (!ESTADOS.includes(body.estado)) {
      return NextResponse.json({ error: `estado debe ser: ${ESTADOS.join(', ')}` }, { status: 400 })
    }
    update.estado = body.estado
  }
  if (body.notas !== undefined) {
    update.notas_generales = typeof body.notas === 'string' && body.notas.trim() ? body.notas.trim() : null
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: 'Nada que editar (nombre, fecha, locacion, hora_call, estado, notas)' },
      { status: 400 },
    )
  }

  // Guardar SOLO los valores previos de lo que cambia (para deshacer).
  const previo: Record<string, unknown> = {}
  for (const k of Object.keys(update)) previo[k] = (actual as any)[k] ?? null

  const { error } = await admin.from('rodajes').update(update).eq('id', rodaje_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si cambió la hora de call, re-anclar el PRIMER bloque del plan: las horas
  // de la jornada se calculan en cascada desde el call, así que el plan entero
  // se corre solo. Se guarda el ancla previa para poder deshacer.
  let bloqueAncla: { id: string; hora_inicio_fija: string | null } | null = null
  if (update.hora_llamado_general) {
    const { data: bloques } = await admin
      .from('rodaje_bloques')
      .select('id, orden, hora_inicio_fija, padre_id')
      .eq('rodaje_id', rodaje_id)
      .order('orden')
    const primero = (bloques ?? []).filter((b: any) => !b.padre_id)[0]
    if (primero) {
      bloqueAncla = { id: primero.id, hora_inicio_fija: primero.hora_inicio_fija ?? null }
      await admin
        .from('rodaje_bloques')
        .update({ hora_inicio_fija: update.hora_llamado_general, es_anclado: true })
        .eq('id', primero.id)
    }
  }

  await registrarAccion({
    herramienta: 'editar-rodaje',
    payload: { rodaje_id, cambios: update, previo, ...(bloqueAncla ? { bloque_ancla: bloqueAncla } : {}) },
    resultado_tabla: 'rodajes',
    resultado_id: rodaje_id,
    ok: true,
  })

  return NextResponse.json({ ok: true, rodaje_id, cambios: Object.keys(update) })
}
