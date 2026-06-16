// propuestas/01-proyeccion-caja/route.draft.ts
//
// DRAFT del route handler GET /api/agent/proyeccion-caja
// Este archivo NO está conectado a Next.js (extensión .draft.ts → ignorado por el router).
// Copiar a app/api/agent/proyeccion-caja/route.ts al incorporar.
//
// Parámetros de query:
//   dias            → horizonte en días (default: 90)
//   saldo_inicial   → saldo de caja actual en CLP (requerido; la app no lo tiene automático)
//   plazo_cobro     → días desde fecha_factura para estimar cobro (default: 30)
//   plazo_aprobado  → días desde hoy para cotizaciones aprobadas sin factura (default: 60)
//   dia_nomina      → día del mes en que se paga la nómina (default: 30)
//   dias_gasto_pend → días estimados hasta pago de gastos pendientes sin fecha (default: 15)

import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { COT_COBRAR_SELECT, calcularTotalCot, clienteCot } from '@/app/actions/financiero-helpers'
import { _getNomina } from '@/app/actions/financiero-config'
import { calcularRetencion } from '@/lib/rendiciones-calc'
import {
  proyectarCaja,
  agregarDiasAFecha,
  fechasNominaEnHorizonte,
  type MovimientoProyectado,
  type Supuestos,
} from '@/lib/agent-proyeccion-caja'

export const runtime = 'nodejs'

