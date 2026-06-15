import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import {
  validarCoherencia,
  normalizarAsignaciones,
  type TipoMovimiento,
} from '@/lib/agent-conciliacion'
import {
  totalDeObligacion,
  recomputarObligacion,
  recomputarMovimiento,
} from '@/lib/agent-conciliacion-io'

export const runtime = 'nodejs'

// POST /api/agent/conciliar (JSON) — conciliación N:M.
// Cruza UN movimiento bancario con UNA o VARIAS obligaciones de Hilván, repartiendo
// el monto. Resuelve transferencias combinadas (un movimiento paga varios gastos) y
// pagos parciales (una obligación se cubre con varios movimientos / asignaciones).
//
// Body:
//   { movimiento_id (req),
//     asignaciones: [{ match_tabla, match_id, monto? }]   ← forma N:M
//     | match_tabla + match_id                            ← forma 1:1 (retrocompat)
//     fecha_pago? }                                       ← YYYY-MM-DD, default = fecha del movimiento
//
//   - match_tabla ∈ {rendicion_gastos, rendicion_mensual_gastos, gastos_fijos_cuotas, cotizaciones}.
//   - El movimiento debe existir, NO estar conciliado y NO tener asignaciones previas
//     (si las tiene, primero hilvan_deshacer esa conciliación).
//   - Coherencia tipo↔match (por asignación): 'abono' ↔ cotizaciones; 'cargo' ↔ las otras tres.
//   - La suma de asignaciones no puede exceder el monto del movimiento.
//   - Cada asignación se escribe en el ledger `conciliaciones`. Luego se RECOMPUTA
//     el estado de pago de cada obligación (pagada solo si la suma la cubre) y del
//     movimiento (conciliado solo si sus asignaciones cubren su monto).
//
// Reversible: deshacer borra las filas de ledger de esta acción y recomputa.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { movimiento_id, asignaciones, match_tabla, match_id, fecha_pago } = body ?? {}

  if (!movimiento_id || typeof movimiento_id !== 'string') {
    return NextResponse.json({ error: 'Falta movimiento_id' }, { status: 400 })
  }
  if (
    fecha_pago != null &&
    (typeof fecha_pago !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_pago))
  ) {
    return NextResponse.json(
      { error: 'fecha_pago inválida (formato YYYY-MM-DD)' },
      { status: 400 },
    )
  }

  // Forma 1:1 (retrocompat): match_tabla + match_id → una sola asignación sin monto.
  const rawAsignaciones = Array.isArray(asignaciones)
    ? asignaciones
    : match_tabla && match_id
      ? [{ match_tabla, match_id }]
      : null
  if (!rawAsignaciones) {
    return NextResponse.json(
      { error: 'Falta asignaciones[] (o match_tabla + match_id para el caso 1:1)' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // ── Verificar el movimiento y su estado ─────────────────────────────────────
  const { data: mov, error: eMov } = await admin
    .from('movimientos_bancarios')
    .select('id, fecha, tipo, monto, conciliado')
    .eq('id', movimiento_id)
    .maybeSingle()
  if (eMov) return NextResponse.json({ error: eMov.message }, { status: 500 })
  if (!mov) return NextResponse.json({ error: 'movimiento_id no encontrado' }, { status: 404 })
  if (mov.conciliado) {
    return NextResponse.json({ error: 'El movimiento ya está conciliado' }, { status: 400 })
  }

  // No permitir apilar sobre asignaciones previas (mantiene limpio el deshacer).
  const { count: yaAsignado, error: eCount } = await admin
    .from('conciliaciones')
    .select('id', { count: 'exact', head: true })
    .eq('movimiento_id', movimiento_id)
  if (eCount) return NextResponse.json({ error: eCount.message }, { status: 500 })
  if ((yaAsignado ?? 0) > 0) {
    return NextResponse.json(
      { error: 'El movimiento ya tiene asignaciones; deshaz primero esa conciliación' },
      { status: 400 },
    )
  }

  // ── Normalizar y validar las asignaciones (suma ≤ monto del movimiento) ──────
  const norm = normalizarAsignaciones(rawAsignaciones, mov.monto)
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 })
  const lista = norm.asignaciones

  // ── Coherencia tipo↔tabla + existencia de cada obligación (TODO antes de escribir) ──
  for (const a of lista) {
    const incoherencia = validarCoherencia(mov.tipo as TipoMovimiento, a.match_tabla)
    if (incoherencia) return NextResponse.json({ error: incoherencia }, { status: 400 })
    const t = await totalDeObligacion(admin, a.match_tabla, a.match_id)
    if (!t.ok) return NextResponse.json({ error: t.error }, { status: 404 })
  }

  const fechaPagoEfectiva = (fecha_pago as string) || mov.fecha

  // ── 1. Escribir el ledger de asignaciones ───────────────────────────────────
  const { data: insertadas, error: eIns } = await admin
    .from('conciliaciones')
    .insert(
      lista.map((a) => ({
        movimiento_id,
        match_tabla: a.match_tabla,
        match_id: a.match_id,
        monto: a.monto,
        fecha_pago: fechaPagoEfectiva,
      })),
    )
    .select('id')
  if (eIns) {
    await registrarAccion({
      herramienta: 'conciliar',
      payload: { ...body, error: eIns.message },
      ok: false,
      error: eIns.message,
    })
    return NextResponse.json({ error: eIns.message }, { status: 500 })
  }
  const ledgerIds = (insertadas ?? []).map((r: { id: string }) => r.id)

  // ── 2. Recomputar pago de cada obligación distinta y del movimiento ─────────
  const obligaciones = Array.from(
    new Map(lista.map((a) => [`${a.match_tabla}:${a.match_id}`, a])).values(),
  ).map((a) => ({ tabla: a.match_tabla, id: a.match_id }))

  for (const o of obligaciones) {
    const err = await recomputarObligacion(admin, o.tabla, o.id)
    if (err) return NextResponse.json({ error: err, ledger_ids: ledgerIds }, { status: 500 })
  }
  const errMov = await recomputarMovimiento(admin, movimiento_id)
  if (errMov) return NextResponse.json({ error: errMov, ledger_ids: ledgerIds }, { status: 500 })

  // ── 3. Log reversible ───────────────────────────────────────────────────────
  await registrarAccion({
    herramienta: 'conciliar',
    payload: {
      asignaciones: lista,
      ledger_ids: ledgerIds,
      obligaciones,
      fecha_pago: fechaPagoEfectiva,
    },
    resultado_tabla: 'movimientos_bancarios',
    resultado_id: movimiento_id,
    ok: true,
  })

  return NextResponse.json({
    ok: true,
    conciliado: {
      movimiento_id,
      tipo: mov.tipo,
      monto: mov.monto,
      asignaciones: lista,
      fecha_pago: fechaPagoEfectiva,
    },
  })
}
