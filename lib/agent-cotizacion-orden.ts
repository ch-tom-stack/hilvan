// lib/agent-cotizacion-orden.ts
// Ordenar una cotización desde el agente: "deja Producción primero, después
// Cámara…". Lógica pura; la ruta solo lee, valida con esto y escribe.

import { ordenar, renumerar, cambiosDeOrden, porOrden, type ConOrden } from '@/lib/orden'

export interface Hermano extends ConOrden {
  nombre: string
  created_at?: string | null
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Encuentra UN hermano por id o por nombre (sin distinguir mayúsculas ni
 * tildes). Un nombre que calza con dos es un error, no una adivinanza: en una
 * cotización puede haber dos ítems "Asistente", y elegir uno al azar dejaría el
 * orden mal sin que nadie se entere.
 */
export function buscarHermano<T extends Hermano>(lista: T[], ref: string): { ok: true; fila: T } | { ok: false; error: string } {
  const r = ref.trim()
  if (UUID.test(r)) {
    const porId = lista.find(x => x.id === r)
    return porId ? { ok: true, fila: porId } : { ok: false, error: `el id ${r} no pertenece a este grupo` }
  }
  const n = normalizar(r)
  const calzan = lista.filter(x => normalizar(x.nombre) === n)
  if (calzan.length === 1) return { ok: true, fila: calzan[0] }
  if (calzan.length === 0) {
    return { ok: false, error: `no existe "${r}" acá. Hay: ${lista.map(x => `"${x.nombre}"`).join(', ') || '(nada)'}` }
  }
  return { ok: false, error: `"${r}" calza con ${calzan.length} elementos; usa el id: ${calzan.map(x => x.id).join(', ')}` }
}

/**
 * Aplica un orden pedido. Lo nombrado va primero, en el orden pedido; lo que no
 * se nombró queda DESPUÉS, conservando su orden relativo — así se puede decir
 * solo "Producción y Cámara primero" sin tener que listar los doce grupos.
 */
export function planOrden<T extends Hermano>(
  hermanos: T[],
  pedido: string[],
): { ok: true; despues: T[]; cambios: ConOrden[] } | { ok: false; error: string } {
  if (!Array.isArray(pedido) || pedido.length === 0) return { ok: false, error: '"orden" debe ser una lista con al menos un elemento' }
  const actual = [...hermanos].sort(porOrden)
  const primeros: T[] = []
  const vistos = new Set<string>()
  for (const ref of pedido) {
    if (typeof ref !== 'string' || !ref.trim()) return { ok: false, error: '"orden" solo acepta nombres o ids' }
    const r = buscarHermano(actual, ref)
    if (!r.ok) return r
    if (vistos.has(r.fila.id)) return { ok: false, error: `"${ref}" está repetido en el orden` }
    vistos.add(r.fila.id)
    primeros.push(r.fila)
  }
  const despues = renumerar([...primeros, ...actual.filter(x => !vistos.has(x.id))])
  // Se compara contra lo GUARDADO (no contra `actual` ya desempatado): si había
  // empates, renumerar los resuelve aunque el orden visible no cambie.
  return { ok: true, despues, cambios: cambiosDeOrden(ordenar(hermanos), despues) }
}
