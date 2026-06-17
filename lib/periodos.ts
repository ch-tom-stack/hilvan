/**
 * Utilidades de manejo de períodos YYYY-MM.
 * Archivo sin 'use server' — puede importarse desde cualquier contexto.
 */

export function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function mesSiguiente(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function mismoMesAñoAnterior(mes: string): string {
  const [y, m] = mes.split('-')
  return `${Number(y) - 1}-${m}`
}
