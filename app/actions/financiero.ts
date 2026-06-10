'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRol } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularRetencion } from '@/types'
import { mesAnterior, mismoMesAñoAnterior } from '@/lib/periodos'


// const PPM_TASA = 0.016 // fallback — reemplazado por configuracion_financiero

// ── Lecturas internas de configuracion_financiero (sin check de rol) ──────────
// Estas funciones se usan desde getDatosFinancieros (que ya validó el rol).
// Las versiones exportadas públicas añaden requireRol encima.

async function _getPPMTasa(): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('configuracion_financiero')
    .select('valor')
    .eq('clave', 'ppm_tasa')
    .single()
  return data ? parseFloat(data.valor) : 0.05
}

async function _getPreviredMensual(): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('configuracion_financiero')
    .select('valor')
    .eq('clave', 'previred_mensual')
    .single()
  return data ? parseInt(data.valor, 10) : 0
}

async function _getIUSCMensual(): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('configuracion_financiero')
    .select('valor')
    .eq('clave', 'iusc_mensual')
    .single()
  return data ? parseInt(data.valor, 10) : 0
}

async function _getNomina(): Promise<PersonaNomina[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('configuracion_financiero')
    .select('valor')
    .eq('clave', 'nomina_personas')
    .single()
  if (!data?.valor) return NOMINA_DEFAULT
  try { return JSON.parse(data.valor) } catch { return NOMINA_DEFAULT }
}

// ── Versiones públicas (exportadas) con validación de rol ─────────────────────

export async function getPPMTasa(): Promise<number> {
  await requireRol(['admin', 'contabilidad'])
  return _getPPMTasa()
}

export async function setPPMTasa(tasa: number): Promise<{ error?: string }> {
  await requireRol(['admin'])
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('configuracion_financiero')
    .upsert({ clave: 'ppm_tasa', valor: String(tasa), updated_at: new Date().toISOString() })
  return error ? { error: error.message } : {}
}

export async function getPreviredMensual(): Promise<number> {
  await requireRol(['admin', 'contabilidad'])
  return _getPreviredMensual()
}

export async function setPreviredMensual(monto: number): Promise<{ error?: string }> {
  await requireRol(['admin'])
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('configuracion_financiero')
    .upsert({ clave: 'previred_mensual', valor: String(Math.round(monto)), updated_at: new Date().toISOString() })
  return error ? { error: error.message } : {}
}

export async function getIUSCMensual(): Promise<number> {
  await requireRol(['admin', 'contabilidad'])
  return _getIUSCMensual()
}

export async function setIUSCMensual(monto: number): Promise<{ error?: string }> {
  await requireRol(['admin'])
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('configuracion_financiero')
    .upsert({ clave: 'iusc_mensual', valor: String(Math.round(monto)), updated_at: new Date().toISOString() })
  return error ? { error: error.message } : {}
}

export interface PersonaNomina {
  nombre: string
  monto: number
  tipo: 'contrato' | 'honorarios'
}

const NOMINA_DEFAULT: PersonaNomina[] = [
  { nombre: 'Tomás M.', monto: 550000, tipo: 'contrato' },
  { nombre: 'Natalia', monto: 550000, tipo: 'contrato' },
  { nombre: 'Simón Fernández', monto: 250000, tipo: 'honorarios' },
  { nombre: 'Josué de la Fuente', monto: 250000, tipo: 'honorarios' },
]

export async function getNomina(): Promise<PersonaNomina[]> {
  await requireRol(['admin', 'contabilidad'])
  return _getNomina()
}

export async function setNomina(personas: PersonaNomina[]): Promise<{ error?: string }> {
  await requireRol(['admin'])
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('configuracion_financiero')
    .upsert({ clave: 'nomina_personas', valor: JSON.stringify(personas), updated_at: new Date().toISOString() })
  return error ? { error: error.message } : {}
}

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
      items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo, subgrupo_id)
    ),
    items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo, subgrupo_id)
  )
