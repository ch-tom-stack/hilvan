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

/** Una asignación normalizada: tanto monto de un movimiento paga esta obligación. */
export type Asignacion = { match_tabla: MatchTabla; match_id: string; monto: number }

/**
 * Normaliza y valida la lista de asignaciones de un movimiento (conciliación N:M).
 *  - `raw` debe ser un array no vacío de { match_tabla, match_id, monto? }.
 *  - `monto` se puede omitir SOLO si hay exactamente una asignación → toma el
 *    monto completo del movimiento (retrocompatible con la conciliación 1:1).
 *  - Cada `monto` debe ser un entero finito > 0 (CLP, sin decimales).
 *  - La suma de las asignaciones NO puede exceder el monto del movimiento
 *    (sí puede ser menor: el resto queda sin asignar y el movimiento, no conciliado).
 * Devuelve la lista con montos enteros, o un error con el motivo.
 */
export function normalizarAsignaciones(
  raw: unknown,
  movimientoMonto: number,
): { ok: true; asignaciones: Asignacion[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'asignaciones debe ser un array con al menos una asignación' }
  }

  const unica = raw.length === 1
  const out: Asignacion[] = []

  for (let i = 0; i < raw.length; i++) {
    const a = raw[i] as Record<string, unknown> | null
    const etq = `asignación ${i + 1}`
    if (!a || typeof a !== 'object') {
      return { ok: false, error: `${etq}: debe ser un objeto` }
    }
    if (!esMatchTablaValida(a.match_tabla)) {
      return {
        ok: false,
        error: `${etq}: match_tabla inválida (rendicion_gastos | rendicion_mensual_gastos | gastos_fijos_cuotas | cotizaciones)`,
      }
    }
    if (typeof a.match_id !== 'string' || !a.match_id.trim()) {
      return { ok: false, error: `${etq}: falta match_id` }
    }

    let monto: number
    if (a.monto == null) {
      if (!unica) {
        return { ok: false, error: `${etq}: monto requerido cuando hay más de una asignación` }
      }
      monto = movimientoMonto
    } else {
      const n = typeof a.monto === 'string' ? parseFloat(a.monto) : (a.monto as number)
      if (!Number.isFinite(n) || n <= 0) {
        return { ok: false, error: `${etq}: monto debe ser un número > 0` }
      }
      monto = Math.round(n)
    }

    out.push({ match_tabla: a.match_tabla, match_id: a.match_id.trim(), monto })
  }

  const suma = out.reduce((s, a) => s + a.monto, 0)
  if (suma > movimientoMonto) {
    return {
      ok: false,
      error: `la suma de asignaciones ($${suma.toLocaleString('es-CL')}) excede el monto del movimiento ($${movimientoMonto.toLocaleString('es-CL')})`,
    }
  }

  return { ok: true, asignaciones: out }
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
 * Monto que `conciliar-vario` debe registrar en flujo de caja: el RESTO del
 * movimiento que no quedó asignado a obligaciones en el ledger. Si no hay
 * asignaciones (sumaLedger=0), es el monto completo (comportamiento clásico).
 * Permite repartir un movimiento mixto (parte gasto vía conciliar, parte
 * impuesto/vario vía conciliar-vario) sin doble contar.
 */
export function montoVarioRestante(movimientoMonto: number, sumaLedger: number): number {
  return movimientoMonto - sumaLedger
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
