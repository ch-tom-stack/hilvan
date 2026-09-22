// lib/historial.ts
// Deshacer / rehacer para lo que el equipo hace en pantalla.
//
// Cada acción se guarda como una lista de OPERACIONES sobre filas, con lo
// necesario para ir en las dos direcciones:
//   insert → filas creadas (con sus ids): deshacer las borra, rehacer las
//            vuelve a insertar con los MISMOS ids (las referencias siguen valiendo).
//   update → antes/después de cada fila: deshacer pone `antes`, rehacer `despues`.
//            Antes de deshacer se comprueba que la fila siga como quedó: si
//            alguien la cambió después, no se pisa a ciegas.
//   delete → el árbol de filas borradas (padre primero): deshacer las reinserta
//            en ese orden, rehacer las borra en orden inverso.
//
// La parte pura (armar e invertir operaciones) no toca la base y tiene tests;
// `aplicar` y `registrar` sí.

import type { SupabaseClient } from '@supabase/supabase-js'

export type Fila = Record<string, unknown> & { id: string }

export type Op =
  | { tipo: 'insert'; tabla: string; filas: Fila[] }
  | { tipo: 'update'; tabla: string; cambios: { id: string; antes: Record<string, unknown>; despues: Record<string, unknown> }[] }
  | { tipo: 'delete'; arbol: { tabla: string; filas: Fila[] }[] }

export interface AccionUI {
  ruta: string
  modulo: string
  descripcion: string
  ops: Op[]
}

/** Columnas que nunca se comparan ni se restauran: las pone la base. */
const COLUMNAS_IGNORADAS = new Set(['updated_at'])

/** Solo los campos que realmente cambiaron, en las dos direcciones. */
export function diferencia(antes: Record<string, unknown>, despues: Record<string, unknown>): { antes: Record<string, unknown>; despues: Record<string, unknown> } | null {
  const a: Record<string, unknown> = {}
  const d: Record<string, unknown> = {}
  for (const k of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    if (k === 'id' || COLUMNAS_IGNORADAS.has(k)) continue
    if (!(k in despues)) continue // campos que el update no tocó
    if (JSON.stringify(antes[k] ?? null) === JSON.stringify(despues[k] ?? null)) continue
    a[k] = antes[k] ?? null
    d[k] = despues[k] ?? null
  }
  return Object.keys(d).length === 0 ? null : { antes: a, despues: d }
}

/** Op de update a partir de filas leídas antes y después. Null si nada cambió. */
export function opUpdate(tabla: string, antes: Fila[], despues: Fila[]): Op | null {
  const porId = new Map(antes.map(f => [f.id, f]))
  const cambios: { id: string; antes: Record<string, unknown>; despues: Record<string, unknown> }[] = []
  for (const d of despues) {
    const a = porId.get(d.id)
    if (!a) continue
    const dif = diferencia(a, d)
    if (dif) cambios.push({ id: d.id, ...dif })
  }
  return cambios.length ? { tipo: 'update', tabla, cambios } : null
}

export function opInsert(tabla: string, filas: Fila[]): Op | null {
  return filas.length ? { tipo: 'insert', tabla, filas } : null
}

export function opDelete(arbol: { tabla: string; filas: Fila[] }[]): Op | null {
  const conFilas = arbol.filter(n => n.filas.length > 0)
  return conFilas.length ? { tipo: 'delete', arbol: conFilas } : null
}

/** ¿La fila actual sigue como la dejó la acción? Se compara solo lo que la acción tocó. */
export function coincide(actual: Record<string, unknown> | null, esperado: Record<string, unknown>): boolean {
  if (!actual) return false
  for (const k of Object.keys(esperado)) {
    if (COLUMNAS_IGNORADAS.has(k)) continue
    if (JSON.stringify(actual[k] ?? null) !== JSON.stringify(esperado[k] ?? null)) return false
  }
  return true
}

const sinGenerados = (f: Fila): Fila => {
  const { updated_at: _u, ...resto } = f as Fila & { updated_at?: unknown }
  return resto as Fila
}

/**
 * Aplica las operaciones de una acción en un sentido. Devuelve el error si algo
 * no se pudo (con qué fila), o null si todo salió.
 *
 * Deshacer recorre las ops al revés; rehacer, en orden. Dentro de un delete el
 * árbol viene padre primero: reinsertar respeta ese orden y borrar lo invierte.
 */
export async function aplicar(admin: SupabaseClient, ops: Op[], sentido: 'deshacer' | 'rehacer'): Promise<string | null> {
  const lista = sentido === 'deshacer' ? [...ops].reverse() : ops
  for (const op of lista) {
    if (op.tipo === 'insert') {
      if (sentido === 'deshacer') {
        const { error } = await admin.from(op.tabla).delete().in('id', op.filas.map(f => f.id))
        if (error) return `${op.tabla}: ${error.message}`
      } else {
        const { error } = await admin.from(op.tabla).upsert(op.filas.map(sinGenerados), { onConflict: 'id' })
        if (error) return `${op.tabla}: ${error.message}`
      }
    } else if (op.tipo === 'update') {
      for (const c of op.cambios) {
        const objetivo = sentido === 'deshacer' ? c.antes : c.despues
        if (sentido === 'deshacer') {
          const { data: actual } = await admin.from(op.tabla).select('*').eq('id', c.id).maybeSingle()
          if (!actual) return `La fila ya no existe (${op.tabla})`
          if (!coincide(actual as Record<string, unknown>, c.despues)) return 'Alguien cambió ese dato después; no se deshace a ciegas'
        }
        const { error } = await admin.from(op.tabla).update(objetivo).eq('id', c.id)
        if (error) return `${op.tabla}: ${error.message}`
      }
    } else {
      if (sentido === 'deshacer') {
        for (const nodo of op.arbol) {
          const { error } = await admin.from(nodo.tabla).upsert(nodo.filas.map(sinGenerados), { onConflict: 'id' })
          if (error) return `${nodo.tabla}: ${error.message}`
        }
      } else {
        for (const nodo of [...op.arbol].reverse()) {
          const { error } = await admin.from(nodo.tabla).delete().in('id', nodo.filas.map(f => f.id))
          if (error) return `${nodo.tabla}: ${error.message}`
        }
      }
    }
  }
  return null
}

/**
 * Guarda una acción en el historial del usuario. NUNCA lanza: si el historial
 * falla, la acción de la persona ya se hizo y no hay por qué botarla.
 */
export async function registrar(
  client: SupabaseClient,
  usuarioId: string | null | undefined,
  accion: Omit<AccionUI, 'ops'> & { ops: (Op | null)[] },
): Promise<void> {
  const ops = accion.ops.filter((o): o is Op => !!o)
  if (!usuarioId || ops.length === 0) return
  try {
    const { error } = await client.from('acciones_ui').insert({
      usuario_id: usuarioId, ruta: accion.ruta, modulo: accion.modulo, descripcion: accion.descripcion, ops,
    })
    if (error) console.error('[historial] registrar:', error.message)
  } catch (e) {
    console.error('[historial] registrar:', e)
  }
}

/** Lee filas completas por ids (para capturar antes de borrar o editar). */
export async function capturar(client: SupabaseClient, tabla: string, filtro: { col: string; valor: string | string[] }): Promise<Fila[]> {
  const q = client.from(tabla).select('*')
  const { data } = Array.isArray(filtro.valor) ? await q.in(filtro.col, filtro.valor) : await q.eq(filtro.col, filtro.valor)
  return (data ?? []) as Fila[]
}
