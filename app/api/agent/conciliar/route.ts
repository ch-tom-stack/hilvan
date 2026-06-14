import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import {
  esMatchTablaValida,
  validarCoherencia,
  patchPago,
  columnasPrevio,
  type TipoMovimiento,
} from '@/lib/agent-conciliacion'

export const runtime = 'nodejs'

// POST /api/agent/conciliar (JSON)
// Cruza un movimiento bancario con una fila de Hilván y marca pagada la obligación.
// Body: { movimiento_id (req), match_tabla (req), match_id (req), fecha_pago? }.
//
//   - match_tabla ∈ {rendicion_gastos, rendicion_mensual_gastos, gastos_fijos_cuotas, cotizaciones}.
//   - El movimiento debe existir y NO estar ya conciliado.
//   - Coherencia tipo↔match: 'abono' (entrada) ↔ cotizaciones; 'cargo' (salida) ↔ las otras tres.
//   - La fila match debe existir; se LEE su estado previo para reversibilidad.
//   - fecha_pago efectiva = body.fecha_pago || movimiento.fecha.
//   - Marca pagada la fila match según su tabla y marca el movimiento conciliado.
//
// Reversible: deshacer restaura el estado PREVIO de la fila match (payload.previo)
// y vuelve el movimiento a conciliado=false.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { movimiento_id, match_tabla, match_id, fecha_pago } = body ?? {}

  if (!movimiento_id || typeof movimiento_id !== 'string') {
    return NextResponse.json({ error: 'Falta movimiento_id' }, { status: 400 })
  }
  if (!esMatchTablaValida(match_tabla)) {
    return NextResponse.json(
      {
        error:
          "match_tabla inválida (debe ser 'rendicion_gastos', 'rendicion_mensual_gastos', 'gastos_fijos_cuotas' o 'cotizaciones')",
      },
      { status: 400 },
    )
  }
  if (!match_id || typeof match_id !== 'string') {
    return NextResponse.json({ error: 'Falta match_id' }, { status: 400 })
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

  // ── Coherencia tipo ↔ tabla ─────────────────────────────────────────────────
  const incoherencia = validarCoherencia(mov.tipo as TipoMovimiento, match_tabla)
  if (incoherencia) return NextResponse.json({ error: incoherencia }, { status: 400 })

  // ── Verificar la fila match y LEER su estado previo ─────────────────────────
  const { data: previo, error: ePrevio } = await admin
    .from(match_tabla)
    .select(columnasPrevio(match_tabla))
    .eq('id', match_id)
    .maybeSingle()
  if (ePrevio) return NextResponse.json({ error: ePrevio.message }, { status: 500 })
  if (!previo) {
    return NextResponse.json(
      { error: `match_id no encontrado en ${match_tabla}` },
      { status: 404 },
    )
  }

  const fechaPagoEfectiva = (fecha_pago as string) || mov.fecha

  // ── 1. Marcar pagada la fila match ──────────────────────────────────────────
  const { error: ePago } = await admin
    .from(match_tabla)
    .update(patchPago(match_tabla, fechaPagoEfectiva))
    .eq('id', match_id)
  if (ePago) {
    await registrarAccion({
      herramienta: 'conciliar',
      payload: { ...body, error: ePago.message },
      ok: false,
      error: ePago.message,
    })
    return NextResponse.json({ error: ePago.message }, { status: 500 })
  }

  // ── 2. Marcar el movimiento como conciliado ─────────────────────────────────
  const { error: eMovUpd } = await admin
    .from('movimientos_bancarios')
    .update({ conciliado: true, conciliado_tabla: match_tabla, conciliado_id: match_id })
    .eq('id', movimiento_id)
  if (eMovUpd) {
    // El pago ya se aplicó; registrar el fallo parcial (la fila match quedó pagada).
    await registrarAccion({
      herramienta: 'conciliar',
      payload: { ...body, parcial: 'fila match pagada, movimiento no marcado', error: eMovUpd.message },
      ok: false,
      error: eMovUpd.message,
    })
    return NextResponse.json({ error: eMovUpd.message }, { status: 500 })
  }

  // ── 3. Log reversible ───────────────────────────────────────────────────────
  await registrarAccion({
    herramienta: 'conciliar',
    payload: { match_tabla, match_id, previo, fecha_pago: fechaPagoEfectiva },
    resultado_tabla: 'movimientos_bancarios',
    resultado_id: movimiento_id,
    ok: true,
  })

  return NextResponse.json({
    ok: true,
    conciliado: {
      movimiento_id,
      match_tabla,
      match_id,
      fecha_pago: fechaPagoEfectiva,
      tipo: mov.tipo,
      monto: mov.monto,
    },
  })
}
