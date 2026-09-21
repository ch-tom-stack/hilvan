// lib/orden.ts
// Reordenar listas que guardan su posición en una columna `orden`.
//
// La regla que evita el "quedó raro": después de cualquier movimiento se
// RENUMERA la lista completa (0, 1, 2…). Guardar solo el ítem movido deja
// empates —dos filas con el mismo `orden`— y con empates la base devuelve las
// filas en el orden que quiera, distinto en la app, el PDF y el link del cliente.

export interface ConOrden { id: string; orden: number }

/** La lista en el orden en que se ve: por `orden`, y los empates por donde venían. */
export function ordenar<T extends ConOrden>(lista: T[]): T[] {
  return lista
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (a.x.orden - b.x.orden) || (a.i - b.i))
    .map(({ x }) => x)
}

/** Reasigna orden = posición. */
export function renumerar<T extends ConOrden>(lista: T[]): T[] {
  return lista.map((x, i) => (x.orden === i ? x : { ...x, orden: i }))
}

/** Sube (-1) o baja (+1) un elemento un puesto. Devuelve la lista renumerada, o null si no se puede. */
export function moverUnPuesto<T extends ConOrden>(lista: T[], id: string, dir: -1 | 1): T[] | null {
  const orden = ordenar(lista)
  const i = orden.findIndex(x => x.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= orden.length) return null
  ;[orden[i], orden[j]] = [orden[j], orden[i]]
  return renumerar(orden)
}

/**
 * Inserta `elemento` justo antes de `antesDeId` (o al final si es null o no está).
 * Si el elemento ya estaba en la lista, primero se saca: sirve tanto para
 * reordenar dentro de un grupo como para recibir algo que viene de otro.
 */
export function insertarAntesDe<T extends ConOrden>(lista: T[], elemento: T, antesDeId: string | null): T[] {
  const sin = ordenar(lista).filter(x => x.id !== elemento.id)
  const pos = antesDeId ? sin.findIndex(x => x.id === antesDeId) : -1
  if (pos < 0) sin.push(elemento)
  else sin.splice(pos, 0, elemento)
  return renumerar(sin)
}

/** Las filas cuyo `orden` cambió respecto de `antes`: lo único que hay que guardar. */
export function cambiosDeOrden<T extends ConOrden>(antes: T[], despues: T[]): ConOrden[] {
  const previo = new Map(antes.map(x => [x.id, x.orden]))
  return despues.filter(x => previo.get(x.id) !== x.orden).map(x => ({ id: x.id, orden: x.orden }))
}

/** El `orden` para algo nuevo: después del último, aunque haya huecos o empates. */
export function siguienteOrden(lista: ConOrden[]): number {
  return lista.reduce((max, x) => Math.max(max, x.orden), -1) + 1
}

/**
 * Comparador para lo que viene de la base. Con `orden` empatado —miles de ítems
 * históricos valen 99— desempata por fecha de creación y después por id, para
 * que la app, el PDF y el link del cliente muestren SIEMPRE lo mismo aunque
 * nadie haya reordenado esa cotización todavía.
 */
export function porOrden(a: { orden?: number | null; created_at?: string | null; id?: string }, b: { orden?: number | null; created_at?: string | null; id?: string }): number {
  return ((a.orden ?? 0) - (b.orden ?? 0))
    || (a.created_at ?? '').localeCompare(b.created_at ?? '')
    || (a.id ?? '').localeCompare(b.id ?? '')
}
