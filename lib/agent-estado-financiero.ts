// lib/agent-estado-financiero.ts — helpers puros para el resumen financiero
// conversacional del agente (/api/agent/estado-financiero). Sin acceso a DB:
// solo lógica de período y agregación, para poder testearlos en aislamiento.

import { formatCLP } from '@/lib/cotizaciones-calc'

/**
 * Valida y normaliza un período YYYY-MM. Si no calza con el formato, devuelve
 * null. (El default = mes actual se resuelve en el route, no aquí.)
 */
export function normalizarPeriodo(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  return /^\d{4}-\d{2}$/.test(s) ? s : null
}

/** Período YYYY-MM del mes actual (hora local). */
export function periodoActual(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Rango [inicio, finExclusivo) en YYYY-MM-DD para un período YYYY-MM.
 * finExclusivo = primer día del mes siguiente (sin líos de fin de mes).
 */
export function rangoPeriodo(periodo: string): { inicio: string; finExcl: string } {
  const [y, m] = periodo.split('-').map(Number)
  const inicio = `${periodo}-01`
  const finExcl =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { inicio, finExcl }
}

/**
 * ¿La fecha cae dentro del período YYYY-MM?
 * Acepta fechas planas (YYYY-MM-DD) o timestamps ISO completos: compara solo la
 * parte de fecha (primeros 10 chars), evitando corrimientos por zona horaria.
 */
export function fechaDentroDePeriodo(
  fecha: string | null | undefined,
  periodo: string,
): boolean {
  if (!fecha) return false
  const dia = fecha.slice(0, 10)
  const { inicio, finExcl } = rangoPeriodo(periodo)
  return dia >= inicio && dia < finExcl
}

/**
 * La fecha relevante de un gasto para cuadre tributario: `fecha_documento`
 * cuando existe, con fallback a `created_at` (mismo criterio que /api/agent/gastos).
 */
export function fechaTributariaGasto(g: {
  fecha_documento?: string | null
  created_at?: string | null
}): string | null {
  return g.fecha_documento ?? g.created_at ?? null
}

// Mapa canónico: unifica el vocabulario de proyecto (`tipo`, minúscula/enum) con el
// de mensual (`categoria`, etiqueta) para que no aparezcan duplicadas ("honorarios"
// vs "Honorarios"). La clave se normaliza (minúscula, sin acentos, espacios→_).
const MAPA_CATEGORIA: Record<string, string> = {
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

export function etiquetaCategoria(raw: string | null | undefined): string {
  const s = (raw || '').trim()
  if (!s) return 'Sin categoría'
  const key = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
  return MAPA_CATEGORIA[key] ?? s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Suma montos agrupando por una clave (categoría / tipo). Las claves vacías o
 * nulas se agrupan bajo `sinClave`. Montos negativos (notas de crédito) restan,
 * por lo que una categoría puede quedar en negativo o en cero.
 */
export function agregarPorCategoria<T>(
  items: T[],
  clave: (t: T) => string | null | undefined,
  monto: (t: T) => number,
  sinClave = 'Sin categoría',
): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const it of items) {
    const k = (clave(it) || '').trim() || sinClave
    acc[k] = (acc[k] ?? 0) + (monto(it) || 0)
  }
  return acc
}

// Umbrales de aging para alertas de cobranza (días desde la factura emitida).
export const AGING_ALTA = 60
export const AGING_MEDIA = 30

export type NivelAlerta = 'alta' | 'media'
export interface Alerta {
  nivel: NivelAlerta
  tipo: string
  mensaje: string
  monto?: number
}

/**
 * Construye el feedback proactivo del mes: señales accionables que el agente
 * narra sin que se las pregunten. Función PURA (recibe ya calculado lo que
 * necesita) para testearla en aislamiento. Orden: las 'alta' primero.
 *
 * Señales:
 *  - cobro_vencido: cotizaciones por cobrar con aging ≥ 60 (alta) / 30–59 (media).
 *  - cuota_vencida / cuota_proxima: cuotas de crédito impagas vencidas (alta) o
 *    por vencer en el período (media).
 *  - mes_en_rojo: resultado devengado negativo (alta).
 *  - caja_negativa: caja aproximada negativa (alta).
 */
export function construirAlertas(input: {
  porCobrar: { numero: string | null; cliente: string; monto: number; dias_aging: number }[]
  cuotas: { credito: string | null; monto: number; fecha_vencimiento: string; pagada: boolean }[]
  hoy: string // YYYY-MM-DD
  resultadoDevengado: number
  cajaAprox: number
}): Alerta[] {
  const alertas: Alerta[] = []

  // ── Cobros vencidos ─────────────────────────────────────────────────────────
  const venc60 = input.porCobrar.filter((c) => c.dias_aging >= AGING_ALTA)
  const venc30 = input.porCobrar.filter(
    (c) => c.dias_aging >= AGING_MEDIA && c.dias_aging < AGING_ALTA,
  )
  if (venc60.length > 0) {
    const total = venc60.reduce((s, c) => s + c.monto, 0)
    alertas.push({
      nivel: 'alta',
      tipo: 'cobro_vencido',
      monto: total,
      mensaje: `${venc60.length} cotización(es) con más de ${AGING_ALTA} días sin cobrar (${formatCLP(total)})`,
    })
  }
  if (venc30.length > 0) {
    const total = venc30.reduce((s, c) => s + c.monto, 0)
    alertas.push({
      nivel: 'media',
      tipo: 'cobro_vencido',
      monto: total,
      mensaje: `${venc30.length} cotización(es) con ${AGING_MEDIA}–${AGING_ALTA - 1} días sin cobrar (${formatCLP(total)})`,
    })
  }

  // ── Cuotas de crédito impagas ───────────────────────────────────────────────
  const impagas = input.cuotas.filter((c) => !c.pagada)
  const vencidas = impagas.filter((c) => c.fecha_vencimiento < input.hoy)
  const proximas = impagas.filter((c) => c.fecha_vencimiento >= input.hoy)
  if (vencidas.length > 0) {
    const total = vencidas.reduce((s, c) => s + c.monto, 0)
    alertas.push({
      nivel: 'alta',
      tipo: 'cuota_vencida',
      monto: total,
      mensaje: `${vencidas.length} cuota(s) de crédito vencida(s) sin pagar (${formatCLP(total)})`,
    })
  }
  if (proximas.length > 0) {
    const total = proximas.reduce((s, c) => s + c.monto, 0)
    alertas.push({
      nivel: 'media',
      tipo: 'cuota_proxima',
      monto: total,
      mensaje: `${proximas.length} cuota(s) de crédito por vencer este mes (${formatCLP(total)})`,
    })
  }

  // ── Mes en rojo ─────────────────────────────────────────────────────────────
  if (input.resultadoDevengado < 0) {
    alertas.push({
      nivel: 'alta',
      tipo: 'mes_en_rojo',
      monto: input.resultadoDevengado,
      mensaje: `Mes en rojo: resultado devengado -${formatCLP(Math.abs(input.resultadoDevengado))}`,
    })
  }

  // ── Caja negativa ───────────────────────────────────────────────────────────
  if (input.cajaAprox < 0) {
    alertas.push({
      nivel: 'alta',
      tipo: 'caja_negativa',
      monto: input.cajaAprox,
      mensaje: `Caja aproximada negativa: -${formatCLP(Math.abs(input.cajaAprox))}`,
    })
  }

  // Las 'alta' primero, conservando el orden relativo.
  return alertas.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'alta' ? -1 : 1))
}
