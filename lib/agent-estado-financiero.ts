// lib/agent-estado-financiero.ts — helpers puros para el resumen financiero
// conversacional del agente (/api/agent/estado-financiero). Sin acceso a DB:
// solo lógica de período y agregación, para poder testearlos en aislamiento.

/**
 * Valida y normaliza un período YYYY-MM. Si no calza con el formato, devuelve
 * null. (El default = mes actual se resuelve en el route, no aquí.)
 */
export function normalizarPeriodo(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  return /^\d{4}-\d{2}$/.test(s) ? s : null
}

/** Período YYYY-MM del mes actual (hora local). */
export function periodoActual(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Rango [inicio, finExclusivo) en YYYY-MM-DD para un período YYYY-MM.
 * finExclusivo = primer día del mes siguiente (sin líos de fin de mes).
 */
export function rangoPeriodo(periodo: string): { inicio: string; finExcl: string } {
  const [y, m] = periodo.split('-').map(Number)
  const inicio = `${periodo}-01`
  const finExcl =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { inicio, finExcl }
}

/**
 * ¿La fecha cae dentro del período YYYY-MM?
 * Acepta fechas planas (YYYY-MM-DD) o timestamps ISO completos: compara solo la
 * parte de fecha (primeros 10 chars), evitando corrimientos por zona horaria.
 */
export function fechaDentroDePeriodo(
  fecha: string | null | undefined,
  periodo: string,
): boolean {
  if (!fecha) return false
  const dia = fecha.slice(0, 10)
  const { inicio, finExcl } = rangoPeriodo(periodo)
  return dia >= inicio && dia < finExcl
}

/**
 * La fecha relevante de un gasto para cuadre tributario: `fecha_documento`
 * cuando existe, con fallback a `created_at` (mismo criterio que /api/agent/gastos).
 */
export function fechaTributariaGasto(g: {
  fecha_documento?: string | null
  created_at?: string | null
}): string | null {
  return g.fecha_documento ?? g.created_at ?? null
}

/**
 * Suma montos agrupando por una clave (categoría / tipo). Las claves vacías o
 * nulas se agrupan bajo `sinClave`. Montos negativos (notas de crédito) restan,
 * por lo que una categoría puede quedar en negativo o en cero.
 */
export function agregarPorCategoria<T>(
  items: T[],
  clave: (t: T) => string | null | undefined,
  monto: (t: T) => number,
  sinClave = 'Sin categoría',
): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const it of items) {
    const k = (clave(it) || '').trim() || sinClave
    acc[k] = (acc[k] ?? 0) + (monto(it) || 0)
  }
  return acc
}
