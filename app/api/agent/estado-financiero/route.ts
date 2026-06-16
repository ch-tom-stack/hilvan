import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { COT_COBRAR_SELECT, calcularTotalCot, clienteCot } from '@/app/actions/financiero-helpers'
import { _getNomina } from '@/app/actions/financiero-config'
import { calcularRetencion } from '@/types'
import {
  normalizarPeriodo,
  periodoActual,
  rangoPeriodo,
  agregarPorCategoria,
  etiquetaCategoria,
  construirAlertas,
} from '@/lib/agent-estado-financiero'

export const runtime = 'nodejs'

// GET /api/agent/estado-financiero?periodo=YYYY-MM
//
// Resumen financiero del mes para que el agente narre "cómo vamos": ingresos
// (facturado / cobrado / por cobrar), egresos (proyecto + mensual, netos de NC),
// cuotas de crédito del mes y flujo de caja vario.
//
// Reutiliza las MISMAS fórmulas del módulo financiero:
//   - total de cotización  → calcularTotalCot (app/actions/financiero-helpers.ts)
//   - cliente de cotización → clienteCot (idem)
//   - select de cotización  → COT_COBRAR_SELECT (idem)
// No toca configuracion_financiero (PPM/Previred/IUSC/nómina) — fuera de v1.
//
// "Dentro del período" usa la fecha relevante de cada tabla:
//   - cotizaciones: fecha_factura_emitida (facturado) / fecha_pago_recibido (cobrado)
//   - gastos:       fecha_documento con fallback a created_at (cuadre tributario)
//   - flujo:        fecha
//   - cuotas:       fecha_vencimiento
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const periodo = normalizarPeriodo(searchParams.get('periodo')) ?? periodoActual()
  const { inicio, finExcl } = rangoPeriodo(periodo)

  const admin = createAdminClient()

  // ── Cotizaciones: facturadas o cobradas en cualquier momento (filtramos por
  //    período en memoria) + las por cobrar (facturadas sin pago). Traemos las
  //    facturadas del período y las pendientes en consultas separadas. ─────────
  const [
    { data: cotFacturadas, error: errFact },
    { data: cotPorCobrar, error: errCobrar },
    { data: gastosProy, error: errProy },
    { data: gastosMens, error: errMens },
    { data: cuotas, error: errCuotas },
    { data: flujo, error: errFlujo },
  ] = await Promise.all([
    // Facturadas dentro del período (para facturado_periodo).
    admin
      .from('cotizaciones')
      .select(COT_COBRAR_SELECT)
      .gte('fecha_factura_emitida', inicio)
      .lt('fecha_factura_emitida', finExcl),

    // Por cobrar: facturadas (en cualquier mes) y sin pago.
    admin
      .from('cotizaciones')
      .select(COT_COBRAR_SELECT)
      .not('fecha_factura_emitida', 'is', null)
      .is('fecha_pago_recibido', null)
      .order('fecha_factura_emitida', { ascending: true }),

    // Gastos de proyecto: cuadre por fecha_documento con fallback a created_at.
    admin
      .from('rendicion_gastos')
      .select('id, monto, tipo, tipo_documento, pagado, fecha_pago, fecha_documento, created_at')
      .or(
        `and(fecha_documento.gte.${inicio},fecha_documento.lt.${finExcl}),` +
          `and(fecha_documento.is.null,created_at.gte.${inicio}T00:00:00.000Z,created_at.lt.${finExcl}T00:00:00.000Z)`,
      ),

    // Gastos mensuales: mismo cuadre tributario.
    admin
      .from('rendicion_mensual_gastos')
      .select('id, monto, categoria, tipo_documento, pagado, fecha_pago, fecha_documento, created_at')
      .or(
        `and(fecha_documento.gte.${inicio},fecha_documento.lt.${finExcl}),` +
          `and(fecha_documento.is.null,created_at.gte.${inicio}T00:00:00.000Z,created_at.lt.${finExcl}T00:00:00.000Z)`,
      ),

    // Cuotas de crédito que vencen dentro del período.
    admin
      .from('gastos_fijos_cuotas')
      .select('id, numero_cuota, monto, fecha_vencimiento, pagada, gasto_fijo:gastos_fijos(nombre, acreedor)')
      .gte('fecha_vencimiento', inicio)
      .lt('fecha_vencimiento', finExcl)
      .order('fecha_vencimiento', { ascending: true }),

    // Flujo de caja manual del período.
    admin
      .from('flujo_caja_manual')
      .select('id, descripcion, monto, fecha, tipo')
      .gte('fecha', inicio)
      .lt('fecha', finExcl),
  ])

  const firstErr =
    errFact || errCobrar || errProy || errMens || errCuotas || errFlujo
  if (firstErr) return NextResponse.json({ error: firstErr.message }, { status: 500 })

  // ── Panorama completo: por facturar, por pagar (deuda real), deuda de crédito
  //    vigente, inversiones (solo estado) y nómina. Reusa las MISMAS definiciones
  //    del módulo financiero ya validadas. ──────────────────────────────────────
  const [
    { data: cotPorFacturar, error: ePF },
    { data: gastosPorPagar, error: ePP },
    { data: cuotasPend, error: eDeuda },
    { data: inversionesRows, error: eInv },
  ] = await Promise.all([
    // Por facturar: aprobadas / en producción sin factura emitida (igual que /financiero/cobrar).
    admin
      .from('cotizaciones')
      .select(COT_COBRAR_SELECT)
      .in('estado', ['aprobada', 'en_produccion'])
      .is('fecha_factura_emitida', null)
      .order('fecha_respuesta_cliente', { ascending: true }),

    // Por pagar (deuda real): misma definición que Centro de costos · Revisión.
    admin
      .from('rendicion_gastos')
      .select('id, monto, tipo_documento, razon_social_emisor, descripcion, rendicion:rendiciones(cotizacion:cotizaciones(nombre))')
      .or('and(origen.eq.interno,estado.eq.enviada),and(origen.eq.externo,estado.eq.aprobada)'),

    // Deuda de crédito vigente: todas las cuotas pendientes (no solo las del mes).
    admin
      .from('gastos_fijos_cuotas')
      .select('monto, fecha_vencimiento, pagada, gasto_fijo:gastos_fijos(nombre, acreedor)')
      .eq('pagada', false)
      .order('fecha_vencimiento', { ascending: true }),

    // Inversiones: solo estado (no se da consejo de inversión).
    admin
      .from('inversiones')
      .select('id, descripcion, monto, fecha_compra')
      .order('fecha_compra', { ascending: false }),
  ])
  const errPanorama = ePF || ePP || eDeuda || eInv
  if (errPanorama) return NextResponse.json({ error: errPanorama.message }, { status: 500 })

  const nominaPersonas = await _getNomina()

  // ── Ingresos ──────────────────────────────────────────────────────────────
  const facturado_periodo = (cotFacturadas ?? []).reduce(
    (s, c: any) => s + calcularTotalCot(c),
    0,
  )

  // Cobrado: de las cotizaciones cobradas con fecha_pago_recibido en el período.
  // (Las facturadas del período pueden no estar cobradas; las por cobrar nunca
  //  lo están. Para cobrado_periodo consultamos las pagadas en el mes.)
  const { data: cotCobradas, error: errCob } = await admin
    .from('cotizaciones')
    .select(COT_COBRAR_SELECT)
    .gte('fecha_pago_recibido', inicio)
    .lt('fecha_pago_recibido', finExcl)
  if (errCob) return NextResponse.json({ error: errCob.message }, { status: 500 })

  const cobrado_periodo = (cotCobradas ?? []).reduce(
    (s, c: any) => s + calcularTotalCot(c),
    0,
  )

  const hoy = new Date()
  const porCobrarItems = (cotPorCobrar ?? []).map((c: any) => {
    const dias = Math.floor(
      (hoy.getTime() - new Date(c.fecha_factura_emitida).getTime()) / 86400000,
    )
    return {
      numero: (c.grupo as any)?.numero_base ?? null,
      cliente: clienteCot(c),
      monto: calcularTotalCot(c),
      dias_aging: dias,
    }
  })
  const porCobrarTotal = porCobrarItems.reduce((s, i) => s + i.monto, 0)

  // ── Egresos (proyecto + mensual, netos de NC: montos negativos restan) ──────
  const proyItems = (gastosProy ?? []) as any[]
  const mensItems = (gastosMens ?? []) as any[]

  const egresosProy = proyItems.reduce((s, g) => s + (g.monto ?? 0), 0)
  const egresosMens = mensItems.reduce((s, g) => s + (g.monto ?? 0), 0)
  const egresosTotal = egresosProy + egresosMens

  // Por categoría: proyecto agrupa por `tipo`, mensual por `categoria`. Se unifican
  // bajo una etiqueta canónica (etiquetaCategoria) para no duplicar honorarios/etc.
  const porCategoria = agregarPorCategoria(
    [
      ...proyItems.map((g) => ({ k: etiquetaCategoria(g.tipo as string | null), m: g.monto ?? 0 })),
      ...mensItems.map((g) => ({ k: etiquetaCategoria(g.categoria as string | null), m: g.monto ?? 0 })),
    ],
    (x) => x.k,
    (x) => x.m,
    'Sin categoría',
  )

  // Pagado: suma de asignaciones del ledger `conciliaciones` a los gastos del período
  // (refleja pagos PARCIALES, no el booleano todo-o-nada). Se topa al monto de cada
  // gasto para que una sobre-asignación accidental no infle el pagado.
  const proyIds = proyItems.map((g) => g.id as string)
  const mensIds = mensItems.map((g) => g.id as string)
  const allIds = [...proyIds, ...mensIds]
  const asignadoPorGasto = new Map<string, number>()
  if (allIds.length > 0) {
    const { data: asg, error: eAsg } = await admin
      .from('conciliaciones')
      .select('match_tabla, match_id, monto')
      .in('match_id', allIds)
      .in('match_tabla', ['rendicion_gastos', 'rendicion_mensual_gastos'])
    if (eAsg) return NextResponse.json({ error: eAsg.message }, { status: 500 })
    const proySet = new Set(proyIds)
    const mensSet = new Set(mensIds)
    for (const a of (asg ?? []) as { match_tabla: string; match_id: string; monto: number }[]) {
      const ok =
        (a.match_tabla === 'rendicion_gastos' && proySet.has(a.match_id)) ||
        (a.match_tabla === 'rendicion_mensual_gastos' && mensSet.has(a.match_id))
      if (ok) asignadoPorGasto.set(a.match_id, (asignadoPorGasto.get(a.match_id) ?? 0) + (a.monto ?? 0))
    }
  }
  // Valor pagado de un gasto:
  //  - SALDADO (pagado=true: conciliación cubierta, o pago manual/efectivo) → su BRUTO
  //    (g.monto). En boletas de honorarios la retención también es plata que sale de la
  //    empresa —al SII—, así que el costo pagado es el bruto, no el neto transferido.
  //  - PARCIAL (aún no saldado) → lo asignado en el ledger hasta ahora (lo que ya salió).
  const pagadoDeGasto = (g: any) => {
    if (g.pagado) return Math.max(0, g.monto ?? 0)
    return Math.max(0, Math.min(asignadoPorGasto.get(g.id) ?? 0, g.monto ?? 0))
  }
  const egresosPagado =
    proyItems.reduce((s, g) => s + pagadoDeGasto(g), 0) +
    mensItems.reduce((s, g) => s + pagadoDeGasto(g), 0)
  const egresosAdeudado = egresosTotal - egresosPagado

  // ── Créditos: cuotas del período ────────────────────────────────────────────
  const cuotasItems = (cuotas ?? []).map((c: any) => ({
    credito: c.gasto_fijo?.nombre ?? null,
    acreedor: c.gasto_fijo?.acreedor ?? null,
    monto: c.monto ?? 0,
    fecha_vencimiento: c.fecha_vencimiento,
    pagada: c.pagada ?? false,
  }))
  const totalCuotas = cuotasItems.reduce((s, c) => s + c.monto, 0)
  const cuotasPagadas = cuotasItems
    .filter((c) => c.pagada)
    .reduce((s, c) => s + c.monto, 0)
  const cuotasPendientes = totalCuotas - cuotasPagadas

  // ── Por facturar: aprobado/en producción sin factura (plata lista para facturar) ──
  const porFacturarItems = (cotPorFacturar ?? []).map((c: any) => {
    const ref = c.fecha_respuesta_cliente
    const dias = ref ? Math.floor((hoy.getTime() - new Date(ref).getTime()) / 86400000) : null
    return {
      numero: (c.grupo as any)?.numero_base ?? null,
      cliente: clienteCot(c),
      monto: Math.round(calcularTotalCot(c)),
      dias_aprobado: dias,
    }
  })
  const porFacturarTotal = porFacturarItems.reduce((s, i) => s + i.monto, 0)

  // ── Por pagar (deuda real, en neto): interno+enviada / externo+aprobada ──────
  const porPagarItems = ((gastosPorPagar ?? []) as any[]).map((g) => {
    const { neto } = calcularRetencion({ monto: g.monto ?? 0, tipo_documento: g.tipo_documento })
    return {
      proveedor: g.razon_social_emisor || g.descripcion || '—',
      contexto: (g.rendicion as any)?.cotizacion?.nombre ?? 'Proyecto',
      neto: Math.round(neto),
    }
  })
  const porPagarTotal = porPagarItems.reduce((s, i) => s + i.neto, 0)

  // ── Deuda de crédito vigente (todas las cuotas pendientes) ──────────────────
  const cuotasPendRows = (cuotasPend ?? []) as any[]
  const deudaVigente = cuotasPendRows.reduce((s, c) => s + (c.monto ?? 0), 0)
  const proximaCuota = cuotasPendRows[0]
    ? {
        credito: cuotasPendRows[0].gasto_fijo?.nombre ?? null,
        monto: Math.round(cuotasPendRows[0].monto ?? 0),
        fecha_vencimiento: cuotasPendRows[0].fecha_vencimiento,
      }
    : null

  // ── Inversiones (solo estado, sin consejo de inversión) ──────────────────────
  const inversionesItems = ((inversionesRows ?? []) as any[]).map((i) => ({
    descripcion: i.descripcion,
    monto: Math.round(i.monto ?? 0),
    fecha_compra: i.fecha_compra,
  }))
  const inversionesTotal = inversionesItems.reduce((s, i) => s + i.monto, 0)

  // ── Nómina (planilla de sueldo mensual) ──────────────────────────────────────
  const nominaTotal = (nominaPersonas ?? []).reduce((s, p) => s + (p.monto ?? 0), 0)

  // ── Flujo vario ─────────────────────────────────────────────────────────────
  const flujoRows = (flujo ?? []) as any[]
  const flujoEntradas = flujoRows
    .filter((f) => f.tipo === 'entrada')
    .reduce((s, f) => s + (f.monto ?? 0), 0)
  const flujoSalidas = flujoRows
    .filter((f) => f.tipo === 'salida')
    .reduce((s, f) => s + (f.monto ?? 0), 0)

  // ── Resumen ─────────────────────────────────────────────────────────────────
  const resultado_devengado = facturado_periodo - egresosTotal
  const caja_aprox = cobrado_periodo + flujoEntradas - egresosPagado - flujoSalidas

  // ── Alertas (feedback proactivo) ────────────────────────────────────────────
  const alertas = construirAlertas({
    porCobrar: porCobrarItems,
    cuotas: cuotasItems,
    hoy: hoy.toISOString().slice(0, 10),
    resultadoDevengado: Math.round(resultado_devengado),
    cajaAprox: Math.round(caja_aprox),
  })

  return NextResponse.json({
    periodo,
    alertas,
    ingresos: {
      facturado_periodo: Math.round(facturado_periodo),
      cobrado_periodo: Math.round(cobrado_periodo),
      por_cobrar: {
        total: Math.round(porCobrarTotal),
        items: porCobrarItems.map((i) => ({ ...i, monto: Math.round(i.monto) })),
      },
      // Aprobado/en producción SIN factura emitida: plata lista para facturar y cobrar.
      por_facturar: {
        total: Math.round(porFacturarTotal),
        items: porFacturarItems,
      },
    },
    egresos: {
      total: Math.round(egresosTotal),
      por_origen: {
        proyecto: Math.round(egresosProy),
        mensual: Math.round(egresosMens),
      },
      por_categoria: Object.fromEntries(
        Object.entries(porCategoria).map(([k, v]) => [k, Math.round(v)]),
      ),
      // por_pagar = deuda REAL en el modelo de Hilván (lo que falta pagar, en neto):
      // gasto interno+enviada / externo+aprobada. Esto es "lo que debes pagar".
      por_pagar: {
        total_neto: Math.round(porPagarTotal),
        count: porPagarItems.length,
        items: porPagarItems,
      },
      // conciliado/no_conciliado = cruce con cartola bancaria (OTRO concepto: NO es
      // "lo que debes", sino qué gasto del período ya se cruzó contra un movimiento).
      conciliado: Math.round(egresosPagado),
      no_conciliado: Math.round(egresosAdeudado),
    },
    creditos: {
      cuotas_periodo: cuotasItems.map((c) => ({ ...c, monto: Math.round(c.monto) })),
      total_cuotas_periodo: Math.round(totalCuotas),
      pagadas: Math.round(cuotasPagadas),
      pendientes: Math.round(cuotasPendientes),
      // Deuda de crédito vigente total (todas las cuotas pendientes, no solo del mes).
      deuda_vigente_total: Math.round(deudaVigente),
      cuotas_pendientes_count: cuotasPendRows.length,
      proxima_cuota: proximaCuota,
    },
    nomina: {
      personas: (nominaPersonas ?? []).map((p) => ({
        nombre: p.nombre,
        monto: Math.round(p.monto ?? 0),
        tipo: p.tipo,
      })),
      total_mensual: Math.round(nominaTotal),
    },
    // Solo estado — el agente NO da consejo de inversión (comprar/vender/dónde).
    inversiones: {
      total: Math.round(inversionesTotal),
      items: inversionesItems,
    },
    flujo_varios: {
      entradas: Math.round(flujoEntradas),
      salidas: Math.round(flujoSalidas),
    },
    resumen: {
      resultado_devengado: Math.round(resultado_devengado),
      caja_aprox: Math.round(caja_aprox),
    },
  })
}
