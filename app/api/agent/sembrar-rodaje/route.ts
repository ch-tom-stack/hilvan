import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { PLANTILLAS_BLOQUES } from '@/types'

export const runtime = 'nodejs'

// Tipos de ítem de cotización que representan PERSONAS del crew (no equipos/servicios).
const TIPOS_PERSONA = new Set(['rol', 'cast'])

// Plan esqueleto: labels de PLANTILLAS_BLOQUES en el orden que arma una jornada base.
const PLAN_ESQUELETO = ['CALL', 'PRE SET', 'ALMUERZO', 'DESMONTAJE', 'CIERRE']

// POST /api/agent/sembrar-rodaje (JSON: { cotizacion_id, nombre?, fecha? })
// Crea un BORRADOR de rodaje a partir de una cotización:
//   - rodajes (estado 'borrador', proyecto_id + cotizacion_id heredados)
//   - rodaje_departamentos desde cotizacion_departamentos
//   - rodaje_equipo_tecnico desde los ítems persona (tipo rol/cast)
//   - rodaje_bloques: plan esqueleto desde PLANTILLAS_BLOQUES
// Mejor esfuerzo: el humano refina después. Reversible con /deshacer (borra el rodaje completo).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { cotizacion_id, nombre, fecha } = body ?? {}
  if (!cotizacion_id || typeof cotizacion_id !== 'string') {
    return NextResponse.json({ error: 'Falta cotizacion_id' }, { status: 400 })
  }
  if (fecha != null && typeof fecha !== 'string') {
    return NextResponse.json({ error: 'fecha debe ser YYYY-MM-DD' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Cargar la cotización completa (debe existir) ──────────────────────────
  const { data: cot, error: cotError } = await admin
    .from('cotizaciones')
    .select(`
      id, nombre, proyecto_id,
      grupo:cotizacion_grupos(proyecto_id),
      departamentos:cotizacion_departamentos(
        id, nombre, orden,
        subgrupos:cotizacion_subgrupos(
          items:cotizacion_items(id, nombre, tipo, orden)
        ),
        items:cotizacion_items(id, nombre, tipo, orden, subgrupo_id)
      )
    `)
    .eq('id', cotizacion_id)
    .single()

  if (cotError || !cot) {
    return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
  }

  const proyecto_id =
    (cot.proyecto_id as string | null) ??
    ((cot.grupo as any)?.proyecto_id as string | null) ??
    null

  const nombreRodaje =
    (typeof nombre === 'string' && nombre.trim()) || (cot.nombre as string) || 'Rodaje sin nombre'

  // ── 1) Crear el rodaje (borrador) ─────────────────────────────────────────
  const { data: rodaje, error: rodajeError } = await admin
    .from('rodajes')
    .insert({
      nombre: nombreRodaje,
      fecha: fecha || null,
      proyecto_id,
      cotizacion_id,
      estado: 'borrador',
    })
    .select('id')
    .single()

  if (rodajeError || !rodaje) {
    await registrarAccion({
      herramienta: 'sembrar-rodaje',
      payload: body,
      ok: false,
      error: rodajeError?.message ?? 'No se pudo crear el rodaje',
    })
    return NextResponse.json(
      { error: rodajeError?.message ?? 'No se pudo crear el rodaje' },
      { status: 500 },
    )
  }

  const rodajeId = rodaje.id as string

  // Helper: ante un fallo posterior, el rodaje YA existe en DB. Registramos la
  // acción como reversible (ok: true, con nota de error) para que el usuario pueda
  // deshacer y borrar lo creado hasta ahora; devolvemos 500 con el rodaje_id.
  async function abortar(msg: string) {
    await registrarAccion({
      herramienta: 'sembrar-rodaje',
      payload: { ...body, parcial: true, error: msg },
      resultado_tabla: 'rodajes',
      resultado_id: rodajeId,
      ok: true,
    })
    return NextResponse.json({ error: msg, rodaje_id: rodajeId }, { status: 500 })
  }

  // ── 2) Departamentos desde cotizacion_departamentos ───────────────────────
  const depsCot = [...((cot.departamentos as any[]) ?? [])].sort(
    (a, b) => (a.orden ?? 0) - (b.orden ?? 0),
  )

  // mapa: nombre depto (cotización) → id depto (rodaje) para asociar el equipo
  const deptoRodajePorNombre = new Map<string, string>()
  let deptosCreados = 0

  for (let i = 0; i < depsCot.length; i++) {
    const dep = depsCot[i]
    const { data: depRow, error: depError } = await admin
      .from('rodaje_departamentos')
      .insert({ rodaje_id: rodajeId, nombre: dep.nombre, orden: i })
      .select('id')
      .single()
    if (depError || !depRow) return abortar(depError?.message ?? 'Error creando departamento')
    deptoRodajePorNombre.set(dep.nombre, depRow.id as string)
    deptosCreados++
  }

  // ── 3) Equipo técnico desde los ítems persona (tipo rol/cast) ─────────────
  type NuevoMiembro = { rodaje_id: string; departamento_id: string | null; nombre: string; rol: string }
  const miembros: NuevoMiembro[] = []

  for (const dep of depsCot) {
    const deptoRodajeId = deptoRodajePorNombre.get(dep.nombre) ?? null
    const itemsDirectos = ((dep.items as any[]) ?? []).filter(
      (i) => i.subgrupo_id === null,
    )
    const itemsSubgrupos = ((dep.subgrupos as any[]) ?? []).flatMap(
      (sg) => (sg.items as any[]) ?? [],
    )
    for (const item of [...itemsDirectos, ...itemsSubgrupos]) {
      if (!TIPOS_PERSONA.has(item.tipo)) continue
      const nombreItem = (item.nombre as string | null)?.trim()
      if (!nombreItem) continue
      // nombre del item = rol; nombre del miembro queda como el rol (placeholder
      // editable por el humano, ya que la cotización no trae nombre de persona).
      miembros.push({
        rodaje_id: rodajeId,
        departamento_id: deptoRodajeId,
        nombre: nombreItem,
        rol: nombreItem,
      })
    }
  }

  let equipoCreado = 0
  if (miembros.length > 0) {
    const { data: miembrosRows, error: miembrosError } = await admin
      .from('rodaje_equipo_tecnico')
      .insert(miembros)
      .select('id')
    if (miembrosError) return abortar(miembrosError.message)
    equipoCreado = miembrosRows?.length ?? 0
  }

  // ── 4) Plan esqueleto de bloques desde PLANTILLAS_BLOQUES ──────────────────
  const bloques = PLAN_ESQUELETO.map((label, idx) => {
    const p = PLANTILLAS_BLOQUES.find((pl) => pl.label === label)!
    return {
      rodaje_id: rodajeId,
      orden: idx,
      titulo: p.titulo,
      tipo: p.tipo,
      scenes_label: p.label,
      scenes_color: p.scenes_color,
      dia_noche: p.dia_noche,
      interior_exterior: p.interior_exterior,
      duracion_min: p.duracion_min,
    }
  })

  const { data: bloquesRows, error: bloquesError } = await admin
    .from('rodaje_bloques')
    .insert(bloques)
    .select('id')
  if (bloquesError) return abortar(bloquesError.message)
  const bloquesCreados = bloquesRows?.length ?? 0

  // ── Auditoría OK (reversible: borra el rodaje completo) ───────────────────
  const creado = { departamentos: deptosCreados, equipo: equipoCreado, bloques: bloquesCreados }
  await registrarAccion({
    herramienta: 'sembrar-rodaje',
    payload: { ...body, creado },
    resultado_tabla: 'rodajes',
    resultado_id: rodajeId,
    ok: true,
  })

  return NextResponse.json({
    rodaje_id: rodajeId,
    estado: 'borrador',
    creado,
    url: `/rodaje/${rodajeId}`,
  })
}
