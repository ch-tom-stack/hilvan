// lib/agent-conciliacion-io.ts
// Helpers de conciliación que SÍ tocan la DB (a diferencia de agent-conciliacion.ts,
// que es lógica pura). Se comparten entre el endpoint conciliar y deshacer para que
// el estado de pago de una obligación y de un movimiento se derive SIEMPRE del
// ledger `conciliaciones` (suma de asignaciones), nunca a ojo.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  patchPago,
  patchRestaurar,
  type MatchTabla,
} from '@/lib/agent-conciliacion'
import { COT_COBRAR_SELECT, calcularTotalCot } from '@/app/actions/financiero-helpers'

/**
 * Total de la obligación (lo que hay que cubrir para considerarla pagada).
 *  - gastos / cuotas: el `monto` de la fila.
 *  - cotizaciones: calcularTotalCot (misma fórmula que el módulo financiero).
 */
export async function totalDeObligacion(
  admin: SupabaseClient,
  tabla: MatchTabla,
  id: string,
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  if (tabla === 'cotizaciones') {
    const { data, error } = await admin
      .from('cotizaciones')
      .select(COT_COBRAR_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: `cotización ${id} no encontrada` }
    return { ok: true, total: Math.round(calcularTotalCot(data)) }
  }
  // rendicion_gastos | rendicion_mensual_gastos | gastos_fijos_cuotas → monto
  const { data, error } = await admin.from(tabla).select('monto').eq('id', id).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: `fila ${id} no encontrada en ${tabla}` }
  return { ok: true, total: Math.round((data as { monto: number }).monto ?? 0) }
}

/** Suma de asignaciones del ledger a una obligación, y la fecha de pago más reciente. */
export async function sumaAsignada(
  admin: SupabaseClient,
  tabla: MatchTabla,
  id: string,
): Promise<{ ok: true; suma: number; fechaMax: string | null } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from('conciliaciones')
    .select('monto, fecha_pago')
    .eq('match_tabla', tabla)
    .eq('match_id', id)
  if (error) return { ok: false, error: error.message }
  const filas = (data ?? []) as { monto: number; fecha_pago: string }[]
  const suma = filas.reduce((s, f) => s + (f.monto ?? 0), 0)
  const fechaMax = filas.reduce<string | null>(
    (max, f) => (f.fecha_pago && (!max || f.fecha_pago > max) ? f.fecha_pago : max),
    null,
  )
  return { ok: true, suma, fechaMax }
}

/**
 * Recalcula el estado de pago de una obligación desde el ledger:
 *  - si la suma de asignaciones cubre el total → marcar pagada con la fecha más reciente.
 *  - si no (parcial o sin asignaciones) → dejar NO pagada.
 * Es idempotente: refleja exactamente lo que dice el ledger en ese momento.
 */
export async function recomputarObligacion(
  admin: SupabaseClient,
  tabla: MatchTabla,
  id: string,
): Promise<string | null> {
  const t = await totalDeObligacion(admin, tabla, id)
  if (!t.ok) return t.error
  const s = await sumaAsignada(admin, tabla, id)
  if (!s.ok) return s.error

  const cubierta = t.total > 0 && s.suma >= t.total
  const patch = cubierta
    ? patchPago(tabla, s.fechaMax ?? '')
    : patchRestaurar(tabla, null) // → pagado=false / fecha null

  const { error } = await admin.from(tabla).update(patch).eq('id', id)
  return error ? error.message : null
}

/**
 * Recalcula el estado de un movimiento desde el ledger:
 *  - conciliado = la suma de sus asignaciones cubre su monto.
 *  - conciliado_tabla/_id: se mantienen como referencia SOLO en el caso 1:1
 *    (una única asignación); con varias o ninguna se anulan (el ledger es la verdad).
 */
export async function recomputarMovimiento(
  admin: SupabaseClient,
  movimientoId: string,
): Promise<string | null> {
  const { data: mov, error: eMov } = await admin
    .from('movimientos_bancarios')
    .select('id, monto')
    .eq('id', movimientoId)
    .maybeSingle()
  if (eMov) return eMov.message
  if (!mov) return `movimiento ${movimientoId} no encontrado`

  const { data, error } = await admin
    .from('conciliaciones')
    .select('match_tabla, match_id, monto')
    .eq('movimiento_id', movimientoId)
  if (error) return error.message

  const filas = (data ?? []) as { match_tabla: string; match_id: string; monto: number }[]
  const suma = filas.reduce((s, f) => s + (f.monto ?? 0), 0)
  const conciliado = suma >= (mov as { monto: number }).monto && filas.length > 0
  const unica = filas.length === 1 ? filas[0] : null

  const { error: eUpd } = await admin
    .from('movimientos_bancarios')
    .update({
      conciliado,
      conciliado_tabla: unica ? unica.match_tabla : null,
      conciliado_id: unica ? unica.match_id : null,
    })
    .eq('id', movimientoId)
  return eUpd ? eUpd.message : null
}
