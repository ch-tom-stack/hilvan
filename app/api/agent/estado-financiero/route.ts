import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { COT_COBRAR_SELECT, calcularTotalCot, clienteCot } from '@/app/actions/financiero-helpers'
import {
  normalizarPeriodo,
  periodoActual,
  rangoPeriodo,
  agregarPorCategoria,
  etiquetaCategoria,
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

  const egresosPagado =
    proyItems.filter((g) => g.pagado).reduce((s, g) => s + (g.monto ?? 0), 0) +
    mensItems.filter((g) => g.pagado).reduce((s, g) => s + (g.monto ?? 0), 0)
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

  return NextResponse.json({
    periodo,
    ingresos: {
      facturado_periodo: Math.round(facturado_periodo),
      cobrado_periodo: Math.round(cobrado_periodo),
      por_cobrar: {
        total: Math.round(porCobrarTotal),
        items: porCobrarItems.map((i) => ({ ...i, monto: Math.round(i.monto) })),
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
      pagado: Math.round(egresosPagado),
      adeudado: Math.round(egresosAdeudado),
    },
    creditos: {
      cuotas_periodo: cuotasItems.map((c) => ({ ...c, monto: Math.round(c.monto) })),
      total_cuotas_periodo: Math.round(totalCuotas),
      pagadas: Math.round(cuotasPagadas),
      pendientes: Math.round(cuotasPendientes),
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
