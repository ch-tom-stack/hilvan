import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

const ACCIONES = ['agregar', 'editar', 'quitar'] as const
type Accion = (typeof ACCIONES)[number]
const HORA_RE = /^\d{2}:\d{2}$/

// POST /api/agent/rodaje-equipo (JSON)
// Gestiona el equipo técnico de un rodaje (sin equipo no hay citaciones).
//   { rodaje_id, accion: agregar|editar|quitar,
//     personas?,   // agregar: [{colaborador_id?, nombre?, rol, departamento?, llamado?, salida?}]
//     persona_id?, // editar/quitar
//     campos? }    // editar: {nombre?, rol?, departamento?, llamado?, salida?}
//
// - colaborador_id (de hilvan_buscar_colaborador) trae nombre/email/teléfono de
//   la ficha; si la persona aún no existe como colaborador, basta `nombre` suelto.
// - departamento: nombre o id; si no existe en el rodaje se CREA (los grupos
//   ordenan la hoja de llamados). llamado/salida en HH:MM; formato inválido se
//   ignora (nunca revienta).
// NO envía nada. Reversible con /deshacer (restaura el equipo anterior completo).
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
  const accion = body?.accion as Accion
  if (!ACCIONES.includes(accion)) {
    return NextResponse.json({ error: `accion debe ser una de: ${ACCIONES.join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: rodaje } = await admin.from('rodajes').select('id').eq('id', rodaje_id).single()
  if (!rodaje) return NextResponse.json({ error: 'Rodaje no encontrado' }, { status: 404 })

  // Snapshot del equipo actual (para deshacer: restaurar completo).
  const { data: previoRaw } = await admin
    .from('rodaje_equipo_tecnico')
    .select('*')
    .eq('rodaje_id', rodaje_id)
  const previo = previoRaw ?? []

  const hora = (v: unknown): string | null =>
    typeof v === 'string' && HORA_RE.test(v.trim()) ? v.trim() : null

  // departamento (nombre o id) → id en rodaje_departamentos; crea si no existe.
  async function resolverDepto(dep: unknown): Promise<string | null> {
    if (typeof dep !== 'string' || !dep.trim()) return null
    const s = dep.trim()
    const { data: deps } = await admin
      .from('rodaje_departamentos')
      .select('id, nombre, orden')
      .eq('rodaje_id', rodaje_id)
    const hit = (deps ?? []).find((d: any) => d.id === s || d.nombre.toLowerCase() === s.toLowerCase())
    if (hit) return hit.id
    const maxOrden = Math.max(-1, ...(deps ?? []).map((d: any) => d.orden ?? 0))
    const { data: nuevo, error } = await admin
      .from('rodaje_departamentos')
      .insert({ rodaje_id, nombre: s, orden: maxOrden + 1 })
      .select('id')
      .single()
    return error ? null : (nuevo.id as string)
  }

  let resumen: Record<string, unknown> = {}

  if (accion === 'agregar') {
    const personas = Array.isArray(body?.personas) ? body.personas : null
    if (!personas || personas.length === 0) {
      return NextResponse.json({ error: 'Falta "personas" (array no vacío)' }, { status: 400 })
    }
    const filas: any[] = []
    const omitidas: string[] = []
    for (const p of personas) {
      let nombre = typeof p?.nombre === 'string' ? p.nombre.trim() : ''
      let email: string | null = null
      let telefono: string | null = null
      let colaborador_id: string | null = null
      if (typeof p?.colaborador_id === 'string' && p.colaborador_id) {
        const { data: col } = await admin
          .from('colaboradores')
          .select('id, nombre, email, telefono')
          .eq('id', p.colaborador_id)
          .maybeSingle()
        if (col) {
          colaborador_id = col.id
          nombre = nombre || col.nombre
          email = col.email ?? null
          telefono = col.telefono ?? null
        }
      }
      if (!nombre) {
        omitidas.push(JSON.stringify(p).slice(0, 80))
        continue // sin nombre ni colaborador válido no hay a quién citar — se omite, no revienta
      }
      filas.push({
        rodaje_id,
        colaborador_id,
        nombre,
        rol: typeof p?.rol === 'string' && p.rol.trim() ? p.rol.trim() : null,
        email,
        telefono,
        departamento_id: await resolverDepto(p?.departamento),
        hora_llamado_individual: hora(p?.llamado),
        hora_salida_individual: hora(p?.salida),
        es_jefe_departamento: false,
      })
    }
    if (filas.length === 0) {
      return NextResponse.json({ error: 'Ninguna persona válida (todas sin nombre ni colaborador_id)' }, { status: 400 })
    }
    const { data: rows, error } = await admin.from('rodaje_equipo_tecnico').insert(filas).select('id, nombre')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    resumen = { agregadas: rows?.length ?? 0, ...(omitidas.length ? { omitidas } : {}) }
  } else {
    const persona_id = typeof body?.persona_id === 'string' ? body.persona_id : ''
    if (!persona_id) return NextResponse.json({ error: 'Falta persona_id' }, { status: 400 })
    const actual = previo.find((m: any) => m.id === persona_id)
    if (!actual) return NextResponse.json({ error: 'persona_id no encontrada en este rodaje' }, { status: 404 })

    if (accion === 'editar') {
      const c = body?.campos ?? {}
      const update: Record<string, unknown> = {}
      if (typeof c.nombre === 'string' && c.nombre.trim()) update.nombre = c.nombre.trim()
      if (typeof c.rol === 'string') update.rol = c.rol.trim() || null
      if (c.departamento !== undefined) update.departamento_id = await resolverDepto(c.departamento)
      if (c.llamado !== undefined) update.hora_llamado_individual = hora(c.llamado)
      if (c.salida !== undefined) update.hora_salida_individual = hora(c.salida)
      if (Object.keys(update).length === 0) {
        return NextResponse.json({ error: 'campos no trae nada editable (nombre, rol, departamento, llamado, salida)' }, { status: 400 })
      }
      const { error } = await admin.from('rodaje_equipo_tecnico').update(update).eq('id', persona_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      resumen = { editada: persona_id, campos: Object.keys(update) }
    } else {
      // quitar: primero su citación (FK), luego la persona.
      await admin.from('rodaje_citaciones').delete().eq('persona_id', persona_id)
      const { error } = await admin.from('rodaje_equipo_tecnico').delete().eq('id', persona_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      resumen = { quitada: persona_id }
    }
  }

  const { data: equipoFinal } = await admin
    .from('rodaje_equipo_tecnico')
    .select('id, nombre, rol, departamento_id, hora_llamado_individual, hora_salida_individual')
    .eq('rodaje_id', rodaje_id)

  await registrarAccion({
    herramienta: 'rodaje-equipo',
    payload: { rodaje_id, accion, resumen, previo },
    resultado_tabla: 'rodaje_equipo_tecnico',
    // resultado_id = el rodaje (multi-fila; la rama de /deshacer usa payload.previo).
    resultado_id: rodaje_id,
    ok: true,
  })

  return NextResponse.json({ ok: true, accion, ...resumen, equipo: equipoFinal ?? [] })
}
