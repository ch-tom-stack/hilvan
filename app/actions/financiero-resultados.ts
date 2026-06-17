'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRol } from '@/lib/auth'
import { calcularRetencion } from '@/types'
import {
  inicioPeriodo, finPeriodo,
  COT_FINANCIERO_SELECT, COT_COBRAR_SELECT,
  calcularTotalCot, nombreCot, clienteCot,
  calcularCamposContador,
  type PersonaNomina,
} from './financiero-helpers'
import { _getPPMTasa, _getPreviredMensual, _getIUSCMensual, _getNomina, _getHonorariosContador } from './financiero-config'
import { ensamblarResumenContador, type ResumenContadorTotal } from '@/lib/agent-resumen-contador'

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
// CUENTAS POR PAGAR  (espejo de cobrar, lado egresos)
// MISMA definición que Centro de costos · Admin · Revisión (la fuente de verdad,
// app/(dashboard)/costos/admin/page.tsx): "por pagar" =
//   - gasto INTERNO con estado='enviada'  (van directo a pago)
//   - gasto EXTERNO con estado='aprobada' (aprobados de contenido, esperando pago)
// El total se valoriza en NETO (lo que efectivamente se transfiere), igual que la
// tarjeta "Total neto a pagar". NO usa el flag `pagado` (conciliación bancaria,
// otro concepto) ni los gastos mensuales (no tienen flujo de aprobación).
// El detalle vive en Centro de costos; esta vista lo resume en Financiero.
// ─────────────────────────────────────────────────────────────────────────────

export interface FilaPagar {
  id: string
  proveedor: string
  contexto: string // proyecto (cotización)
  tipo_documento: string | null
  neto: number // lo que se paga (= "neto a pagar")
  bruto: number // referencia; en boletas bruto > neto por la retención
  fecha_documento: string | null
  dias_desde_documento?: number
}

export interface DatosPagar {
  filas: FilaPagar[]
  total: number // Σ neto
}

export async function getCuentasPorPagar(): Promise<DatosPagar> {
  await requireRol(['admin', 'contabilidad'])
  const supabase = await createClient()
  const hoy = new Date()

  const { data: gastos } = await supabase.from('rendicion_gastos')
    .select('id, descripcion, razon_social_emisor, monto, tipo_documento, origen, estado, fecha_documento, created_at, rendicion:rendiciones(cotizacion:cotizaciones(nombre))')
    .or('and(origen.eq.interno,estado.eq.enviada),and(origen.eq.externo,estado.eq.aprobada)')

  const fila = (g: any): FilaPagar => {
    const fechaRef: string | null = g.fecha_documento ?? g.created_at ?? null
    const dias = fechaRef
      ? Math.floor((hoy.getTime() - new Date(fechaRef.slice(0, 10) + 'T12:00:00').getTime()) / 86400000)
      : undefined
    // Mismo cálculo que la tarjeta de Revisión: calcularRetencion(g).neto.
    const { neto } = calcularRetencion({ monto: g.monto ?? 0, tipo_documento: g.tipo_documento })
    return {
      id: g.id,
      proveedor: g.razon_social_emisor || g.descripcion || '—',
      contexto: (g.rendicion as any)?.cotizacion?.nombre ?? 'Proyecto',
      tipo_documento: g.tipo_documento ?? null,
      neto,
      bruto: g.monto ?? 0,
      fecha_documento: g.fecha_documento ?? null,
      dias_desde_documento: dias,
    }
  }

  const filas: FilaPagar[] = (gastos ?? [])
    .map((g: any) => fila(g))
    .sort((a: FilaPagar, b: FilaPagar) => (b.dias_desde_documento ?? 0) - (a.dias_desde_documento ?? 0))

  return { filas, total: filas.reduce((s, f) => s + f.neto, 0) }
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

// ─────────────────────────────────────────────────────────────────────────────
// RESUMEN PARA EL CONTADOR (estimación de la transferencia mensual)
// Reusa el bloque `tributario` del estado de resultados (fuente de verdad) + los
// honorarios del contador, y arma el desglose con el mismo helper que el agente.
// ES UNA ESTIMACIÓN — el F29 oficial lo determina el contador.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumenContadorEstimado extends ResumenContadorTotal {
  periodo: string
  detalle: { iva_debito: number; iva_credito: number; saldo_iva: number }
}

export async function getResumenContadorEstimado(mes: string): Promise<ResumenContadorEstimado> {
  await requireRol(['admin', 'contabilidad'])
  const datos = await getDatosFinancieros(mes)
  const honorarios_contador = await _getHonorariosContador()
  const t = datos.tributario

  const resumen = ensamblarResumenContador({
    saldo_iva: t.saldo_iva,
    retencion_honorarios: t.retenciones_bh,
    ppm: t.ppm_estimado,
    previred: t.previred_mensual,
    iusc: t.iusc_mensual,
    honorarios_contador,
  })

  return {
    periodo: mes,
    ...resumen,
    detalle: { iva_debito: t.iva_debito, iva_credito: t.iva_credito, saldo_iva: t.saldo_iva },
  }
}
