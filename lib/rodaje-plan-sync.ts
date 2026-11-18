// Sincronización del plan de rodaje: el plan vive en el navegador (todo se
// calcula ahí, al instante) y al servidor solo viaja lo que cambió.
//
// Antes cada autoguardado mandaba TODOS los bloques y el servidor hacía un
// update por bloque, aunque solo se hubiera tocado una letra. Con un plan de
// 40 bloques eran 40 escrituras por guardado, y como las server actions corren
// de a una, cualquier otra acción (crear un bloque, cambiar la fecha) quedaba
// esperando detrás.

import type { RodajeBloque } from '@/types'

/** Columnas del bloque que se escriben en la base (las mismas que acepta guardarBloques). */
export const COLUMNAS_BLOQUE = [
  'orden', 'titulo', 'tipo', 'scenes_label', 'scenes_color', 'character_num',
  'dia_noche', 'interior_exterior', 'locacion_id', 'descripcion', 'nota_previa',
  'hora_inicio_fija', 'hora_fin', 'duracion_min', 'es_anclado', 'es_paralelo',
  'visible_equipo', 'visible_catering', 'visible_extras', 'visible_cliente',
  'imagen_url', 'contenido_rico', 'estilo',
] as const

export type ColumnaBloque = (typeof COLUMNAS_BLOQUE)[number]

/** Solo las columnas que se guardan. `undefined` → `null`, para que viaje y limpie la columna. */
export function columnasBloque(b: RodajeBloque): Record<ColumnaBloque, unknown> {
  const fila = {} as Record<ColumnaBloque, unknown>
  for (const c of COLUMNAS_BLOQUE) fila[c] = (b as unknown as Record<string, unknown>)[c] ?? null
  return fila
}

/** Huella de lo que se guarda de un bloque: si no cambia, no hay nada que subir. */
export function firmaBloque(b: RodajeBloque): string {
  return JSON.stringify(columnasBloque(b))
}

export const esTemporal = (id: string) => id.startsWith('temp-')

/** Bloques reales cuya huella difiere de la última guardada (o que nunca se guardaron). */
export function bloquesPendientes(bloques: RodajeBloque[], guardadas: Map<string, string>): RodajeBloque[] {
  return bloques.filter(b => !esTemporal(b.id) && guardadas.get(b.id) !== firmaBloque(b))
}

/** Huellas de un conjunto de bloques tal como están en la base. */
export function firmas(bloques: RodajeBloque[]): Map<string, string> {
  return new Map(bloques.filter(b => !esTemporal(b.id)).map(b => [b.id, firmaBloque(b)]))
}