`

function calcularTotalCot(cot: any): number {
  const deps: any[] = cot.departamentos ?? []
  let neto = 0
  for (const dep of deps) {
    // Solo items directos del departamento (los de subgrupos tienen subgrupo_id != null)
    for (const item of (dep.items ?? []).filter((i: any) => i.subgrupo_id === null)) {
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

export interface FilaInversion {
  id: string
  descripcion: string
  monto: number
  monto_neto: number
  iva_credito: number
  categoria: string
  tipo_documento: string | null
  factura_casa_hiedra: boolean
  tratamiento_contable: string
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
  inversiones: FilaInversion[]
  nomina: PersonaNomina[]
  tributario: {
    retenciones_bh: number
    iva_debito: number
    iva_credito: number
    iva_credito_inversiones: number
    saldo_iva: number
    ppm_estimado: number
    previred_mensual: number
    iusc_mensual: number
  }
  totales: {
    ingresos_facturados: number
    egresos_confirmados: number
    total_inversiones: number
    utilidad_bruta: number
  }
}

export interface ResumenPeriodo {
  facturado: number
  egresos: number
  utilidad: number
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER ACTION PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export async function getDatosFinancieros(mes: string, ppmTasa?: number, previredEmpleador?: number, iuscMensual?: number, nominaPersonas?: PersonaNomina[]): Promise<DatosFinancieros> {
  await requireRol(['admin', 'contabilidad'])
  const supabase = await createClient()
  const [PPM_TASA, PREVIRED, IUSC, NOMINA] = await Promise.all([
    ppmTasa !== undefined ? Promise.resolve(ppmTasa) : _getPPMTasa(),
    previredEmpleador !== undefined ? Promise.resolve(previredEmpleador) : _getPreviredMensual(),
    iuscMensual !== undefined ? Promise.resolve(iuscMensual) : _getIUSCMensual(),
    nominaPersonas !== undefined ? Promise.resolve(nominaPersonas) : _getNomina(),
  ])
  const inicio = inicioPeriodo(mes)
  const fin = finPeriodo(mes)
  const finTs = `${fin}T23:59:59`

  const [
    { data: cotPorFacturar },
    { data: cotPorCobrar },
    { data: cotCobrado },
    { data: cotFacturadoPeriodo },
    { data: gastosProyectos },
    { data: gastosOp },
    { data: cuotas },
    { data: inversionesPeriodo },
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

    // Cotizaciones cobradas en el período (para mostrar en columna ingresos)
    supabase.from('cotizaciones')
      .select(COT_FINANCIERO_SELECT)
      .gte('fecha_pago_recibido', inicio)
      .lte('fecha_pago_recibido', fin),

    // Cotizaciones facturadas en el período (devengado — base del resultado)
    supabase.from('cotizaciones')
      .select(COT_FINANCIERO_SELECT)
      .gte('fecha_factura_emitida', inicio)
      .lte('fecha_factura_emitida', fin),

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

    // Inversiones del período
    supabase.from('inversiones')
      .select('id, descripcion, monto, categoria, tipo_documento, factura_casa_hiedra, tratamiento_contable')
      .gte('fecha_compra', inicio)
      .lte('fecha_compra', fin)
      .order('fecha_compra'),
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

  // ── Inversiones del período ────────────────────────────────────────────────
  const inversionesRows: FilaInversion[] = (inversionesPeriodo ?? []).map((inv: any) => {
    const tieneIVA = inv.factura_casa_hiedra && inv.tipo_documento === 'factura'
    const monto_neto = tieneIVA ? Math.round(inv.monto / 1.19) : inv.monto
    const iva_credito = tieneIVA ? inv.monto - monto_neto : 0
    return {
      id: inv.id,
      descripcion: inv.descripcion,
      monto: inv.monto,
      monto_neto,
      iva_credito,
      categoria: inv.categoria,
      tipo_documento: inv.tipo_documento ?? null,
      factura_casa_hiedra: inv.factura_casa_hiedra ?? false,
      tratamiento_contable: inv.tratamiento_contable,
    }
  })

  // ── Tributario ─────────────────────────────────────────────────────────────
  const todosGastos = [...gastosProyectosRows, ...gastosOpRows]

  // Retenciones BH
  const retenciones_bh = todosGastos
    .filter(g => g.tipo_documento === 'boleta')
    .reduce((s, g) => s + calcularRetencion({ monto: g.monto, tipo_documento: g.tipo_documento }).retencion, 0)

  // IVA débito: 19% de facturas emitidas en el período (devengado)
  const iva_debito = (cotFacturadoPeriodo ?? []).reduce((s: number, c: any) => {
    if (!c.con_iva) return s
    const tot = calcularTotalCot(c)
    const neto = Math.round(tot / 1.19)
    return s + Math.round(neto * 0.19)
  }, 0)

  // IVA crédito de gastos operacionales y proyectos
  const iva_credito_gastos = todosGastos
    .filter(g => g.factura_casa_hiedra && g.tipo_documento === 'factura')
    .reduce((s, g) => s + Math.round(g.monto * 0.19 / 1.19), 0)

  // IVA crédito de inversiones (se declara pero es salida de capital, no egreso operacional)
  const iva_credito_inversiones = inversionesRows.reduce((s, i) => s + i.iva_credito, 0)

  const iva_credito = iva_credito_gastos + iva_credito_inversiones
  const saldo_iva = iva_debito - iva_credito

  // PPM estimado sobre ingresos facturados (neto sin IVA)
  const neto_facturado_sin_iva = (cotFacturadoPeriodo ?? []).reduce((s: number, c: any) => {
    const tot = calcularTotalCot(c)
    return s + (c.con_iva ? Math.round(tot / 1.19) : tot)
  }, 0)
  const ppm_estimado = Math.round(neto_facturado_sin_iva * PPM_TASA)

  // ── Totales ────────────────────────────────────────────────────────────────
  const ingresos_facturados = (cotFacturadoPeriodo ?? []).reduce((s: number, c: any) => s + calcularTotalCot(c), 0)
  const totalNomina = NOMINA.reduce((s, p) => s + p.monto, 0)
  const egresos_confirmados =
    gastosProyectosRows.reduce((s, g) => s + g.monto, 0) +
    gastosOpRows.reduce((s, g) => s + g.monto, 0) +
    cuotasRows.reduce((s, c) => s + c.monto, 0) +
    totalNomina
  const total_inversiones = inversionesRows.reduce((s, i) => s + i.monto, 0)
  const utilidad_bruta = ingresos_facturados - egresos_confirmados

  return {
    periodo: mes,
    ingresos: { por_facturar: porFacturar, por_cobrar: porCobrar, cobrado },
    egresos: {
      gastos_proyectos: gastosProyectosRows,
      gastos_operacionales: gastosOpRows,
      cuotas_creditos: cuotasRows,
    },
    inversiones: inversionesRows,
    nomina: NOMINA,
    tributario: { retenciones_bh, iva_debito, iva_credito, iva_credito_inversiones, saldo_iva, ppm_estimado, previred_mensual: PREVIRED, iusc_mensual: IUSC },
    totales: { ingresos_facturados, egresos_confirmados, total_inversiones, utilidad_bruta },
  }
}

export async function getResumenPeriodo(mes: string): Promise<ResumenPeriodo> {
  await requireRol(['admin', 'contabilidad'])
  const d = await getDatosFinancieros(mes)
  return {
    facturado: d.totales.ingresos_facturados,
    egresos: d.totales.egresos_confirmados,
    utilidad: d.totales.utilidad_bruta,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CUENTAS POR COBRAR
// ─────────────────────────────────────────────────────────────────────────────

const COT_COBRAR_SELECT = `
  id, nombre, estado, con_iva, descuento_global, descuento_global_tipo,
  fecha_factura_emitida, fecha_pago_recibido, numero_factura,
  cliente_nombre_libre, fecha_respuesta_cliente,
  grupo:cotizacion_grupos(numero_base),
  cliente:clientes(nombre),
  departamentos:cotizacion_departamentos(
    subgrupos:cotizacion_subgrupos(
      items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo, subgrupo_id)
    ),
    items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo, subgrupo_id)
  )
