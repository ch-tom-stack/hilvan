'use server'

// CH-11 CRONOS — server actions del cronograma de proyecto (sql/cronos.sql).
// Lógica pura (fechas, etapas, normalización de hitos) en lib/crono.ts.
// Toda mutación verifica sesión (regla de auditoría, CLAUDE.md).

import { revalidatePath } from 'next/cache'
import { requireSesion } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  columnasEtapasDesde,
  compuertasPorDefecto,
  fechaONull,
  normalizarHito,
  rangoInvertido,
  type HitoEntrada,
} from '@/lib/crono'
import type { Crono, CronoCompuerta, CronoHito, DestinoCompuerta, EstadoCrono, EtapaCrono, Feriado } from '@/types'

const ESTADOS: EstadoCrono[] = ['borrador', 'vigente', 'cerrado']
const UUID_RE = /^[0-9a-f-]{36}$/i

const SELECT_CRONO = `*, proyecto:proyectos(id, nombre, cliente:clientes(id, nombre, empresa)), hitos:crono_hitos(*), compuertas:crono_compuertas(*)`
const DESTINOS: DestinoCompuerta[] = ['pre', 'produccion', 'post', 'cierre']

function ordenarHitos(c: any): Crono {
  const hitos = ((c?.hitos ?? []) as CronoHito[]).slice().sort((a, b) => a.orden - b.orden)
  const compuertas = ((c?.compuertas ?? []) as CronoCompuerta[]).slice().sort((a, b) => a.orden - b.orden)
  return { ...c, hitos, compuertas } as Crono
}

// ─── lecturas ────────────────────────────────────────────────────────────────

export async function getCronos(q?: string): Promise<Crono[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cronos')
    .select(SELECT_CRONO)
    .order('updated_at', { ascending: false })
  if (error) throw error
  let cronos = (data ?? []).map(ordenarHitos)
  if (q && q.trim()) {
    const needle = q.trim().toLowerCase()
    cronos = cronos.filter((c) =>
      c.nombre.toLowerCase().includes(needle) ||
      c.proyecto?.nombre?.toLowerCase().includes(needle) ||
      c.cliente?.toLowerCase().includes(needle) ||
      c.proyecto?.cliente?.nombre?.toLowerCase().includes(needle),
    )
  }
  return cronos
}

export async function getCrono(id: string): Promise<Crono | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('cronos').select(SELECT_CRONO).eq('id', id).single()
  if (error || !data) return null
  return ordenarHitos(data)
}

/** Cronos de un proyecto (para la ficha del proyecto). */
export async function getCronosProyecto(proyectoId: string): Promise<Pick<Crono, 'id' | 'nombre' | 'estado' | 'updated_at'>[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('cronos')
    .select('id, nombre, estado, updated_at')
    .eq('proyecto_id', proyectoId)
    .order('updated_at', { ascending: false })
  return (data ?? []) as Pick<Crono, 'id' | 'nombre' | 'estado' | 'updated_at'>[]
}

export async function getProyectosOpciones(): Promise<{ id: string; nombre: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('proyectos').select('id, nombre').order('nombre')
  return (data ?? []) as { id: string; nombre: string }[]
}

/** Rodajes de un proyecto, para importarlos como hitos tipo `rodaje`. */
export async function getRodajesProyecto(proyectoId: string): Promise<{ id: string; nombre: string; fecha: string | null; estado: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rodajes')
    .select('id, nombre, fecha, estado')
    .eq('proyecto_id', proyectoId)
    .order('fecha', { ascending: true, nullsFirst: false })
  return (data ?? []) as { id: string; nombre: string; fecha: string | null; estado: string }[]
}

// ─── feriados (globales, no del crono) ────────────────────────────────────────

export async function getFeriados(): Promise<Feriado[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('feriados').select('fecha, nombre').order('fecha')
  return (data ?? []) as Feriado[]
}

export async function crearFeriado(fecha: string, nombre: string): Promise<{ error?: string }> {
  await requireSesion()
  const f = fechaONull(fecha)
  const n = nombre?.trim()
  if (!f) return { error: 'Fecha inválida' }
  if (!n) return { error: 'Falta el nombre del feriado' }
  const supabase = await createClient()
  const { error } = await supabase.from('feriados').upsert({ fecha: f, nombre: n }, { onConflict: 'fecha' })
  if (error) return { error: error.message }
  revalidatePath('/cronos')
  return {}
}

export async function eliminarFeriado(fecha: string): Promise<{ error?: string }> {
  await requireSesion()
  const f = fechaONull(fecha)
  if (!f) return { error: 'Fecha inválida' }
  const supabase = await createClient()
  const { error } = await supabase.from('feriados').delete().eq('fecha', f)
  if (error) return { error: error.message }
  revalidatePath('/cronos')
  return {}
}

