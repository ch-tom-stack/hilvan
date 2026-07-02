import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/pagar-gasto (JSON)
// Marca un gasto (de proyecto o mensual) como PAGADO de forma directa: setea
// pagado=true + fecha_pago (+ comprobante_pago_url opcional). Para el caso "tengo
// el comprobante" sin obligar a importar movimiento + conciliar. NO toca `estado`
// (pago y aprobación son ortogonales). NO crea entrada en el ledger de
// conciliaciones → es un "pagado sin conciliar"; cuando llegue la cartola, ese
// cargo se importa/concilia aparte (ver dedup de importar_movimientos).
// Reversible con /api/agent/deshacer: restaura pagado/fecha_pago previos.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { gasto_id, origen, fecha_pago, comprobante_pago_url } = body ?? {}

  if (!gasto_id || typeof gasto_id !== 'string') {
    return NextResponse.json({ error: 'Falta gasto_id' }, { status: 400 })
  }
  if (origen !== 'proyecto' && origen !== 'mensual') {
    return NextResponse.json({ error: "origen debe ser 'proyecto' o 'mensual'" }, { status: 400 })
  }
  // fecha_pago: opcional, default hoy. Formato YYYY-MM-DD.
  let fecha = typeof fecha_pago === 'string' && fecha_pago.trim() ? fecha_pago.trim() : new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'fecha_pago inválida (formato YYYY-MM-DD)' }, { status: 400 })
  }
  if (comprobante_pago_url !== undefined && comprobante_pago_url !== null && typeof comprobante_pago_url !== 'string') {
    return NextResponse.json({ error: 'comprobante_pago_url inválido (string o null)' }, { status: 400 })
  }

  const tabla = origen === 'mensual' ? 'rendicion_mensual_gastos' : 'rendicion_gastos'
  const admin = createAdminClient()

  // ── Leer valores previos (para deshacer) ──────────────────────────────────
  const { data: fila, error: eLeer } = await admin
    .from(tabla)
    .select('id, pagado, fecha_pago, comprobante_pago_url')
    .eq('id', gasto_id)
    .maybeSingle()
  if (eLeer) return NextResponse.json({ error: eLeer.message }, { status: 500 })
  if (!fila) return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })

  const previo = {
    pagado: fila.pagado ?? false,
    fecha_pago: fila.fecha_pago ?? null,
    comprobante_pago_url: fila.comprobante_pago_url ?? null,
  }

  const cambios: Record<string, string | boolean | null> = { pagado: true, fecha_pago: fecha }
  if (comprobante_pago_url !== undefined) cambios.comprobante_pago_url = comprobante_pago_url || null

  const { error: eUpd } = await admin.from(tabla).update(cambios).eq('id', gasto_id)
  if (eUpd) {
    await registrarAccion({ herramienta: 'pagar-gasto', payload: body, ok: false, error: eUpd.message })
    return NextResponse.json({ error: eUpd.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'pagar-gasto',
    payload: { gasto_id, origen, previo, cambios },
    resultado_tabla: tabla,
    resultado_id: gasto_id,
    ok: true,
  })

  return NextResponse.json({ ok: true, gasto_id, origen, pagado: true, fecha_pago: fecha, previo })
}
