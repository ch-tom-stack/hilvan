// lib/agent-categorias.ts
// Categorías de una cotización por NOMBRE o por id, para las herramientas del
// agente. Antes había que pasar el UUID exacto y un nombre reventaba con
// "invalid input syntax for type uuid".

import type { SupabaseClient } from '@supabase/supabase-js'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const normalizarNombre = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

export type Nivel = 'departamento' | 'subgrupo'
export const tablaDeNivel = (nivel: Nivel) => (nivel === 'subgrupo' ? 'cotizacion_subgrupos' : 'cotizacion_departamentos')

export interface Categoria { id: string; nombre: string; cotizacion_id: string; departamento_id?: string | null }

export type Resuelta = { ok: true; fila: Categoria } | { ok: false; status: number; error: string }

/**
 * Resuelve `ref` (uuid o nombre) a UNA categoría. Por nombre exige cotizacion_id
 * (los nombres se repiten entre cotizaciones) y, para sub-grupos, acota al
 * departamento si se indica. Un nombre que calza con dos devuelve error con los
 * ids: elegir uno al azar dejaría el cambio en la categoría equivocada.
 */
export async function resolverCategoria(
  admin: SupabaseClient,
  nivel: Nivel,
  ref: unknown,
  opts: { cotizacionId?: string | null; departamentoId?: string | null } = {},
): Promise<Resuelta> {
  const r = typeof ref === 'string' ? ref.trim() : ''
  if (!r) return { ok: false, status: 400, error: `Falta ${nivel} (id o nombre)` }
  const tabla = tablaDeNivel(nivel)
  const cols = nivel === 'subgrupo' ? 'id, nombre, cotizacion_id, departamento_id' : 'id, nombre, cotizacion_id'

  if (UUID_RE.test(r)) {
    const { data, error } = await admin.from(tabla).select(cols).eq('id', r).maybeSingle()
    if (error) return { ok: false, status: 500, error: error.message }
    if (!data) return { ok: false, status: 404, error: `${nivel} ${r} no encontrado` }
    const fila = data as unknown as Categoria
    if (opts.cotizacionId && fila.cotizacion_id !== opts.cotizacionId) {
      return { ok: false, status: 400, error: `${nivel} ${r} pertenece a otra cotización` }
    }
    return { ok: true, fila }
  }

  if (!opts.cotizacionId) {
    return { ok: false, status: 400, error: `Para buscar el ${nivel} por nombre ("${r}") indica cotizacion_id` }
  }
  let q = admin.from(tabla).select(cols).eq('cotizacion_id', opts.cotizacionId)
  if (nivel === 'subgrupo' && opts.departamentoId) q = q.eq('departamento_id', opts.departamentoId)
  const { data, error } = await q
  if (error) return { ok: false, status: 500, error: error.message }
  const todas = (data ?? []) as unknown as Categoria[]
  const n = normalizarNombre(r)
  const calzan = todas.filter(c => normalizarNombre(c.nombre) === n)
  if (calzan.length === 1) return { ok: true, fila: calzan[0] }
  if (calzan.length === 0) {
    const hay = todas.map(c => `"${c.nombre}"`).join(', ') || '(ninguno)'
    return { ok: false, status: 404, error: `No existe el ${nivel} "${r}" en esta cotización. Hay: ${hay}` }
  }
  return {
    ok: false, status: 400,
    error: `"${r}" calza con ${calzan.length} ${nivel}s; usa el id: ${calzan.map(c => `${c.id} (${c.nombre})`).join(', ')}`,
  }
}

/** Cotización a la que pertenece un ítem (para resolver nombres desde un item_id). */
export async function cotizacionDeItem(admin: SupabaseClient, itemId: string): Promise<{ cotizacion_id: string; departamento_id: string; subgrupo_id: string | null } | null> {
  const { data } = await admin.from('cotizacion_items').select('cotizacion_id, departamento_id, subgrupo_id').eq('id', itemId).maybeSingle()
  return (data as { cotizacion_id: string; departamento_id: string; subgrupo_id: string | null } | null) ?? null
}

/**
 * Departamento o sub-grupo por nombre, creándolo al final si no existe. Es la
 * misma regla que hilvan_cotizacion_agregar_items. Devuelve también si lo creó
 * (para poder deshacer).
 */
export async function obtenerOCrearCategoria(
  admin: SupabaseClient,
  nivel: Nivel,
  ref: string,
  cotizacionId: string,
  departamentoId?: string | null,
): Promise<{ ok: true; id: string; nombre: string; creada: boolean } | { ok: false; status: number; error: string }> {
  const r = await resolverCategoria(admin, nivel, ref, { cotizacionId, departamentoId })
  if (r.ok) return { ok: true, id: r.fila.id, nombre: r.fila.nombre, creada: false }
  if (r.status !== 404 || UUID_RE.test(ref.trim())) return r

  const tabla = tablaDeNivel(nivel)
  let q = admin.from(tabla).select('orden').eq('cotizacion_id', cotizacionId)
  if (nivel === 'subgrupo' && departamentoId) q = q.eq('departamento_id', departamentoId)
  const { data: hermanos } = await q
  const orden = ((hermanos ?? []) as { orden: number }[]).reduce((m, h) => Math.max(m, h.orden ?? 0), -1) + 1
  const fila: Record<string, unknown> = { cotizacion_id: cotizacionId, nombre: ref.trim(), orden }
  if (nivel === 'subgrupo') fila.departamento_id = departamentoId
  const { data, error } = await admin.from(tabla).insert(fila).select('id, nombre').single()
  if (error || !data) return { ok: false, status: 500, error: error?.message ?? `No se pudo crear el ${nivel}` }
  return { ok: true, id: (data as { id: string }).id, nombre: (data as { nombre: string }).nombre, creada: true }
}