// ─── escrituras ──────────────────────────────────────────────────────────────

export async function crearCrono(datos: { nombre: string; proyecto_id?: string | null }): Promise<{ id?: string; error?: string }> {
  await requireSesion()
  const nombre = datos.nombre?.trim()
  if (!nombre) return { error: 'Falta el nombre' }
  const proyecto_id = datos.proyecto_id && UUID_RE.test(datos.proyecto_id) ? datos.proyecto_id : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('cronos')
    .insert({ nombre, proyecto_id, created_by: user?.id ?? null })
    .select('id')
    .single()
  if (error || !data) return { error: error?.message ?? 'No se pudo crear el crono' }

  // Compuertas sugeridas (todas manuales al nacer sin hitos; se vuelven automáticas
  // al asociarles un hito). Si falla, el crono igual existe: se avisa por consola.
  const { error: eC } = await supabase.from('crono_compuertas').insert(compuertasPorDefecto([]).map((c) => ({ ...c, crono_id: data.id })))
  if (eC) console.error('[cronos] no se pudieron sembrar las compuertas:', eC.message)

  revalidatePath('/cronos')
  if (proyecto_id) revalidatePath(`/proyectos/${proyecto_id}`)
  return { id: data.id as string }
}

export interface GuardarCronoPayload {
  nombre: string
  proyecto_id: string | null
  cliente: string
  responsable: string
  notas: string
  estado: EstadoCrono
  etapas: Record<EtapaCrono, { desde: string; hasta: string }>
  /** Estado COMPLETO de los hitos (los nuevos traen id generado en el cliente). El orden del array es `orden`. */
  hitos: unknown[]
  /** ids de hitos que se quitaron en el editor. */
  eliminar: string[]
  /** Estado COMPLETO de las compuertas (ids generados en el cliente para las nuevas). */
  compuertas?: unknown[]
  eliminar_compuertas?: string[]
}

interface CompuertaEntrada {
  id: string
  destino: DestinoCompuerta
  texto: string
  hito_id: string | null
  responsable: string | null
  hecho: boolean
}

function normalizarCompuerta(v: unknown): CompuertaEntrada | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  const id = typeof o.id === 'string' && UUID_RE.test(o.id) ? o.id : null
  const destino = DESTINOS.includes(o.destino as DestinoCompuerta) ? (o.destino as DestinoCompuerta) : null
  const texto = typeof o.texto === 'string' ? o.texto.trim() : ''
  if (!id || !destino || !texto) return null
  return {
    id,
    destino,
    texto,
    hito_id: typeof o.hito_id === 'string' && UUID_RE.test(o.hito_id) ? o.hito_id : null,
    responsable: typeof o.responsable === 'string' && o.responsable.trim() ? o.responsable.trim() : null,
    hecho: o.hecho === true,
  }
}

/**
 * Guarda el crono completo: ficha + etapas + hitos. Parsea y valida TODO antes
 * de la primera escritura; verifica el error de cada paso (regla de auditoría).
 * Orden: update ficha → upsert hitos → delete quitados — nunca borra antes de
 * insertar, así un fallo a mitad deja el crono completo, no vacío.
 */
