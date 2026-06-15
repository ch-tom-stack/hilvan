// lib/agent-conciliacion.ts
// Lógica pura de la conciliación bancaria del agente (sin I/O).
// Se importa desde app/api/agent/conciliar y se cubre con tests unitarios.

export type TipoMovimiento = 'cargo' | 'abono'

// Tablas que puede tocar la conciliación.
export const MATCH_TABLAS = [
  'rendicion_gastos',
  'rendicion_mensual_gastos',
  'gastos_fijos_cuotas',
  'cotizaciones',
] as const

export type MatchTabla = (typeof MATCH_TABLAS)[number]

export function esMatchTablaValida(t: unknown): t is MatchTabla {
  return typeof t === 'string' && (MATCH_TABLAS as readonly string[]).includes(t)
}

/**
 * Coherencia tipo de movimiento ↔ tabla de match.
 * - 'abono' (entrada de dinero) solo concilia con 'cotizaciones' (un pago recibido).
 * - 'cargo' (salida de dinero) solo concilia con las tres tablas de gasto/obligación.
 * Devuelve null si calza, o un string con el motivo del rechazo.
 */
export function validarCoherencia(tipo: TipoMovimiento, matchTabla: MatchTabla): string | null {
  if (tipo === 'abono') {
    if (matchTabla !== 'cotizaciones') {
      return `un movimiento 'abono' (entrada) solo concilia con 'cotizaciones', no con '${matchTabla}'`
    }
    return null
  }
  // tipo === 'cargo'
  if (matchTabla === 'cotizaciones') {
    return `un movimiento 'cargo' (salida) no concilia con 'cotizaciones' (eso es un abono)`
  }
  return null
}

/**
 * Construye el patch de UPDATE para marcar la fila match como pagada, según la tabla.
 *   - rendicion_gastos / rendicion_mensual_gastos → { pagado, fecha_pago }
 *   - gastos_fijos_cuotas                          → { pagada, fecha_pago }
 *   - cotizaciones                                 → { fecha_pago_recibido }  (NO toca factura)
 */
export function patchPago(matchTabla: MatchTabla, fechaPago: string): Record<string, unknown> {
  switch (matchTabla) {
    case 'rendicion_gastos':
    case 'rendicion_mensual_gastos':
      return { pagado: true, fecha_pago: fechaPago }
    case 'gastos_fijos_cuotas':
      return { pagada: true, fecha_pago: fechaPago }
    case 'cotizaciones':
      return { fecha_pago_recibido: fechaPago }
  }
}

/** Columnas a leer para guardar el estado PREVIO (reversibilidad), según la tabla. */
export function columnasPrevio(matchTabla: MatchTabla): string {
  switch (matchTabla) {
    case 'rendicion_gastos':
    case 'rendicion_mensual_gastos':
      return 'id, pagado, fecha_pago'
    case 'gastos_fijos_cuotas':
      return 'id, pagada, fecha_pago'
    case 'cotizaciones':
      return 'id, fecha_pago_recibido'
  }
}

/**
 * Mapea el tipo de movimiento bancario al tipo de fila en flujo_caja_manual.
 *   - 'abono' (entrada de dinero) → 'entrada'
 *   - 'cargo' (salida de dinero)  → 'salida'
 * Usado al conciliar un movimiento SIN match como ingreso/gasto vario.
 */
export function tipoFlujoDesdeMovimiento(tipo: TipoMovimiento): 'entrada' | 'salida' {
  return tipo === 'abono' ? 'entrada' : 'salida'
}

/** Construye el patch de UPDATE para RESTAURAR el estado previo (deshacer). */
export function patchRestaurar(
  matchTabla: MatchTabla,
  previo: Record<string, unknown> | null,
): Record<string, unknown> {
  switch (matchTabla) {
    case 'rendicion_gastos':
    case 'rendicion_mensual_gastos':
      return { pagado: previo?.pagado ?? false, fecha_pago: previo?.fecha_pago ?? null }
    case 'gastos_fijos_cuotas':
      return { pagada: previo?.pagada ?? false, fecha_pago: previo?.fecha_pago ?? null }
    case 'cotizaciones':
      return { fecha_pago_recibido: previo?.fecha_pago_recibido ?? null }
  }
}
