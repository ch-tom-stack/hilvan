'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRol } from '@/lib/auth'
import { mesAnterior } from '@/lib/periodos'
import { parseFechaLocal } from '@/lib/fechas'
import {
  finPeriodo, toDateStr, addDays,
  COT_COBRAR_SELECT, calcularTotalCot, clienteCot,
} from './financiero-helpers'
import { getDatosFinancieros } from './financiero-resultados'

// ─────────────────────────────────────────────────────────────────────────────
// FLUJO DE CAJA
// ─────────────────────────────────────────────────────────────────────────────

export type OrigenMovimiento = 'cobro_estimado' | 'cuota_credito' | 'tributario' | 'manual'

export interface MovimientoFlujo {
  id: string
  fecha: string          // YYYY-MM-DD
  tipo: 'entrada' | 'salida'
  descripcion: string
  monto: number
  origen: OrigenMovimiento
  editable: boolean
}

export interface CierreMesAnterior {
  periodo: string
  cerrado: boolean
  saldo_apertura: number
  /** Apertura + movimientos manuales registrados en ese mes */
  saldo_calculado: number
  saldo_cierre_real: number | null
  notas_cierre: string | null
}

export interface DatosFlujo {
  hoy: string            // YYYY-MM-DD
  fin_ventana: string    // hoy + 60 días
  periodo_actual: string // YYYY-MM
  saldo_apertura: number
  movimientos: MovimientoFlujo[]
  cierre_anterior: CierreMesAnterior
}

export async function getDatosFlujo(): Promise<DatosFlujo> {
  await requireRol(['admin', 'contabilidad'])
  const supabase = await createClient()

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const hoyStr = toDateStr(hoy)
  const fin60Str = toDateStr(addDays(hoy, 60))

  const periodoActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const mesAnt = mesAnterior(periodoActual)
  const inicioAnt = `${mesAnt}-01`
  const finAnt = finPeriodo(mesAnt)

  // día 12 del mes siguiente — pago tributario estimado
  const nextMonth = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 12)
  const dia12NextStr = toDateStr(nextMonth)

  const [
    tributario,
    { data: cajaPeriodoActual },
    { data: cajaMesAnt },
    { data: cotPorCobrar },
    { data: cuotasPendientes },
    { data: flujosVentana },
    { data: flujosMesAnt },
  ] = await Promise.all([
    // tributario del mes actual (retenciones + IVA)
    getDatosFinancieros(periodoActual).then(d => d.tributario),

    // apertura período actual
    supabase.from('caja_periodos').select('*').eq('periodo', periodoActual).maybeSingle(),

    // apertura/cierre mes anterior
    supabase.from('caja_periodos').select('*').eq('periodo', mesAnt).maybeSingle(),

    // facturas emitidas sin cobrar → cobro estimado = fecha_factura + 30 días
    supabase.from('cotizaciones')
      .select(COT_COBRAR_SELECT)
      .not('fecha_factura_emitida', 'is', null)
      .is('fecha_pago_recibido', null),

    // cuotas pendientes en ventana 60 días
    supabase.from('gastos_fijos_cuotas')
      .select('id, numero_cuota, monto, fecha_vencimiento, gasto_fijo:gastos_fijos(nombre)')
      .eq('pagada', false)
      .gte('fecha_vencimiento', hoyStr)
      .lte('fecha_vencimiento', fin60Str)
      .order('fecha_vencimiento'),

    // movimientos manuales en ventana
    supabase.from('flujo_caja_manual')
      .select('*')
      .gte('fecha', hoyStr)
      .lte('fecha', fin60Str)
      .order('fecha'),

    // movimientos manuales mes anterior (para saldo_calculado del cierre)
    supabase.from('flujo_caja_manual')
      .select('*')
      .gte('fecha', inicioAnt)
      .lte('fecha', finAnt),
  ])

  const saldo_apertura: number = (cajaPeriodoActual as any)?.saldo_apertura ?? 0

  // ── Construir lista de movimientos ────────────────────────────────────────
  const movimientos: MovimientoFlujo[] = []

  // 1. Cobros estimados (entradas automáticas)
  for (const cot of (cotPorCobrar ?? [])) {
    const fechaEst = toDateStr(addDays(parseFechaLocal((cot as any).fecha_factura_emitida), 30))
    if (fechaEst >= hoyStr && fechaEst <= fin60Str) {
      movimientos.push({
        id: `cobro_${(cot as any).id}`,
        fecha: fechaEst,
        tipo: 'entrada',
        descripcion: `Cobro est. — ${clienteCot(cot)}${(cot as any).numero_factura ? ` · F${(cot as any).numero_factura}` : ''}`,
        monto: calcularTotalCot(cot),
        origen: 'cobro_estimado',
        editable: false,
      })
    }
  }

  // 2. Cuotas de créditos (salidas automáticas)
  for (const cuota of (cuotasPendientes ?? [])) {
    const c = cuota as any
    movimientos.push({
      id: `cuota_${c.id}`,
      fecha: c.fecha_vencimiento,
      tipo: 'salida',
      descripcion: `${c.gasto_fijo?.nombre ?? 'Crédito'} — Cuota ${c.numero_cuota}`,
      monto: c.monto,
      origen: 'cuota_credito',
      editable: false,
    })
  }

  // 3. Tributario estimado (si el día 12 del mes siguiente cae en la ventana)
  if (dia12NextStr >= hoyStr && dia12NextStr <= fin60Str) {
    if (tributario.retenciones_bh > 0) {
      movimientos.push({
        id: 'tributario_bh',
        fecha: dia12NextStr,
        tipo: 'salida',
        descripcion: 'Retenciones boletas de honorarios (est.)',
        monto: tributario.retenciones_bh,
        origen: 'tributario',
        editable: false,
      })
    }
    if (tributario.saldo_iva > 0) {
      movimientos.push({
        id: 'tributario_iva',
        fecha: dia12NextStr,
        tipo: 'salida',
        descripcion: 'IVA a pagar (est.)',
        monto: tributario.saldo_iva,
        origen: 'tributario',
        editable: false,
      })
    }
  }

  // 4. Movimientos manuales en ventana
  for (const f of (flujosVentana ?? [])) {
    const m = f as any
    movimientos.push({
      id: m.id,
      fecha: m.fecha,
      tipo: m.tipo,
      descripcion: m.descripcion,
      monto: m.monto,
      origen: 'manual',
      editable: true,
    })
  }

  movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha))

  // ── Cierre mes anterior ───────────────────────────────────────────────────
  const saldoAperturaAnt: number = (cajaMesAnt as any)?.saldo_apertura ?? 0
  const saldoCalculadoAnt = (flujosMesAnt ?? []).reduce((s: number, f: any) => {
    return f.tipo === 'entrada' ? s + f.monto : s - f.monto
  }, saldoAperturaAnt)

  const cierre_anterior: CierreMesAnterior = {
    periodo: mesAnt,
    cerrado: (cajaMesAnt as any)?.cerrado ?? false,
    saldo_apertura: saldoAperturaAnt,
    saldo_calculado: saldoCalculadoAnt,
    saldo_cierre_real: (cajaMesAnt as any)?.saldo_cierre_real ?? null,
    notas_cierre: (cajaMesAnt as any)?.notas_cierre ?? null,
  }

  return { hoy: hoyStr, fin_ventana: fin60Str, periodo_actual: periodoActual, saldo_apertura, movimientos, cierre_anterior }
}

