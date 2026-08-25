import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { esRolPersona } from '@/lib/rodaje-helpers'

export const runtime = 'nodejs'

const HORA_RE = /^\d{2}:\d{2}$/

// POST /api/agent/crear-rodaje (JSON)
// Crea un rodaje SIN depender de una cotización (a diferencia de sembrar-rodaje).
//   { nombre, fecha, locacion?, proyecto_id?, cotizacion_id?, hora_call?, notas? }
//
// - Sin cotizacion_id: rodaje VACÍO — sin departamentos heredados y SIN el plan
//   esqueleto (el esqueleto sirve a un humano que parte de cero; un agente trae
//   el plan completo y lo carga después con /rodaje-bloques).
// - Con cotizacion_id: hereda departamentos + equipo desde la cotización (igual
//   que sembrar-rodaje), pero tampoco crea bloques.
// Reversible con /deshacer (borra el rodaje completo en cascada).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre) return NextResponse.json({ error: 'Falta "nombre"' }, { status: 400 })
  const fecha = typeof body?.fecha === 'string' ? body.fecha.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'fecha debe ser YYYY-MM-DD' }, { status: 400 })
  }
  const locacion = typeof body?.locacion === 'string' && body.locacion.trim() ? body.locacion.trim() : null
  const notas = typeof body?.notas === 'string' && body.notas.trim() ? body.notas.trim() : null
  const hora_call =
    typeof body?.hora_call === 'string' && HORA_RE.test(body.hora_call.trim())
      ? body.hora_call.trim()
      : '08:00'
  const proyecto_id_body = typeof body?.proyecto_id === 'string' && body.proyecto_id ? body.proyecto_id : null
  const cotizacion_id = typeof body?.cotizacion_id === 'string' && body.cotizacion_id ? body.cotizacion_id : null

  const admin = createAdminClient()

  // Con cotización: cargarla para heredar proyecto/departamentos/equipo.
  let cot: any = null
  if (cotizacion_id) {
    const { data, error } = await admin
      .from('cotizaciones')
      .select(`
        id, nombre, proyecto_id,
        grupo:cotizacion_grupos(proyecto_id),
        departamentos:cotizacion_departamentos(
          id, nombre, orden,
          subgrupos:cotizacion_subgrupos(items:cotizacion_items(id, nombre, tipo, orden)),
          items:cotizacion_items(id, nombre, tipo, orden, subgrupo_id)
        )
      `)
      .eq('id', cotizacion_id)
      .single()
    if (error || !data) {
      return NextResponse.json({ error: 'cotizacion_id no encontrado' }, { status: 404 })
    }
    cot = data
  }
  if (proyecto_id_body) {
    const { data: proy } = await admin.from('proyectos').select('id').eq('id', proyecto_id_body).maybeSingle()
    if (!proy) return NextResponse.json({ error: 'proyecto_id no encontrado' }, { status: 404 })
  }

  const proyecto_id = proyecto_id_body ?? cot?.proyecto_id ?? (cot?.grupo as any)?.proyecto_id ?? null

  // ── 1) Crear el rodaje (borrador) ─────────────────────────────────────────
  const { data: rodaje, error: rodajeError } = await admin
    .from('rodajes')
    .insert({
      nombre,
      fecha,
      proyecto_id,
      cotizacion_id,
      locacion_nombre: locacion,
      hora_llamado_general: hora_call,
      notas_generales: notas,
      estado: 'borrador',
    })
    .select('id')
    .single()
  if (rodajeError || !rodaje) {
    await registrarAccion({
      herramienta: 'crear-rodaje',
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

  async function abortar(msg: string) {
    await registrarAccion({
      herramienta: 'crear-rodaje',
      payload: { ...body, parcial: true, error: msg },
      resultado_tabla: 'rodajes',
      resultado_id: rodajeId,
      ok: true,
    })
    return NextResponse.json({ error: msg, rodaje_id: rodajeId }, { status: 500 })
  }

  // ── 2) Herencia desde la cotización (solo si vino) — sin bloques ──────────
  let deptosCreados = 0
  let equipoCreado = 0
  if (cot) {
    const depsCot = [...((cot.departamentos as any[]) ?? [])].sort(
      (a, b) => (a.orden ?? 0) - (b.orden ?? 0),
    )
    const deptoRodajePorNombre = new Map<string, string>()
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

    const miembros: { rodaje_id: string; departamento_id: string | null; nombre: string; rol: string }[] = []
    for (const dep of depsCot) {
      const deptoRodajeId = deptoRodajePorNombre.get(dep.nombre) ?? null
      const directos = ((dep.items as any[]) ?? []).filter((i) => i.subgrupo_id === null)
      const deSubgrupos = ((dep.subgrupos as any[]) ?? []).flatMap((sg) => (sg.items as any[]) ?? [])
      for (const item of [...directos, ...deSubgrupos]) {
        const n = (item.nombre as string | null)?.trim()
        if (!n || !esRolPersona(n)) continue
        miembros.push({ rodaje_id: rodajeId, departamento_id: deptoRodajeId, nombre: n, rol: n })
      }
    }
    if (miembros.length > 0) {
      const { data: rows, error: eM } = await admin
        .from('rodaje_equipo_tecnico')
        .insert(miembros)
        .select('id')
      if (eM) return abortar(eM.message)
      equipoCreado = rows?.length ?? 0
    }
  }

  const creado = { departamentos: deptosCreados, equipo: equipoCreado, bloques: 0 }
  await registrarAccion({
    herramienta: 'crear-rodaje',
    payload: { ...body, creado },
    resultado_tabla: 'rodajes',
    resultado_id: rodajeId,
    ok: true,
  })

  return NextResponse.json({
    rodaje_id: rodajeId,
    estado: 'borrador',
    hora_call,
    creado,
    url: `/rodaje/${rodajeId}`,
  })
}
