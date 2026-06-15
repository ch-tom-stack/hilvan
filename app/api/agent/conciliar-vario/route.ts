import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import {
  tipoFlujoDesdeMovimiento,
  montoVarioRestante,
  type TipoMovimiento,
} from '@/lib/agent-conciliacion'
import { resolverPerfilAgente } from '@/lib/agent-perfil'

export const runtime = 'nodejs'

// POST /api/agent/conciliar-vario (JSON)
// Cierra el loop de conciliación: un movimiento bancario SIN match en Hilván
// (devolución de impuesto, depósito, compra suelta, etc.) se registra como
// ingreso/gasto vario en flujo_caja_manual y queda conciliado.
// Body: { movimiento_id (req), descripcion (req) }.
//
//   - El movimiento debe existir (404) y NO estar ya conciliado (400).
//   - Registra el RESTO no asignado (monto del movimiento − lo ya conciliado a
//     obligaciones en el ledger). Sin asignaciones previas = monto completo. Así un
//     movimiento mixto se reparte entre conciliar (gasto) y conciliar-vario (vario)
//     sin doble contar. Si no queda resto (>0) → 400.
//   - Crea una fila en flujo_caja_manual por ese resto, con la fecha del movimiento y
//     el tipo derivado (abono → entrada, cargo → salida). created_by = perfil real.
//   - Marca el movimiento conciliado contra esa fila.
//
// Reversible: deshacer borra la fila de flujo_caja_manual (payload.flujo_id) y
// vuelve el movimiento a conciliado=false.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { movimiento_id, descripcion } = body ?? {}

  if (!movimiento_id || typeof movimiento_id !== 'string') {
    return NextResponse.json({ error: 'Falta movimiento_id' }, { status: 400 })
  }
  if (!descripcion || typeof descripcion !== 'string' || !descripcion.trim()) {
    return NextResponse.json({ error: 'Falta descripcion' }, { status: 400 })
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

  // ── Resto no asignado: el movimiento puede tener parte ya conciliada a
  //    obligaciones (ledger). Vario registra SOLO el resto, para repartir un
  //    movimiento mixto (ej. transferencia al contador: parte honorarios vía
  //    conciliar, parte impuestos vía conciliar-vario) sin doble contar. ──────
  const { data: asg, error: eAsg } = await admin
    .from('conciliaciones')
    .select('monto')
    .eq('movimiento_id', movimiento_id)
  if (eAsg) return NextResponse.json({ error: eAsg.message }, { status: 500 })
  const sumaLedger = (asg ?? []).reduce((s, a: { monto: number }) => s + (a.monto ?? 0), 0)
  const montoResto = montoVarioRestante(mov.monto, sumaLedger)
  if (montoResto <= 0) {
    return NextResponse.json(
      { error: 'El movimiento ya está completamente asignado a obligaciones; no queda resto para registrar como vario' },
      { status: 400 },
    )
  }

  // ── Resolver autoría (created_by) con un perfil real ────────────────────────
  const perfil = await resolverPerfilAgente(admin)
  if (!perfil.ok) {
    return NextResponse.json({ error: perfil.error }, { status: 400 })
  }

  const tipoFlujo = tipoFlujoDesdeMovimiento(mov.tipo as TipoMovimiento)

  // ── 1. Crear la fila de flujo de caja (por el RESTO no asignado) ─────────────
  const { data: flujo, error: eFlujo } = await admin
    .from('flujo_caja_manual')
    .insert({
      descripcion: descripcion.trim(),
      monto: montoResto,
      fecha: mov.fecha,
      tipo: tipoFlujo,
      created_by: perfil.id,
    })
    .select('id')
    .single()
  if (eFlujo || !flujo?.id) {
    const msg = eFlujo?.message ?? 'No se pudo crear el flujo de caja'
    await registrarAccion({
      herramienta: 'conciliar-vario',
      payload: { ...body, error: msg },
      ok: false,
      error: msg,
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // ── 2. Marcar el movimiento como conciliado ─────────────────────────────────
  const { error: eMovUpd } = await admin
    .from('movimientos_bancarios')
    .update({
      conciliado: true,
      conciliado_tabla: 'flujo_caja_manual',
      conciliado_id: flujo.id,
    })
    .eq('id', movimiento_id)
  if (eMovUpd) {
    // La fila de flujo ya se creó; registrar acción REVERSIBLE (ok:true) con el
    // flujo_id para poder limpiarla con deshacer, y devolver 500.
    await registrarAccion({
      herramienta: 'conciliar-vario',
      payload: { flujo_id: flujo.id, parcial: 'flujo creado, movimiento no marcado', error: eMovUpd.message },
      resultado_tabla: 'movimientos_bancarios',
      resultado_id: movimiento_id,
      ok: true,
      error: eMovUpd.message,
    })
    return NextResponse.json({ error: eMovUpd.message, flujo_id: flujo.id }, { status: 500 })
  }

  // ── 3. Log reversible ───────────────────────────────────────────────────────
  await registrarAccion({
    herramienta: 'conciliar-vario',
    payload: { flujo_id: flujo.id },
    resultado_tabla: 'movimientos_bancarios',
    resultado_id: movimiento_id,
    ok: true,
  })

  return NextResponse.json({
    ok: true,
    flujo_id: flujo.id,
    tipo: tipoFlujo,
    monto: montoResto,
    monto_movimiento: mov.monto,
    monto_asignado_obligaciones: sumaLedger,
  })
}