`

export interface FilaCobrar {
  id: string
  nombre: string
  cliente: string
  total: number
  // por facturar
  fecha_aprobacion?: string | null
  dias_desde_aprobacion?: number
  // por cobrar
  fecha_factura?: string | null
  numero_factura?: string | null
  dias_desde_factura?: number
}

export interface DatosCobrar {
  por_facturar: FilaCobrar[]
  por_cobrar: FilaCobrar[]
  total_por_facturar: number
  total_por_cobrar: number
}

export async function getCuentasPorCobrar(): Promise<DatosCobrar> {
  await requireRol(['admin', 'contabilidad'])
  const supabase = await createClient()
  const hoy = new Date()

  const [
    { data: cotPorFacturar },
    { data: cotPorCobrar },
  ] = await Promise.all([
    supabase.from('cotizaciones')
      .select(COT_COBRAR_SELECT)
      .in('estado', ['aprobada', 'en_produccion'])
      .is('fecha_factura_emitida', null)
      .order('fecha_respuesta_cliente', { ascending: true }),

    supabase.from('cotizaciones')
      .select(COT_COBRAR_SELECT)
      .not('fecha_factura_emitida', 'is', null)
      .is('fecha_pago_recibido', null)
      .order('fecha_factura_emitida', { ascending: true }),
  ])

  const porFacturar: FilaCobrar[] = (cotPorFacturar ?? []).map((c: any) => {
    const fechaRef = c.fecha_respuesta_cliente
    const diasDesdeAprobacion = fechaRef
      ? Math.floor((hoy.getTime() - new Date(fechaRef).getTime()) / 86400000)
      : undefined
    return {
      id: c.id,
      nombre: nombreCot(c),
      cliente: clienteCot(c),
      total: calcularTotalCot(c),
      fecha_aprobacion: fechaRef ?? null,
      dias_desde_aprobacion: diasDesdeAprobacion,
    }
  })

  const porCobrar: FilaCobrar[] = (cotPorCobrar ?? []).map((c: any) => {
    const diasDesdeFactura = Math.floor(
      (hoy.getTime() - new Date(c.fecha_factura_emitida).getTime()) / 86400000
    )
    return {
      id: c.id,
      nombre: nombreCot(c),
      cliente: clienteCot(c),
      total: calcularTotalCot(c),
      fecha_factura: c.fecha_factura_emitida,
      numero_factura: c.numero_factura ?? null,
      dias_desde_factura: diasDesdeFactura,
    }
  })

  return {
    por_facturar: porFacturar,
    por_cobrar: porCobrar,
    total_por_facturar: porFacturar.reduce((s, c) => s + c.total, 0),
    total_por_cobrar: porCobrar.reduce((s, c) => s + c.total, 0),
  }
}

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

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
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
    const fechaEst = toDateStr(addDays(new Date((cot as any).fecha_factura_emitida + 'T12:00:00'), 30))
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

// ─────────────────────────────────────────────────────────────────────────────
// CRÉDITOS Y CUOTAS
// ─────────────────────────────────────────────────────────────────────────────

import type { GastoFijo, GastoFijoCuota, TipoGastoFijo } from '@/types'

export async function getGastosFijos(): Promise<GastoFijo[]> {
  await requireRol(['admin', 'contabilidad'])
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gastos_fijos')
    .select('*, cuotas:gastos_fijos_cuotas(*)')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((g: any) => ({
    ...g,
    cuotas: (g.cuotas ?? []).sort((a: any, b: any) => a.numero_cuota - b.numero_cuota),
  })) as GastoFijo[]
}

function generarFechaVencimiento(fechaInicio: string, n: number, dia: number): string {
  const [year, month] = fechaInicio.split('-').map(Number)
  const d = new Date(year, month - 1 + (n - 1), 1)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const day = Math.min(dia, lastDay)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export async function crearGastoFijo(data: {
  nombre: string
  tipo: TipoGastoFijo
  acreedor: string
  descripcion: string
  monto_total: number
  monto_cuota: number
  n_cuotas: number
  dia_vencimiento: number
  fecha_inicio: string
  tasa_interes: number | null
}): Promise<GastoFijo> {
  await requireRol(['admin'])
  const supabase = await createClient()

  const { data: gasto, error } = await supabase
    .from('gastos_fijos')
    .insert({
      nombre: data.nombre,
      tipo: data.tipo,
      acreedor: data.acreedor || null,
      descripcion: data.descripcion || null,
      monto_total: data.monto_total,
      monto_cuota: data.monto_cuota,
      n_cuotas: data.n_cuotas,
      dia_vencimiento: data.dia_vencimiento,
      fecha_inicio: data.fecha_inicio,
      tasa_interes: data.tasa_interes,
      activo: true,
    })
    .select('*')
    .single()
  if (error) throw error

  const cuotas = Array.from({ length: data.n_cuotas }, (_, i) => ({
    gasto_fijo_id: (gasto as any).id,
    numero_cuota: i + 1,
    fecha_vencimiento: generarFechaVencimiento(data.fecha_inicio, i + 1, data.dia_vencimiento),
    monto: data.monto_cuota,
    pagada: false,
    fecha_pago: null,
  }))

  const { data: cuotasCreadas, error: errCuotas } = await supabase
    .from('gastos_fijos_cuotas')
    .insert(cuotas)
    .select('*')
  if (errCuotas) throw errCuotas

  return {
    ...(gasto as any),
    cuotas: (cuotasCreadas ?? []).sort((a: any, b: any) => a.numero_cuota - b.numero_cuota),
  } as GastoFijo
}

export async function eliminarGastoFijo(id: string): Promise<void> {
  await requireRol(['admin'])
  const supabase = await createClient()
  // cuotas se eliminan por CASCADE en la DB; si no, borrar primero
  await supabase.from('gastos_fijos_cuotas').delete().eq('gasto_fijo_id', id)
  const { error } = await supabase.from('gastos_fijos').delete().eq('id', id)
  if (error) throw error
}

export async function toggleGastoFijoActivo(id: string, activo: boolean): Promise<void> {
  await requireRol(['admin'])
  const supabase = await createClient()
  const { error } = await supabase.from('gastos_fijos').update({ activo }).eq('id', id)
  if (error) throw error
}

export async function marcarCuotaPagada(id: string, fecha_pago: string): Promise<GastoFijoCuota> {
  await requireRol(['admin'])
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gastos_fijos_cuotas')
    .update({ pagada: true, fecha_pago })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as GastoFijoCuota
}

export async function desmarcarCuotaPagada(id: string): Promise<GastoFijoCuota> {
  await requireRol(['admin'])
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gastos_fijos_cuotas')
    .update({ pagada: false, fecha_pago: null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as GastoFijoCuota
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN PARA EL CONTADOR
// ─────────────────────────────────────────────────────────────────────────────

export type GastoContador = {
  fecha: string
  tipo: string
  descripcion: string
  proyecto?: string
  tipo_documento: string | null
  rut_emisor: string | null
  razon_social_emisor: string | null
  factura_casa_hiedra: boolean
  monto: number
  monto_neto: number
  iva: number
  credito_fiscal: number
  retencion: number
  comprobante_url: string | null
}

export type InversionContador = {
  fecha: string
  categoria: string
  descripcion: string
  tipo_documento: string | null
  rut_emisor: string | null
  razon_social_emisor: string | null
  factura_casa_hiedra: boolean
  monto: number
  monto_neto: number
  iva: number
  credito_fiscal: number
  tratamiento_contable: string
  comprobante_url: string | null
}

export type ResumenContador = {
  gastosProyectos: GastoContador[]
  gastosOperacionales: GastoContador[]
  inversiones: InversionContador[]
}

function calcularCamposContador(monto: number, tipo_documento: string | null, factura_casa_hiedra: boolean) {
  const credito_fiscal = factura_casa_hiedra ? Math.round(monto / 1.19 * 0.19) : 0
  const monto_neto = factura_casa_hiedra ? Math.round(monto / 1.19) : monto
  const iva = factura_casa_hiedra ? monto - monto_neto : 0
  const { retencion } = calcularRetencion({ monto, tipo_documento })
  return { credito_fiscal, monto_neto, iva, retencion }
}

export async function getResumenContador(mes: number, año: number): Promise<ResumenContador> {
  await requireRol(['admin', 'contabilidad'])
  const supabase = await createClient()

  const mesStr = String(mes).padStart(2, '0')
  const inicio = `${año}-${mesStr}-01`
  // Último día del mes
  const lastDay = new Date(año, mes, 0).getDate()
  const fin = `${año}-${mesStr}-${String(lastDay).padStart(2, '0')}`
  const finTs = `${fin}T23:59:59`

  const [
    { data: gastosProyRaw },
    { data: gastosOpRaw },
    { data: inversionesRaw },
  ] = await Promise.all([
    // Gastos de proyectos aprobados con updated_at en el período
    supabase
      .from('rendicion_gastos')
      .select(`
        id, descripcion, monto, tipo_documento, factura_casa_hiedra,
        foto_url, rut_emisor, razon_social_emisor, updated_at,
        rendicion:rendiciones(cotizacion:cotizaciones(nombre))
      `)
      .in('estado', ['aprobada', 'pago_aprobado'])
      .gte('updated_at', inicio)
      .lte('updated_at', finTs)
      .order('updated_at'),

    // Gastos operacionales del período
    supabase
      .from('rendicion_mensual_gastos')
      .select(`
        id, descripcion, monto, tipo_documento, factura_casa_hiedra,
        archivo_url, rut_emisor, razon_social_emisor, created_at,
        rendicion_mensual:rendiciones_mensuales!inner(periodo)
      `)
      .eq('rendicion_mensual.periodo', inicio)
      .order('created_at'),

    // Inversiones del período
    supabase
      .from('inversiones')
      .select('*')
      .gte('fecha_compra', inicio)
      .lte('fecha_compra', fin)
      .order('fecha_compra'),
  ])

  const gastosProyectos: GastoContador[] = (gastosProyRaw ?? []).map((g: any) => {
    const calc = calcularCamposContador(g.monto, g.tipo_documento, g.factura_casa_hiedra ?? false)
    return {
      fecha: g.updated_at?.slice(0, 10) ?? inicio,
      tipo: 'Gasto proyecto',
      descripcion: g.descripcion,
      proyecto: (g.rendicion as any)?.cotizacion?.nombre ?? undefined,
      tipo_documento: g.tipo_documento ?? null,
      rut_emisor: g.rut_emisor ?? null,
      razon_social_emisor: g.razon_social_emisor ?? null,
      factura_casa_hiedra: g.factura_casa_hiedra ?? false,
      monto: g.monto,
      comprobante_url: g.foto_url ?? null,
      ...calc,
    }
  })

  const gastosOperacionales: GastoContador[] = (gastosOpRaw ?? []).map((g: any) => {
    const calc = calcularCamposContador(g.monto, g.tipo_documento, g.factura_casa_hiedra ?? false)
    return {
      fecha: g.created_at?.slice(0, 10) ?? inicio,
      tipo: 'Gasto operacional',
      descripcion: g.descripcion,
      tipo_documento: g.tipo_documento ?? null,
      rut_emisor: g.rut_emisor ?? null,
      razon_social_emisor: g.razon_social_emisor ?? null,
      factura_casa_hiedra: g.factura_casa_hiedra ?? false,
      monto: g.monto,
      comprobante_url: g.archivo_url ?? null,
      ...calc,
    }
  })

  const inversiones: InversionContador[] = (inversionesRaw ?? []).map((inv: any) => {
    const calc = calcularCamposContador(inv.monto, inv.tipo_documento, inv.factura_casa_hiedra ?? false)
    return {
      fecha: inv.fecha_compra,
      categoria: inv.categoria,
      descripcion: inv.descripcion,
      tipo_documento: inv.tipo_documento ?? null,
      rut_emisor: inv.rut_proveedor ?? null,
      razon_social_emisor: inv.proveedor ?? null,
      factura_casa_hiedra: inv.factura_casa_hiedra ?? false,
      monto: inv.monto,
      tratamiento_contable: inv.tratamiento_contable,
      comprobante_url: inv.comprobante_url ?? null,
      ...calc,
    }
  })

  return { gastosProyectos, gastosOperacionales, inversiones }
}