// ── Mutaciones ────────────────────────────────────────────────────────────────

export async function upsertAperturaCaja(periodo: string, saldo_apertura: number): Promise<void> {
  await requireRol(['admin'])
  const supabase = await createClient()
  const { error } = await supabase.from('caja_periodos').upsert(
    { periodo, saldo_apertura, updated_at: new Date().toISOString() },
    { onConflict: 'periodo' }
  )
  if (error) throw error
}

export async function cerrarPeriodoCaja(
  periodo: string, saldo_cierre_real: number, notas_cierre: string
): Promise<void> {
  await requireRol(['admin'])
  const supabase = await createClient()
  const { error } = await supabase.from('caja_periodos').upsert(
    { periodo, cerrado: true, saldo_cierre_real, notas_cierre, updated_at: new Date().toISOString() },
    { onConflict: 'periodo' }
  )
  if (error) throw error
}

export async function agregarMovimientoFlujo(data: {
  tipo: 'entrada' | 'salida'
  descripcion: string
  monto: number
  fecha: string
}): Promise<MovimientoFlujo> {
  await requireRol(['admin'])
  const supabase = await createClient()
  const { data: row, error } = await supabase.from('flujo_caja_manual')
    .insert({ ...data, created_by: (await supabase.auth.getUser()).data.user?.id ?? null })
    .select('*').single()
  if (error) throw error
  return { id: (row as any).id, fecha: (row as any).fecha, tipo: (row as any).tipo, descripcion: (row as any).descripcion, monto: (row as any).monto, origen: 'manual', editable: true }
}

export async function editarMovimientoFlujo(id: string, data: {
  tipo: 'entrada' | 'salida'
  descripcion: string
  monto: number
  fecha: string
}): Promise<MovimientoFlujo> {
  await requireRol(['admin'])
  const supabase = await createClient()
  const { data: row, error } = await supabase.from('flujo_caja_manual')
    .update(data).eq('id', id).select('*').single()
  if (error) throw error
  return { id: (row as any).id, fecha: (row as any).fecha, tipo: (row as any).tipo, descripcion: (row as any).descripcion, monto: (row as any).monto, origen: 'manual', editable: true }
}

export async function eliminarMovimientoFlujo(id: string): Promise<void> {
  await requireRol(['admin'])
  const supabase = await createClient()
  const { error } = await supabase.from('flujo_caja_manual').delete().eq('id', id)
  if (error) throw error
}
