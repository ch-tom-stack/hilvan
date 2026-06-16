// propuestas/02-rentabilidad-proyecto/logica.ts
//
// Lógica PURA de rentabilidad por proyecto.
// Sin acceso a DB, sin imports de Next.js — todo testeable en node.
//
// Modelo mental:
//   ingreso_cotizado  = total calculado de la cotización (con IVA si aplica)
//   costo_real        = suma de rendicion_gastos del proyecto (monto bruto)
//   costo_ajustado    = costo_real + costos_adicionales (crew/equipo/otros no en rendiciones)
//   margen            = ingreso − costo_ajustado
//   margen_pct        = margen / ingreso × 100
//
// HUECO CONOCIDO: hoy solo capturamos lo que pasa por rendiciones.
// crew pagado con cheque/efectivo, arriendo de equipo propio, días de
// producción sin documento, costo de post-producción interna — todos esos
// costos son INVISIBLES para este cálculo. Ver INCORPORACION.md.

import { formatCLP } from '@/lib/cotizaciones-calc'

// ─── Tipos de entrada ────────────────────────────────────────────────────────

/** Un gasto de proyecto tal como viene de rendicion_gastos. */
export interface GastoProyecto {
  id: string
  monto: number            // bruto (puede ser negativo = nota de crédito)
  tipo: string | null      // honorarios, transporte, etc.
  tipo_documento: string | null
  razon_social_emisor: string | null
  descripcion: string | null
  fecha_documento: string | null
  created_at: string
}

/**
 * Costo adicional no capturado por rendiciones — hueco de datos.
 * Se puede pasar para obtener un margen más fiel cuando esos datos existan.
 */
export interface CostoAdicional {
  concepto: string         // "Crew fuera de nómina", "Equipo propio", "Días extra", etc.
  monto: number            // bruto, positivo
  categoria: string        // para que aparezca en el desglose
  nota?: string            // contexto libre (ej. "estimado, no documentado")
}

/** Datos de facturación/cobro de la cotización. */
export interface InfoFacturacion {
  fecha_factura_emitida: string | null
  fecha_pago_recibido: string | null
  numero_factura: string | null
}

/** Payload completo que entra a calcularRentabilidad(). */
export interface InputRentabilidad {
  /** Identificador del grupo (CH-COT-005) o cotizacion_id para narrar. */
  numero: string | null
  cotizacion_id: string
  nombre_proyecto: string
  cliente: string
  estado_cotizacion: string
  /** Total calculado de la cotización (calcularTotalCot). */
  ingreso_cotizado: number
  /** Info de factura/pago. */
  facturacion: InfoFacturacion
  /** Gastos reales de rendicion_gastos del proyecto. */
  gastos: GastoProyecto[]
  /** Costos adicionales no en rendiciones (hueco de datos — puede ser []). */
  costos_adicionales: CostoAdicional[]
}

// ─── Tipos de salida ─────────────────────────────────────────────────────────

export type ClasificacionProyecto =
  | 'rentable'    // margen_pct ≥ UMBRAL_RENTABLE
  | 'ajustado'    // 0 ≤ margen_pct < UMBRAL_RENTABLE
  | 'perdida'     // margen < 0

export interface DesgloseCat {
  categoria: string
  monto: number        // suma bruta en esa categoría (puede ser negativo por NC)
  count: number        // número de gastos/líneas
}

export interface ResultadoRentabilidad {
  numero: string | null
  cotizacion_id: string
  nombre_proyecto: string
  cliente: string
  estado_cotizacion: string

  // ── Ingreso ─────────────────────────────────────────────────────────────
  ingreso_cotizado: number       // total cotización (con IVA si aplica)
  facturado: boolean             // tiene fecha_factura_emitida
  cobrado: boolean               // tiene fecha_pago_recibido
  fecha_factura: string | null
  fecha_cobro: string | null
  numero_factura: string | null

  // ── Costo real (solo rendiciones) ───────────────────────────────────────
  costo_rendiciones: number      // suma bruta de rendicion_gastos (NC ya restan)
  count_gastos: number           // cantidad de filas en rendicion_gastos
  desglose_rendiciones: DesgloseCat[]

  // ── Costos adicionales (hueco de datos — estiman lo no capturado) ────────
  costos_adicionales: CostoAdicional[]
  total_adicionales: number
  tiene_costos_estimados: boolean

  // ── Costo total = rendiciones + adicionales ──────────────────────────────
  costo_total: number