// GET /api/agent/proyeccion-caja?dias=90&saldo_inicial=5000000&plazo_cobro=30&dia_nomina=30
export async function GET(req: Request) {
  // ── Autenticación ──────────────────────────────────────────────────────────
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  // ── Parámetros y supuestos ─────────────────────────────────────────────────
  const { searchParams } = new URL(req.url)

  const horizonteDias = parseInt(searchParams.get('dias') ?? '90', 10)
  if (!Number.isFinite(horizonteDias) || horizonteDias < 1 || horizonteDias > 365) {
    return NextResponse.json({ error: 'dias debe ser un entero entre 1 y 365' }, { status: 400 })
  }

  const saldoInicialRaw = searchParams.get('saldo_inicial')
  if (!saldoInicialRaw) {
    return NextResponse.json(
      { error: 'saldo_inicial es requerido. Ingresa el saldo actual de caja en CLP.' },
      { status: 400 },
    )
  }
  const saldoInicial = parseFloat(saldoInicialRaw)
  if (!Number.isFinite(saldoInicial)) {
    return NextResponse.json({ error: 'saldo_inicial debe ser un número válido' }, { status: 400 })
  }

  const plazoCobro = Math.max(0, parseInt(searchParams.get('plazo_cobro') ?? '30', 10))
  const plazoAprobado = Math.max(0, parseInt(searchParams.get('plazo_aprobado') ?? '60', 10))
  const diaNomina = Math.min(31, Math.max(1, parseInt(searchParams.get('dia_nomina') ?? '30', 10)))
  const diasGastoPend = Math.max(0, parseInt(searchParams.get('dias_gasto_pend') ?? '15', 10))

  const hoy = new Date().toISOString().slice(0, 10)
  const fechaLimite = agregarDiasAFecha(hoy, horizonteDias)

  const admin = createAdminClient()

  // ── Queries en paralelo ────────────────────────────────────────────────────
  const [
    { data: cotFacturadas, error: errFact },
    { data: cotAprobadas, error: errApro },
    { data: cuotasPend, error: errCuotas },
    { data: gastosPorPagar, error: errGastos },
  ] = await Promise.all([
    // ENTRADA: cotizaciones facturadas sin pago → cobro estimado = fecha_factura + plazo_cobro
    admin
      .from('cotizaciones')
      .select(COT_COBRAR_SELECT)
      .not('fecha_factura_emitida', 'is', null)
      .is('fecha_pago_recibido', null),

    // ENTRADA (más incierta): aprobadas / en producción sin factura emitida
    admin
      .from('cotizaciones')
      .select(COT_COBRAR_SELECT)
      .in('estado', ['aprobada', 'en_produccion'])
      .is('fecha_factura_emitida', null),

    // SALIDA: cuotas de crédito pendientes con fecha exacta
    admin
      .from('gastos_fijos_cuotas')
      .select('id, monto, fecha_vencimiento, pagada, gasto_fijo:gastos_fijos(nombre, acreedor)')
      .eq('pagada', false)
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', fechaLimite)
      .order('fecha_vencimiento', { ascending: true }),

    // SALIDA: gastos por pagar (interno+enviada / externo+aprobada), en neto
    admin
      .from('rendicion_gastos')
      .select(
        'id, monto, tipo_documento, razon_social_emisor, descripcion, fecha_documento, ' +
          'rendicion:rendiciones(cotizacion:cotizaciones(nombre))',
      )
      .or('and(origen.eq.interno,estado.eq.enviada),and(origen.eq.externo,estado.eq.aprobada)'),
  ])

  const firstErr = errFact || errApro || errCuotas || errGastos
  if (firstErr) return NextResponse.json({ error: firstErr.message }, { status: 500 })

  // ── Nómina ─────────────────────────────────────────────────────────────────
  const nominaPersonas = await _getNomina()
  const montoNominaMensual = (nominaPersonas ?? []).reduce((s, p) => s + (p.monto ?? 0), 0)

  // ── Armar movimientos ──────────────────────────────────────────────────────
  const movimientos: MovimientoProyectado[] = []

  // ENTRADAS: cotizaciones facturadas (cobro estimado = fecha_factura + plazo)
  for (const c of (cotFacturadas ?? []) as any[]) {
    const fechaFactura = c.fecha_factura_emitida as string
    const fechaCobro = agregarDiasAFecha(fechaFactura, plazoCobro)
    // Incluir solo las que caen dentro del horizonte; pasadas las traemos igual
    // (ya deberían haberse cobrado, pero las dejamos para que el agente las vea)
    if (fechaCobro > fechaLimite) continue
    // Si la fecha estimada ya pasó, la movemos a "hoy" (está pendiente de cobro).
    const fechaEfectiva = fechaCobro < hoy ? hoy : fechaCobro
    const monto = calcularTotalCot(c)
    if (!Number.isFinite(monto) || monto <= 0) continue
    movimientos.push({
      fecha: fechaEfectiva,
      monto: Math.round(monto),
      tipo: 'entrada',
      concepto: `Cobro cotización: ${clienteCot(c)} — ${c.nombre ?? ''}`.trim(),
      categoria: 'cobro_cotizacion',
      fecha_estimada: true,
    })
  }

  // ENTRADAS: cotizaciones aprobadas sin factura (más inciertas)
  for (const c of (cotAprobadas ?? []) as any[]) {
    const fechaCobro = agregarDiasAFecha(hoy, plazoAprobado)
    if (fechaCobro > fechaLimite) continue
    const monto = calcularTotalCot(c)
    if (!Number.isFinite(monto) || monto <= 0) continue
    movimientos.push({
      fecha: fechaCobro,
      monto: Math.round(monto),
      tipo: 'entrada',
      concepto: `Cobro (aprobado/sin factura): ${clienteCot(c)} — ${c.nombre ?? ''}`.trim(),
      categoria: 'cobro_aprobado',
      fecha_estimada: true,
    })
  }

  // SALIDAS: cuotas de crédito (fecha exacta)
  for (const cuota of (cuotasPend ?? []) as any[]) {
    const monto = parseFloat(cuota.monto)
    if (!Number.isFinite(monto) || monto <= 0) continue
    const gf = cuota.gasto_fijo as { nombre?: string; acreedor?: string } | null
    movimientos.push({
      fecha: cuota.fecha_vencimiento as string,
      monto: Math.round(monto),
      tipo: 'salida',
      concepto: `Cuota crédito: ${gf?.nombre ?? 'Crédito'} (${gf?.acreedor ?? ''})`.trim(),
      categoria: 'cuota_credito',
      fecha_estimada: false,
    })
  }

  // SALIDAS: nómina (recurrente mensual, fecha estimada)
  const fechasNomina = fechasNominaEnHorizonte(hoy, fechaLimite, diaNomina)
  for (const fecha of fechasNomina) {
    movimientos.push({
      fecha,
      monto: Math.round(montoNominaMensual),
      tipo: 'salida',
      concepto: `Nómina mensual (${nominaPersonas?.length ?? 0} personas)`,
      categoria: 'nomina',
      fecha_estimada: true,
    })
  }

  // SALIDAS: gastos por pagar (en neto, fecha estimada)
  for (const g of (gastosPorPagar ?? []) as any[]) {
    const monto = parseFloat(g.monto)
    if (!Number.isFinite(monto) || monto <= 0) continue
    const { neto } = calcularRetencion({ monto, tipo_documento: g.tipo_documento })
    if (neto <= 0) continue

    // Fecha estimada: usar fecha_documento si existe y es futura, si no → hoy + días config.
    let fechaPago: string
    let esEstimada = true
    if (g.fecha_documento && (g.fecha_documento as string) >= hoy) {
      fechaPago = g.fecha_documento as string
      esEstimada = true // sigue siendo estimada (es fecha del doc, no del pago)
    } else {
      fechaPago = agregarDiasAFecha(hoy, diasGastoPend)
    }
    if (fechaPago > fechaLimite) continue

    const proveedor = (g.razon_social_emisor || g.descripcion || 'Proveedor') as string
    const contexto = ((g.rendicion as any)?.cotizacion?.nombre ?? '') as string
    movimientos.push({
      fecha: fechaPago,
      monto: Math.round(neto),
      tipo: 'salida',
      concepto: `Gasto: ${proveedor}${contexto ? ` (${contexto})` : ''}`.trim(),
      categoria: 'gasto_por_pagar',
      fecha_estimada: esEstimada,
    })
  }

  // ── Supuestos explícitos (devueltos junto al resultado) ────────────────────
  const supuestos: Supuestos = {
    saldo_inicial: Math.round(saldoInicial),
    horizonte_dias: horizonteDias,
    plazo_cobro_dias: plazoCobro,
    plazo_cobro_aprobado_dias: plazoAprobado,
    dia_pago_nomina: diaNomina,
    monto_nomina_mensual: Math.round(montoNominaMensual),
    dias_pago_gasto_pendiente: diasGastoPend,
  }

  // ── Proyectar ──────────────────────────────────────────────────────────────
  const resultado = proyectarCaja({
    saldoInicial: Math.round(saldoInicial),
    movimientos,
    horizonteDias,
    supuestos,
    hoy,
  })

  // ── Respuesta ──────────────────────────────────────────────────────────────
  return NextResponse.json({
    // Advertencia de supuestos siempre al tope — el agente debe mencionarla.
    aviso_supuestos:
      'Proyección estimada bajo los supuestos declarados. Para mayor precisión: ' +
      'mantener saldo_inicial sincronizado con la caja real; registrar plazo de ' +
      'cobro por cliente; registrar fecha estimada de pago en cada gasto pendiente.',
    supuestos: resultado.supuestos,
    resumen: resultado.resumen_texto,
    primera_fecha_negativa: resultado.primera_fecha_negativa,
    saldo_final: resultado.saldo_final,
    saldo_minimo: resultado.saldo_minimo,
    fecha_saldo_minimo: resultado.fecha_saldo_minimo,
    totales: resultado.totales,
    linea_tiempo: resultado.linea_tiempo,
  })
}