export async function guardarCrono(id: string, payload: GuardarCronoPayload): Promise<{ crono?: Crono; error?: string }> {
  await requireSesion()
  if (!UUID_RE.test(id)) return { error: 'id inválido' }

  const nombre = payload.nombre?.trim()
  if (!nombre) return { error: 'Falta el nombre' }
  const estado = ESTADOS.includes(payload.estado) ? payload.estado : 'borrador'
  const proyecto_id = payload.proyecto_id && UUID_RE.test(payload.proyecto_id) ? payload.proyecto_id : null

  const cols = columnasEtapasDesde(payload.etapas)
  for (const [k, v] of Object.entries(cols)) {
    if (k.endsWith('_desde')) {
      const hasta = cols[k.replace('_desde', '_hasta') as keyof typeof cols] ?? null
      if (rangoInvertido(v, hasta)) return { error: `La etapa ${k.replace('_desde', '')} termina antes de empezar` }
    }
  }

  const hitos: HitoEntrada[] = Array.isArray(payload.hitos) ? payload.hitos.map(normalizarHito) : []
  for (const h of hitos) {
    if (!h.id) return { error: 'Cada hito necesita un id' }
  }
  const eliminar = Array.isArray(payload.eliminar) ? payload.eliminar.filter((x) => typeof x === 'string' && UUID_RE.test(x)) : []
  const compuertas = Array.isArray(payload.compuertas) ? payload.compuertas.map(normalizarCompuerta) : null
  if (compuertas && compuertas.some((c) => c === null)) return { error: 'Hay un check sin texto o sin destino' }
  const eliminarCompuertas = Array.isArray(payload.eliminar_compuertas) ? payload.eliminar_compuertas.filter((x) => typeof x === 'string' && UUID_RE.test(x)) : []
  const idsHitos = new Set(hitos.map((h) => h.id))

  const supabase = await createClient()

  const { error: e1 } = await supabase
    .from('cronos')
    .update({
      nombre,
      proyecto_id,
      cliente: payload.cliente?.trim() || null,
      responsable: payload.responsable?.trim() || null,
      notas: payload.notas?.trim() || null,
      estado,
      ...cols,
    })
    .eq('id', id)
  if (e1) return { error: e1.message }

  if (hitos.length > 0) {
    const filas = hitos.map((h, i) => ({
      id: h.id,
      crono_id: id,
      orden: i,
      tipo: h.tipo,
      titulo: h.titulo,
      fecha: h.fecha,
      fecha_fin: h.fecha_fin,
      etapa: h.etapa,
      monto: h.monto,
      notas: h.notas,
      responsable: h.responsable,
      destacado: h.destacado,
      hecho: h.hecho,
      rodaje_id: h.rodaje_id,
    }))
    const { error: e2 } = await supabase.from('crono_hitos').upsert(filas, { onConflict: 'id' })
    if (e2) return { error: e2.message }
  }

  if (eliminar.length > 0) {
    const { error: e3 } = await supabase.from('crono_hitos').delete().eq('crono_id', id).in('id', eliminar)
    if (e3) return { error: e3.message }
  }

  if (compuertas && compuertas.length > 0) {
    const filasC = (compuertas as CompuertaEntrada[]).map((c, i) => ({
      id: c.id,
      crono_id: id,
      destino: c.destino,
      orden: i,
      texto: c.texto,
      // un hito_id que apunte a un hito recién quitado cae a manual
      hito_id: c.hito_id && idsHitos.has(c.hito_id) ? c.hito_id : null,
      responsable: c.responsable,
      hecho: c.hecho,
    }))
    const { error: e4 } = await supabase.from('crono_compuertas').upsert(filasC, { onConflict: 'id' })
    if (e4) return { error: e4.message }
  }
  if (eliminarCompuertas.length > 0) {
    const { error: e5 } = await supabase.from('crono_compuertas').delete().eq('crono_id', id).in('id', eliminarCompuertas)
    if (e5) return { error: e5.message }
  }

  revalidatePath('/cronos')
  revalidatePath(`/cronos/${id}`)
  if (proyecto_id) revalidatePath(`/proyectos/${proyecto_id}`)
  const crono = await getCrono(id)
  return crono ? { crono } : { error: 'Guardado, pero no se pudo releer el crono' }
}

export async function eliminarCrono(id: string): Promise<{ error?: string }> {
  await requireSesion()
  if (!UUID_RE.test(id)) return { error: 'id inválido' }
  const supabase = await createClient()
  const { data: previo } = await supabase.from('cronos').select('proyecto_id').eq('id', id).maybeSingle()
  const { error } = await supabase.from('cronos').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/cronos')
  if (previo?.proyecto_id) revalidatePath(`/proyectos/${previo.proyecto_id}`)
  return {}
}

/**
 * Crea hitos tipo `rodaje` a partir de los rodajes del proyecto del crono que
 * todavía no están vinculados (por `rodaje_id`). Devuelve el crono fresco.
 */
export async function importarRodajesAlCrono(id: string): Promise<{ crono?: Crono; creados?: number; error?: string }> {
  await requireSesion()
  const crono = await getCrono(id)
  if (!crono) return { error: 'Crono no encontrado' }
  if (!crono.proyecto_id) return { error: 'El crono no tiene proyecto: no hay rodajes que importar' }

  const rodajes = await getRodajesProyecto(crono.proyecto_id)
  const yaVinculados = new Set((crono.hitos ?? []).map((h) => h.rodaje_id).filter(Boolean))
  const nuevos = rodajes.filter((r) => !yaVinculados.has(r.id))
  if (nuevos.length === 0) return { crono, creados: 0 }

  const base = crono.hitos?.length ?? 0
  const supabase = await createClient()
  const { error } = await supabase.from('crono_hitos').insert(
    nuevos.map((r, i) => ({
      crono_id: id,
      orden: base + i,
      tipo: 'rodaje',
      titulo: r.nombre,
      fecha: fechaONull(r.fecha),
      etapa: 'produccion',
      rodaje_id: r.id,
    })),
  )
  if (error) return { error: error.message }

  revalidatePath(`/cronos/${id}`)
  const fresco = await getCrono(id)
  return fresco ? { crono: fresco, creados: nuevos.length } : { error: 'Importado, pero no se pudo releer el crono' }
}
