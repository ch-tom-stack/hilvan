import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { calcularCascada, minutosAHora } from '@/lib/rodaje-helpers'
import type { RodajeBloque } from '@/types'

export const runtime = 'nodejs'

const ACCIONES = ['reemplazar', 'agregar', 'editar', 'mover', 'eliminar'] as const
type Accion = (typeof ACCIONES)[number]

// POST /api/agent/rodaje-bloques (JSON)
// Escribe el plan de jornada de un rodaje. La HORA de cada bloque nunca se
// escribe: se calcula por cascada desde la hora de call (mover/eliminar un
// bloque reacomoda el resto solo). Invariante que lo garantiza: tras cualquier
// acción, el PRIMER bloque queda anclado a hora_llamado_general (default 08:00)
// y el resto fluye; anclas intermedias puestas por un humano en la app se
// respetan (no se tocan bloques que no estén en la acción).
//
//   { rodaje_id, accion: reemplazar|agregar|editar|mover|eliminar,
//     bloques?,           // reemplazar/agregar: array de {nombre, duracion_min, notas?, departamentos?, personas?}
//     bloque_id?,         // editar/mover/eliminar
//     campos?,            // editar: {nombre?, duracion_min?, notas?}
//     orden? }            // mover: posición destino (0-based)
//
// Robustez: un bloque con duracion_min ausente/no numérica cae a 30 min; un
// departamento o persona que no existe se anota igual como texto (no bloquea).
// Reversible con /deshacer: restaura el plan anterior COMPLETO (snapshot).
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

  const { data: rodaje, error: eRod } = await admin
    .from('rodajes')
    .select('id, hora_llamado_general')
    .eq('id', rodaje_id)
    .single()
  if (eRod || !rodaje) return NextResponse.json({ error: 'Rodaje no encontrado' }, { status: 404 })
  const horaCall = (rodaje.hora_llamado_general as string | null)?.slice(0, 5) || '08:00'

  // Snapshot del plan actual (para deshacer: restaurar COMPLETO).
  const { data: previoRaw, error: ePrev } = await admin
    .from('rodaje_bloques')
    .select('*')
    .eq('rodaje_id', rodaje_id)
    .order('orden')
  if (ePrev) return NextResponse.json({ error: ePrev.message }, { status: 500 })
  const previo = previoRaw ?? []
  // Solo bloques raíz para el reordenamiento (los hijos/paralelos cuelgan de padre_id).
  const raiz = previo.filter((b: any) => !b.padre_id)

  // Nombres de equipo/departamentos del rodaje, para anotar personas/departamentos
  // de un bloque como texto legible (no hay modelo por-bloque en la DB).
  async function resolverNota(bloque: any): Promise<string | null> {
    const partes: string[] = []
    if (Array.isArray(bloque.departamentos) && bloque.departamentos.length > 0) {
      const { data: deps } = await admin
        .from('rodaje_departamentos')
        .select('id, nombre')
        .eq('rodaje_id', rodaje_id)
      const nombres = bloque.departamentos
        .map((d: any) => {
          const s = String(d)
          const hit = (deps ?? []).find((x: any) => x.id === s || x.nombre.toLowerCase() === s.toLowerCase())
          return hit?.nombre ?? s
        })
        .filter(Boolean)
      if (nombres.length) partes.push(`Deptos: ${nombres.join(', ')}`)
    }
    if (Array.isArray(bloque.personas) && bloque.personas.length > 0) {
      const { data: eq } = await admin
        .from('rodaje_equipo_tecnico')
        .select('id, nombre')
        .eq('rodaje_id', rodaje_id)
      const nombres = bloque.personas
        .map((p: any) => {
          const s = String(p)
          const hit = (eq ?? []).find((x: any) => x.id === s || x.nombre.toLowerCase() === s.toLowerCase())
          return hit?.nombre ?? s
        })
        .filter(Boolean)
      if (nombres.length) partes.push(`Con: ${nombres.join(', ')}`)
    }
    return partes.length ? partes.join(' · ') : null
  }

  // Normaliza un bloque de entrada al shape de rodaje_bloques. Nunca revienta:
  // defaults en vez de rechazar el array completo.
  async function normalizar(b: any, orden: number, anclarEn: string | null) {
    const dur = Number.parseInt(String(b?.duracion_min), 10)
    return {
      rodaje_id,
      orden,
      titulo: (typeof b?.nombre === 'string' && b.nombre.trim()) || `Bloque ${orden + 1}`,
      tipo: 'rodaje',
      descripcion: (typeof b?.notas === 'string' && b.notas.trim()) || null,
      nota_previa: await resolverNota(b ?? {}),
      duracion_min: Number.isFinite(dur) && dur >= 0 ? dur : 30,
      hora_inicio_fija: anclarEn,
      es_anclado: anclarEn != null,
      es_paralelo: false,
      visible_equipo: true,
      visible_catering: true,
      visible_extras: false,
      visible_cliente: false,
    }
  }

  // Tras mutar, garantizar que el primer bloque raíz tenga ancla (si ninguno
  // la tiene, la cascada no puede arrancar). No toca anclas intermedias.
  async function asegurarAncla() {
    const { data: actuales } = await admin
      .from('rodaje_bloques')
      .select('id, orden, hora_inicio_fija, padre_id')
      .eq('rodaje_id', rodaje_id)
      .order('orden')
    const raices = (actuales ?? []).filter((b: any) => !b.padre_id)
    if (raices.length === 0) return
    const primero = raices[0]
    if (!primero.hora_inicio_fija) {
      await admin
        .from('rodaje_bloques')
        .update({ hora_inicio_fija: horaCall, es_anclado: true })
        .eq('id', primero.id)
    }
  }

  let resumen: Record<string, unknown> = {}

  if (accion === 'reemplazar' || accion === 'agregar') {
    const entrada = Array.isArray(body?.bloques) ? body.bloques : null
    if (!entrada || entrada.length === 0) {
      return NextResponse.json({ error: 'Falta "bloques" (array no vacío)' }, { status: 400 })
    }

    if (accion === 'reemplazar') {
      const { error: eDel } = await admin.from('rodaje_bloques').delete().eq('rodaje_id', rodaje_id)
      if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 })
      const filas = []
      for (let i = 0; i < entrada.length; i++) {
        filas.push(await normalizar(entrada[i], i, i === 0 ? horaCall : null))
      }
      const { error: eIns } = await admin.from('rodaje_bloques').insert(filas)
      if (eIns) {
        // Restaurar el snapshot para no dejar el plan vacío a medias.
        if (previo.length > 0) await admin.from('rodaje_bloques').insert(previo)
        return NextResponse.json({ error: eIns.message }, { status: 500 })
      }
      resumen = { bloques: filas.length, reemplazados: previo.length }
    } else {
      const base = raiz.length
      const filas = []
      for (let i = 0; i < entrada.length; i++) {
        filas.push(await normalizar(entrada[i], base + i, base === 0 && i === 0 ? horaCall : null))
      }
      const { error: eIns } = await admin.from('rodaje_bloques').insert(filas)
      if (eIns) return NextResponse.json({ error: eIns.message }, { status: 500 })
      resumen = { agregados: filas.length }
    }
  } else {
    const bloque_id = typeof body?.bloque_id === 'string' ? body.bloque_id : ''
    if (!bloque_id) return NextResponse.json({ error: 'Falta bloque_id' }, { status: 400 })
    const actual = previo.find((b: any) => b.id === bloque_id)
    if (!actual) return NextResponse.json({ error: 'bloque_id no encontrado en este rodaje' }, { status: 404 })

    if (accion === 'editar') {
      const c = body?.campos ?? {}
      const update: Record<string, unknown> = {}
      if (typeof c.nombre === 'string' && c.nombre.trim()) update.titulo = c.nombre.trim()
      if (c.duracion_min !== undefined) {
        const dur = Number.parseInt(String(c.duracion_min), 10)
        if (Number.isFinite(dur) && dur >= 0) update.duracion_min = dur
      }
      if (typeof c.notas === 'string') update.descripcion = c.notas.trim() || null
      if (Object.keys(update).length === 0) {
        return NextResponse.json({ error: 'campos no trae nada editable (nombre, duracion_min, notas)' }, { status: 400 })
      }
      const { error } = await admin.from('rodaje_bloques').update(update).eq('id', bloque_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      resumen = { editado: bloque_id, campos: Object.keys(update) }
    } else if (accion === 'mover') {
      const destino = Number.parseInt(String(body?.orden), 10)
      if (!Number.isFinite(destino) || destino < 0) {
        return NextResponse.json({ error: 'Falta "orden" (posición destino, 0-based)' }, { status: 400 })
      }
      const ids = raiz.map((b: any) => b.id)
      const desde = ids.indexOf(bloque_id)
      const hasta = Math.min(destino, ids.length - 1)
      ids.splice(desde, 1)
      ids.splice(hasta, 0, bloque_id)
      for (let i = 0; i < ids.length; i++) {
        const { error } = await admin.from('rodaje_bloques').update({ orden: i }).eq('id', ids[i])
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
      resumen = { movido: bloque_id, a_posicion: hasta }
    } else {
      // eliminar
      const { error } = await admin.from('rodaje_bloques').delete().eq('id', bloque_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      // Compactar el orden de los raíz restantes.
      const restantes = raiz.filter((b: any) => b.id !== bloque_id)
      for (let i = 0; i < restantes.length; i++) {
        if (restantes[i].orden !== i) {
          await admin.from('rodaje_bloques').update({ orden: i }).eq('id', restantes[i].id)
        }
      }
      resumen = { eliminado: bloque_id }
    }
  }

  await asegurarAncla()

  // Plan resultante con horas calculadas (lo que verá el humano).
  const { data: resultadoRaw } = await admin
    .from('rodaje_bloques')
    .select('*')
    .eq('rodaje_id', rodaje_id)
    .order('orden')
  const cascada = calcularCascada((resultadoRaw ?? []) as RodajeBloque[])
  const porId = new Map(cascada.map((c) => [c.id, c]))
  const plan = (resultadoRaw ?? [])
    .filter((b: any) => !b.padre_id)
    .map((b: any) => {
      const c = porId.get(b.id)
      return {
        id: b.id,
        orden: b.orden,
        nombre: b.titulo,
        duracion_min: b.duracion_min ?? null,
        hora_inicio: c?.inicio_min !== undefined ? minutosAHora(c.inicio_min) : null,
        hora_fin: c?.fin_min !== undefined ? minutosAHora(c.fin_min) : null,
      }
    })

  await registrarAccion({
    herramienta: 'rodaje-bloques',
    payload: { rodaje_id, accion, resumen, previo },
    resultado_tabla: 'rodaje_bloques',
    // resultado_id = el rodaje (la acción es multi-fila; el guard genérico de
    // /deshacer exige un id y la rama propia revierte por payload.previo).
    resultado_id: rodaje_id,
    ok: true,
  })

  return NextResponse.json({ ok: true, accion, ...resumen, plan })
}
