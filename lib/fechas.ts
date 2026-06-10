/**
 * lib/fechas.ts — Helpers centralizados de fechas para Hilván
 *
 * Reglas de uso:
 *   - Fechas planas  YYYY-MM-DD  → usar parseFechaLocal() antes de formatear
 *   - Timestamps ISO completos   → pasar directo a new Date() o formatFecha()
 */

/**
 * Parsea una fecha plana YYYY-MM-DD como fecha local de Chile.
 * Sin este helper, `new Date("2025-03-15")` se interpreta como UTC medianoche,
 * lo que en UTC-3 produce "14 de marzo" en vez de "15 de marzo".
 */
export function parseFechaLocal(yyyymmdd: string): Date {
  return new Date(yyyymmdd + 'T12:00:00')
}

/**
 * Formatea una fecha para mostrar en la UI.
 *
 * - Si recibe un `string` YYYY-MM-DD (sin 'T'), lo parsea con parseFechaLocal.
 * - Si recibe un timestamp ISO completo (contiene 'T') o un objeto Date,
 *   lo usa directamente (ya trae zona horaria explícita o es hora local).
 * - opts por defecto: { day: 'numeric', month: 'long', year: 'numeric' }
 */
export function formatFecha(
  d: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  if (!d) return '—'
  let date: Date
  if (typeof d === 'string') {
    date = d.includes('T') ? new Date(d) : parseFechaLocal(d)
  } else {
    date = d
  }
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-CL', opts)
}