  // ── Margen ──────────────────────────────────────────────────────────────
  margen: number                 // ingreso_cotizado − costo_total
  margen_pct: number             // margen / ingreso_cotizado × 100 (NaN si ingreso=0)
  clasificacion: ClasificacionProyecto

  // ── Señales visuales ────────────────────────────────────────────────────
  en_perdida: boolean
  margen_fmt: string             // "$1.234.567" o "-$234.567"
  margen_pct_fmt: string        // "32%" o "-5%"

  // ── Hueco de datos ───────────────────────────────────────────────────────
  /**
   * true = hay costos que probablemente no están capturados (proyecto con gastos
   * = 0 pero con ingreso > 0, o señal del caller que indicó que el dato falta).
   */
  advertencia_datos_incompletos: boolean
  advertencia_detalle: string | null
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** % de margen mínimo para clasificar como "rentable". */
export const UMBRAL_RENTABLE = 20

/**
 * Normalizador de categoría — mismo criterio que etiquetaCategoria en
 * lib/agent-estado-financiero.ts, replicado aquí para no crear dependencia
 * cruzada en un módulo de propuesta.
 */
export function etiquetaCategoria(raw: string | null | undefined): string {
  const s = (raw || '').trim()
  if (!s) return 'Sin categoría'
  const MAPA: Record<string, string> = {
    honorarios: 'Honorarios',
    transporte: 'Transporte',
    alimentacion: 'Alimentación',
    articulos_oficina: 'Artículos de oficina',
    insumos: 'Insumos de rodaje',
    servicios: 'Servicios',
    otros: 'Otros',
    post_produccion: 'Post-producción',
    suscripciones: 'Suscripciones',
  }
  const key = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
  return MAPA[key] ?? s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Calcula rentabilidad completa dado el payload.
 * PURA: sin side-effects, sin acceso a DB.
 *
 * Extensibilidad: pasa `costos_adicionales` para enriquecer el cálculo con
 * costos que no pasan por rendiciones (crew/equipo/días fuera del sistema).
 */
export function calcularRentabilidad(input: InputRentabilidad): ResultadoRentabilidad {
  // ── Costo real de rendiciones ────────────────────────────────────────────
  const costo_rendiciones = input.gastos.reduce((s, g) => s + (g.monto ?? 0), 0)

  // Desglose por categoría/tipo
  const acum: Record<string, { monto: number; count: number }> = {}
  for (const g of input.gastos) {
    const cat = etiquetaCategoria(g.tipo)
    if (!acum[cat]) acum[cat] = { monto: 0, count: 0 }
    acum[cat].monto += g.monto ?? 0
    acum[cat].count += 1
  }
  const desglose_rendiciones: DesgloseCat[] = Object.entries(acum)
    .map(([categoria, v]) => ({ categoria, ...v }))
    .sort((a, b) => b.monto - a.monto) // mayor primero

  // ── Costos adicionales ────────────────────────────────────────────────────
  const total_adicionales = input.costos_adicionales.reduce((s, c) => s + (c.monto ?? 0), 0)
  const tiene_costos_estimados = input.costos_adicionales.length > 0

  // ── Totales ───────────────────────────────────────────────────────────────
  const costo_total = costo_rendiciones + total_adicionales
  const ingreso = input.ingreso_cotizado

  const margen = ingreso - costo_total
  const margen_pct = ingreso !== 0 ? (margen / ingreso) * 100 : NaN

  // ── Clasificación ─────────────────────────────────────────────────────────
  let clasificacion: ClasificacionProyecto
  if (margen < 0) {
    clasificacion = 'perdida'
  } else if (Number.isNaN(margen_pct) || margen_pct < UMBRAL_RENTABLE) {
    clasificacion = 'ajustado'
  } else {
    clasificacion = 'rentable'
  }

  // ── Advertencia de datos incompletos ─────────────────────────────────────
  // Heurística: si el proyecto tiene ingreso > 0 pero NO tiene gastos NI
  // costos adicionales, probablemente no se han cargado rendiciones.
  const advertencia_datos_incompletos =
    ingreso > 0 && input.gastos.length === 0 && input.costos_adicionales.length === 0
  const advertencia_detalle = advertencia_datos_incompletos
    ? 'No se encontraron gastos en rendiciones para este proyecto. El margen puede ser artificialmente alto.'
    : tiene_costos_estimados
    ? 'Incluye costos estimados no documentados en el sistema. El margen es aproximado.'
    : null

  // ── Formato CLP ───────────────────────────────────────────────────────────
  const margen_fmt = margen < 0
    ? `-${formatCLP(Math.abs(margen))}`
    : formatCLP(margen)
  const margen_pct_fmt = Number.isNaN(margen_pct)
    ? 'N/A'
    : `${margen_pct >= 0 ? '' : '-'}${Math.round(Math.abs(margen_pct))}%`

  return {
    numero: input.numero,
    cotizacion_id: input.cotizacion_id,
    nombre_proyecto: input.nombre_proyecto,
    cliente: input.cliente,
    estado_cotizacion: input.estado_cotizacion,

    ingreso_cotizado: Math.round(ingreso),
    facturado: !!input.facturacion.fecha_factura_emitida,
    cobrado: !!input.facturacion.fecha_pago_recibido,
    fecha_factura: input.facturacion.fecha_factura_emitida,
    fecha_cobro: input.facturacion.fecha_pago_recibido,
    numero_factura: input.facturacion.numero_factura,

    costo_rendiciones: Math.round(costo_rendiciones),
    count_gastos: input.gastos.length,
    desglose_rendiciones,

    costos_adicionales: input.costos_adicionales,
    total_adicionales: Math.round(total_adicionales),
    tiene_costos_estimados,

    costo_total: Math.round(costo_total),

    margen: Math.round(margen),
    margen_pct: Number.isNaN(margen_pct) ? NaN : Math.round(margen_pct * 10) / 10,
    clasificacion,

    en_perdida: margen < 0,
    margen_fmt,
    margen_pct_fmt,

    advertencia_datos_incompletos,
    advertencia_detalle,
  }
}

// ─── Resumen multi-proyecto ───────────────────────────────────────────────────

export interface ResumenProyecto {
  numero: string | null
  nombre_proyecto: string
  cliente: string
  estado_cotizacion: string
  ingreso_cotizado: number
  costo_total: number
  margen: number
  margen_pct: number
  clasificacion: ClasificacionProyecto
  en_perdida: boolean
  count_gastos: number
  advertencia_datos_incompletos: boolean
}

/**
 * Genera una lista resumen de múltiples proyectos, ordenada por margen
 * ascendente (las pérdidas primero, para visibilidad).
 */
export function calcularResumen(proyectos: ResultadoRentabilidad[]): {
  proyectos: ResumenProyecto[]
  totales: {
    ingreso_total: number
    costo_total: number
    margen_total: number
    margen_pct_promedio: number
    count_perdida: number
    count_ajustado: number
    count_rentable: number
  }
} {
  const resumen: ResumenProyecto[] = proyectos.map((p) => ({
    numero: p.numero,
    nombre_proyecto: p.nombre_proyecto,
    cliente: p.cliente,
    estado_cotizacion: p.estado_cotizacion,
    ingreso_cotizado: p.ingreso_cotizado,
    costo_total: p.costo_total,
    margen: p.margen,
    margen_pct: p.margen_pct,
    clasificacion: p.clasificacion,
    en_perdida: p.en_perdida,
    count_gastos: p.count_gastos,
    advertencia_datos_incompletos: p.advertencia_datos_incompletos,
  }))

  // Ordenar: pérdidas primero, luego ajustados, luego rentables
  const pesoClasif: Record<ClasificacionProyecto, number> = { perdida: 0, ajustado: 1, rentable: 2 }
  resumen.sort((a, b) => pesoClasif[a.clasificacion] - pesoClasif[b.clasificacion] || a.margen - b.margen)

  const ingreso_total = proyectos.reduce((s, p) => s + p.ingreso_cotizado, 0)
  const costo_total_global = proyectos.reduce((s, p) => s + p.costo_total, 0)
  const margen_total = ingreso_total - costo_total_global
  const margen_pct_promedio =
    ingreso_total !== 0 ? Math.round((margen_total / ingreso_total) * 1000) / 10 : NaN

  return {
    proyectos: resumen,
    totales: {
      ingreso_total: Math.round(ingreso_total),
      costo_total: Math.round(costo_total_global),
      margen_total: Math.round(margen_total),
      margen_pct_promedio,
      count_perdida: proyectos.filter((p) => p.clasificacion === 'perdida').length,
      count_ajustado: proyectos.filter((p) => p.clasificacion === 'ajustado').length,
      count_rentable: proyectos.filter((p) => p.clasificacion === 'rentable').length,
    },
  }
}
