'use server'

import { createClient } from '@/lib/supabase/server'
import { calcularRetencion } from '@/types'
import { mesAnterior, mismoMesAñoAnterior } from '@/lib/periodos'

const PPM_TASA = 0.016 // 1.6% — ajustar según tasa vigente de Casa Hiedra

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function inicioPeriodo(mes: string) { return `${mes}-01` }
function finPeriodo(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${mes}-${String(last).padStart(2, '0')}`
}

// Select mínimo para calcular totales de cotizaciones
const COT_FINANCIERO_SELECT = `
  id, nombre, estado, con_iva, descuento_global, descuento_global_tipo,
  fecha_factura_emitida, fecha_pago_recibido, numero_factura,
  cliente_nombre_libre,
  grupo:cotizacion_grupos(numero_base),
  cliente:clientes(nombre),
  departamentos:cotizacion_departamentos(
    subgrupos:cotizacion_subgrupos(
      items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo)
    ),
    items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo)
  )
`

function calcularTotalCot(cot: any): number {
  const deps: any[] = cot.departamentos ?? []
  let neto = 0
  for (const dep of deps) {
    for (const item of dep.items ?? []) {
      if (!item.incluido) {
        const base = item.precio_cliente * item.cantidad * item.dias
        neto += item.descuento_item_tipo === 'porcentaje'
          ? Math.round(base * (1 - item.descuento_item / 100))
          : Math.round(base - item.descuento_item)
      }
    }
    for (const sg of dep.subgrupos ?? []) {
      for (const item of sg.items ?? []) {
        if (!item.incluido) {
          const base = item.precio_cliente * item.cantidad * item.dias
          neto += item.descuento_item_tipo === 'porcentaje'
            ? Math.round(base * (1 - item.descuento_item / 100))
            : Math.round(base - item.descuento_item)
        }
      }
    }
  }
  let desc = 0
  if (cot.descuento_global > 0) {
    desc = cot.descuento_global_tipo === 'porcentaje'
      ? Math.round(neto * cot.descuento_global / 100)
      : cot.descuento_global
  }
  const neto_cd = neto - desc
  const iva = cot.con_iva ? Math.round(neto_cd * 0.19) : 0
  return neto_cd + iva
}

function nombreCot(cot: any): string {
  const base = (cot.grupo as any)?.numero_base ?? '—'
  return `${base} · ${cot.nombre}`
}

function clienteCot(cot: any): string {
  return (cot.cliente as any)?.nombre ?? cot.cliente_nombre_libre ?? '—'
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS
// ─────────────────────────────────────────────────────────────────────────────

export interface FilaCotizacion {
  id: string
  nombre: string
  cliente: string
  total: number
  fecha_factura?: string | null
  numero_factura?: string | null
  fecha_pago?: string | null
  dias_transcurridos?: number
}

export interface FilaGasto {
  id: string
  descripcion: string
  monto: number
  tipo_documento: string | null
  contexto: string // proyecto o categoría
  factura_casa_hiedra: boolean
}

export interface FilaCuota {
  id: string
  nombre_credito: string
  numero_cuota: number
  monto: number
  fecha_vencimiento: string
  pagada: boolean
}

export interface DatosFinancieros {
  periodo: string
  ingresos: {
    por_facturar: FilaCotizacion[]
    por_cobrar: FilaCotizacion[]
    cobrado: FilaCotizacion[]
  }
  egresos: {
    gastos_proyectos: FilaGasto[]
    gastos_operacionales: FilaGasto[]
    cuotas_creditos: FilaCuota[]
  }
  tributario: {
    retenciones_bh: number
    iva_debito: number
    iva_credito: number
    saldo_iva: number
    ppm_estimado: number
  }
  totales: {
    ingresos_cobrados: number
    egresos_confirmados: number
    utilidad_bruta: number
  }
}

export interface ResumenPeriodo {
  cobrado: number
  egresos: number
  utilidad: number
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER ACTION PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export async function getDatosFinancieros(mes: string): Promise<DatosFinancieros> {
  const supabase = await createClient()
  const inicio = inicioPeriodo(mes)
  const fin = finPeriodo(mes)
  const finTs = `${fin}T23:59:59`

  const [
    { data: cotPorFacturar },
    { data: cotPorCobrar },
    { data: cotCobrado },
    { data: gastosProyectos },
    { data: gastosOp },
    { data: cuotas },
  ] = await Promise.all([
    // Cotizaciones sin factura emitida (snapshot actual)
    supabase.from('cotizaciones')
      .select(COT_FINANCIERO_SELECT)
      .in('estado', ['aprobada', 'en_produccion'])
      .is('fecha_factura_emitida', null),

    // Cotizaciones con factura pero sin pago (snapshot actual)
    supabase.from('cotizaciones')
      .select(COT_FINANCIERO_SELECT)
      .not('fecha_factura_emitida', 'is', null)
      .is('fecha_pago_recibido', null),

    // Cotizaciones cobradas en el período
    supabase.from('cotizaciones')
      .select(COT_FINANCIERO_SELECT)
      .gte('fecha_pago_recibido', inicio)
      .lte('fecha_pago_recibido', fin),

    // Gastos de proyectos aprobados en el período
    supabase.from('rendicion_gastos')
      .select('id, descripcion, monto, tipo_documento, factura_casa_hiedra, rendicion:rendiciones(cotizacion:cotizaciones(nombre))')
      .in('estado', ['aprobada', 'pago_aprobado'])
      .gte('created_at', inicio)
      .lte('created_at', finTs),

    // Gastos operacionales del período
    supabase.from('rendicion_mensual_gastos')
      .select('id, descripcion, monto, tipo_documento, categoria, factura_casa_hiedra, rendicion_mensual:rendiciones_mensuales!inner(periodo)')
      .eq('rendicion_mensual.periodo', inicio),

    // Cuotas de crédito con vencimiento en el período
    supabase.from('gastos_fijos_cuotas')
      .select('id, numero_cuota, monto, fecha_vencimiento, pagada, gasto_fijo:gastos_fijos(nombre)')
      .gte('fecha_vencimiento', inicio)
      .lte('fecha_vencimiento', fin)
      .order('fecha_vencimiento'),
  ])

  // ── Ingresos ───────────────────────────────────────────────────────────────
  const hoy = new Date()

  const porFacturar: FilaCotizacion[] = (cotPorFacturar ?? []).map((c: any) => ({
    id: c.id,
    nombre: nombreCot(c),
    cliente: clienteCot(c),
    total: calcularTotalCot(c),
  }))

  const porCobrar: FilaCotizacion[] = (cotPorCobrar ?? []).map((c: any) => {
    const fechaFact = new Date(c.fecha_factura_emitida)
    const dias = Math.floor((hoy.getTime() - fechaFact.getTime()) / 86400000)
    return {
      id: c.id,
      nombre: nombreCot(c),
      cliente: clienteCot(c),
      total: calcularTotalCot(c),
      fecha_factura: c.fecha_factura_emitida,
      numero_factura: c.numero_factura,
      dias_transcurridos: dias,
    }
  })

  const cobrado: FilaCotizacion[] = (cotCobrado ?? []).map((c: any) => ({
    id: c.id,
    nombre: nombreCot(c),
    cliente: clienteCot(c),
    total: calcularTotalCot(c),
    fecha_pago: c.fecha_pago_recibido,
  }))

  // ── Egresos ────────────────────────────────────────────────────────────────
  const gastosProyectosRows: FilaGasto[] = (gastosProyectos ?? []).map((g: any) => ({
    id: g.id,
    descripcion: g.descripcion,
    monto: g.monto,
    tipo_documento: g.tipo_documento,
    contexto: (g.rendicion as any)?.cotizacion?.nombre ?? '—',
    factura_casa_hiedra: g.factura_casa_hiedra ?? false,
  }))

  const gastosOpRows: FilaGasto[] = (gastosOp ?? []).map((g: any) => ({
    id: g.id,
    descripcion: g.descripcion,
    monto: g.monto,
    tipo_documento: g.tipo_documento,
    contexto: g.categoria ?? 'General',
    factura_casa_hiedra: g.factura_casa_hiedra ?? false,
  }))

  const cuotasRows: FilaCuota[] = (cuotas ?? []).map((c: any) => ({
    id: c.id,
    nombre_credito: (c.gasto_fijo as any)?.nombre ?? '—',
    numero_cuota: c.numero_cuota,
    monto: c.monto,
    fecha_vencimiento: c.fecha_vencimiento,
    pagada: c.pagada,
  }))

  // ── Tributario ─────────────────────────────────────────────────────────────
  const todosGastos = [...gastosProyectosRows, ...gastosOpRows]

  // Retenciones BH
  const retenciones_bh = todosGastos
    .filter(g => g.tipo_documento === 'boleta')
    .reduce((s, g) => s + calcularRetencion({ monto: g.monto, tipo_documento: g.tipo_documento }).retencion, 0)

  // IVA débito: 19% del neto cobrado en el período (facturas al cliente)
  const neto_cobrado = cobrado.reduce((s, c) => {
    // El total ya incluye IVA si aplica; extraemos el neto
    return s + c.total
  }, 0)
  // Aproximación: asumimos que las cotizaciones cobradas con IVA generan débito
  const iva_debito = (cotCobrado ?? []).reduce((s: number, c: any) => {
    if (!c.con_iva) return s
    const tot = calcularTotalCot(c)
    const neto = Math.round(tot / 1.19)
    return s + Math.round(neto * 0.19)
  }, 0)

  // IVA crédito: IVA recuperable de gastos con factura_casa_hiedra=true
  const iva_credito = todosGastos
    .filter(g => g.factura_casa_hiedra && g.tipo_documento === 'factura')
    .reduce((s, g) => s + Math.round(g.monto * 0.19 / 1.19), 0)

  const saldo_iva = iva_debito - iva_credito

  // PPM estimado sobre ingresos cobrados (neto)
  const neto_cobrado_sin_iva = (cotCobrado ?? []).reduce((s: number, c: any) => {
    const tot = calcularTotalCot(c)
    return s + (c.con_iva ? Math.round(tot / 1.19) : tot)
  }, 0)
  const ppm_estimado = Math.round(neto_cobrado_sin_iva * PPM_TASA)

  // ── Totales ────────────────────────────────────────────────────────────────
  const ingresos_cobrados = cobrado.reduce((s, c) => s + c.total, 0)
  const egresos_confirmados =
    gastosProyectosRows.reduce((s, g) => s + g.monto, 0) +
    gastosOpRows.reduce((s, g) => s + g.monto, 0) +
    cuotasRows.filter(c => c.pagada).reduce((s, c) => s + c.monto, 0)
  const utilidad_bruta = ingresos_cobrados - egresos_confirmados

  return {
    periodo: mes,
    ingresos: { por_facturar: porFacturar, por_cobrar: porCobrar, cobrado },
    egresos: {
      gastos_proyectos: gastosProyectosRows,
      gastos_operacionales: gastosOpRows,
      cuotas_creditos: cuotasRows,
    },
    tributario: { retenciones_bh, iva_debito, iva_credito, saldo_iva, ppm_estimado },
    totales: { ingresos_cobrados, egresos_confirmados, utilidad_bruta },
  }
}

export async function getResumenPeriodo(mes: string): Promise<ResumenPeriodo> {
  const d = await getDatosFinancieros(mes)
  return {
    cobrado: d.totales.ingresos_cobrados,
    egresos: d.totales.egresos_confirmados,
    utilidad: d.totales.utilidad_bruta,
  }
}

