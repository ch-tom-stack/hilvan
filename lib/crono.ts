// lib/crono.ts — lógica PURA del CRONO (cronograma de proyecto, sep-2026).
//
// Sin React, sin Supabase, sin `toLocaleDateString`: la usan el editor (cliente),
// las páginas (servidor), los endpoints del agente y los tests. Las fechas son
// SIEMPRE strings planos "YYYY-MM-DD" (lo que emite <input type="date"> y lo que
// guarda Postgres en una columna `date`) o null. La aritmética se hace sobre
// "número de día" (días desde la época vía Date.UTC) para que un cambio de zona
// horaria nunca corra una fecha un día — el mismo problema que motivó
// lib/fechas.ts, resuelto acá sin pasar por Date local.
//
// Los nombres de mes/día van a mano (no por Intl) para que servidor y navegador
// pinten exactamente lo mismo y no haya hydration mismatch en el editor.

import type { Crono, CronoHito, CronoCompuerta, DestinoCompuerta, EtapaCrono, Feriado, TipoHitoCrono } from '@/types'
import { DESTINOS_COMPUERTA, ETAPAS_CRONO, TIPOS_HITO_CRONO } from '@/types'

// ─── fechas ─────────────────────────────────────────────────────────────────

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_DIA = 86_400_000

export const MESES_CRONO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
export const MESES_CORTOS_CRONO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
// La semana parte el LUNES (índice 0) — así se lee un calendario de rodaje en Chile.
export const DIAS_CORTOS_CRONO = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

/** "YYYY-MM-DD" válido de verdad (rechaza 2026-02-30: el roundtrip por Date.UTC lo delata). */
export function fechaValida(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = RE_FECHA.exec(s)
  if (!m) return false
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

/** Normaliza cualquier entrada a "YYYY-MM-DD" válido o null. Acepta timestamps ISO (toma la fecha). */
export function fechaONull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, 10)
  return fechaValida(s) ? s : null
}

/** Número de día (días desde 1970-01-01, entero). Solo para fechas válidas. */
export function diaNum(iso: string): number {
  const m = RE_FECHA.exec(iso)!
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_DIA)
}

export function isoDeDia(n: number): string {
  const d = new Date(n * MS_DIA)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function sumarDias(iso: string, n: number): string {
  return isoDeDia(diaNum(iso) + n)
}

export function partesFecha(iso: string): { y: number; m: number; d: number } {
  const m = RE_FECHA.exec(iso)!
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

/** 0 = lunes … 6 = domingo. */
export function diaSemana(iso: string): number {
  const { y, m, d } = partesFecha(iso)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

export function diasEnMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** "14 de agosto de 2026" */
export function formatoLargo(iso: string | null | undefined): string {
  if (!fechaValida(iso)) return ''
  const { y, m, d } = partesFecha(iso)
  return `${d} de ${MESES_CRONO[m - 1]} de ${y}`
}
/** "14 ago" */
export function formatoCorto(iso: string | null | undefined): string {
  if (!fechaValida(iso)) return ''
  const { m, d } = partesFecha(iso)
  return `${d} ${MESES_CORTOS_CRONO[m - 1]}`
}
/** "lun 14 ago" */
export function formatoDia(iso: string | null | undefined): string {
  if (!fechaValida(iso)) return ''
  return `${DIAS_CORTOS_CRONO[diaSemana(iso)]} ${formatoCorto(iso)}`
}
/** "14 ago – 16 ago", o "14 ago" si no hay fin (o es el mismo día). */
export function formatoRango(desde: string | null | undefined, hasta: string | null | undefined): string {
  if (!fechaValida(desde)) return ''
  if (!fechaValida(hasta) || hasta === desde) return formatoCorto(desde)
  return `${formatoCorto(desde)} – ${formatoCorto(hasta)}`
}

/** Hoy como "YYYY-MM-DD" en la zona LOCAL de quien lo calcula. Nunca se guarda. */
export function hoyIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── etapas ─────────────────────────────────────────────────────────────────

export const ETAPA_IDS: EtapaCrono[] = ETAPAS_CRONO.map((e) => e.id)

export interface RangoEtapa {
  desde: string | null
  hasta: string | null
}

/** Las 4 etapas de un crono como rangos, en el orden del proyecto. */
export function rangosEtapas(c: Pick<Crono,
  'desarrollo_desde' | 'desarrollo_hasta' | 'pre_desde' | 'pre_hasta' |
  'produccion_desde' | 'produccion_hasta' | 'post_desde' | 'post_hasta'>): Record<EtapaCrono, RangoEtapa> {
  return {
    desarrollo: { desde: c.desarrollo_desde ?? null, hasta: c.desarrollo_hasta ?? null },
    pre:        { desde: c.pre_desde ?? null,        hasta: c.pre_hasta ?? null },
    produccion: { desde: c.produccion_desde ?? null, hasta: c.produccion_hasta ?? null },
    post:       { desde: c.post_desde ?? null,       hasta: c.post_hasta ?? null },
  }
}

/**
 * Fin EFECTIVO de una etapa (número de día): su `hasta`, o —si no tiene— el día
 * anterior al `desde` de la siguiente etapa con fecha, o `finAbierto` si es la
 * última con fecha. null si la etapa no tiene `desde`.
 */
export function finEfectivoEtapa(
  etapas: Record<EtapaCrono, RangoEtapa>,
  id: EtapaCrono,
  finAbierto: number = Number.POSITIVE_INFINITY,
): number | null {
  const et = etapas[id]
  if (!et.desde || !fechaValida(et.desde)) return null
  if (et.hasta && fechaValida(et.hasta)) return diaNum(et.hasta)
  const i = ETAPA_IDS.indexOf(id)
  const sig = ETAPA_IDS.slice(i + 1).map((s) => etapas[s].desde).find((d) => d && fechaValida(d))
  return sig ? diaNum(sig) - 1 : finAbierto
}

/** La etapa que contiene una fecha (la primera cuyo rango efectivo la incluye), o null. */
export function etapaDeFecha(etapas: Record<EtapaCrono, RangoEtapa>, iso: string | null | undefined): EtapaCrono | null {
  if (!fechaValida(iso)) return null
  const n = diaNum(iso)
  for (const id of ETAPA_IDS) {
    const et = etapas[id]
    if (!et.desde || !fechaValida(et.desde)) continue
    const fin = finEfectivoEtapa(etapas, id)
    if (fin == null) continue
    if (n >= diaNum(et.desde) && n <= fin) return id
  }
  return null
}

/** Etapa efectiva de un hito: la declarada, o la deducida de su fecha. */
export function etapaDeHito(etapas: Record<EtapaCrono, RangoEtapa>, h: Pick<CronoHito, 'etapa' | 'fecha'>): EtapaCrono | null {
  return h.etapa ?? etapaDeFecha(etapas, h.fecha)
}

/** Un rango con `hasta` anterior a `desde` es inválido. */
export function rangoInvertido(desde: string | null | undefined, hasta: string | null | undefined): boolean {
  return !!(fechaValida(desde) && fechaValida(hasta) && diaNum(hasta) < diaNum(desde))
}

// ─── hitos ──────────────────────────────────────────────────────────────────

export function esHitoClave(tipo: TipoHitoCrono): boolean {
  return TIPOS_HITO_CRONO.find((t) => t.id === tipo)?.clave ?? false
}
export function nombreTipoHito(tipo: TipoHitoCrono): string {
  return TIPOS_HITO_CRONO.find((t) => t.id === tipo)?.nombre ?? tipo
}
export function nombreEtapa(id: EtapaCrono | null | undefined): string {
  return ETAPAS_CRONO.find((e) => e.id === id)?.nombre ?? ''
}
export function etapaSugeridaParaTipo(tipo: TipoHitoCrono): EtapaCrono | null {
  return TIPOS_HITO_CRONO.find((t) => t.id === tipo)?.etapaSugerida ?? null
}

/** Orden de lectura: por fecha ascendente; los sin fecha al final, en su `orden`. */
export function hitosOrdenados<T extends Pick<CronoHito, 'fecha' | 'orden'>>(hitos: T[]): T[] {
  return hitos
    .map((h, i) => ({ h, i }))
    .sort((a, b) => {
      const fa = fechaValida(a.h.fecha) ? diaNum(a.h.fecha) : Number.POSITIVE_INFINITY
      const fb = fechaValida(b.h.fecha) ? diaNum(b.h.fecha) : Number.POSITIVE_INFINITY
      return fa - fb || a.h.orden - b.h.orden || a.i - b.i
    })
    .map((x) => x.h)
}

/** Hitos que caen en un día (un hito con rango cubre cada día de [fecha, fecha_fin]). */
export function hitosDelDia<T extends Pick<CronoHito, 'fecha' | 'fecha_fin'>>(hitos: T[], iso: string): T[] {
  const n = diaNum(iso)
  return hitos.filter((h) => {
    if (!fechaValida(h.fecha)) return false
    const a = diaNum(h.fecha)
    const b = fechaValida(h.fecha_fin) ? diaNum(h.fecha_fin) : a
    return n >= a && n <= b
  })
}

/** El ZOOM: los hitos clave agrupados por tipo (orden del catálogo), cada grupo por fecha. */
export function zoomClave<T extends Pick<CronoHito, 'tipo' | 'fecha' | 'orden'>>(hitos: T[]): { tipo: TipoHitoCrono; nombre: string; hitos: T[] }[] {
  const ordenados = hitosOrdenados(hitos)
  return TIPOS_HITO_CRONO.filter((t) => t.clave).map((t) => ({
    tipo: t.id,
    nombre: t.nombre,
    hitos: ordenados.filter((h) => h.tipo === t.id),
  }))
}

export function pagosCrono<T extends Pick<CronoHito, 'tipo' | 'fecha' | 'orden'>>(hitos: T[]): T[] {
  return hitosOrdenados(hitos).filter((h) => h.tipo === 'pago')
}

/** Suma de montos de pagos (CLP), total y ya cobrado (`hecho`). */
export function totalPagos<T extends Pick<CronoHito, 'tipo' | 'monto' | 'hecho'>>(hitos: T[]): { total: number; cobrado: number; pendiente: number } {
  let total = 0, cobrado = 0
  for (const h of hitos) {
    if (h.tipo !== 'pago') continue
    const m = typeof h.monto === 'number' && Number.isFinite(h.monto) ? h.monto : 0
    total += m
    if (h.hecho) cobrado += m
  }
  return { total, cobrado, pendiente: total - cobrado }
}

// ─── rango y calendario ─────────────────────────────────────────────────────

/** Mínimo y máximo de TODAS las fechas del crono (etapas + hitos), o null si no hay ninguna. */
export function rangoCrono(
  etapas: Record<EtapaCrono, RangoEtapa>,
  hitos: Pick<CronoHito, 'fecha' | 'fecha_fin'>[],
): { desde: string; hasta: string } | null {
  const dias: number[] = []
  for (const id of ETAPA_IDS) {
    const et = etapas[id]
    if (fechaValida(et.desde)) dias.push(diaNum(et.desde))
    if (fechaValida(et.hasta)) dias.push(diaNum(et.hasta))
  }
  for (const h of hitos) {
    if (fechaValida(h.fecha)) dias.push(diaNum(h.fecha))
    if (fechaValida(h.fecha_fin)) dias.push(diaNum(h.fecha_fin))
  }
  if (dias.length === 0) return null
  return { desde: isoDeDia(Math.min(...dias)), hasta: isoDeDia(Math.max(...dias)) }
}

/** Meses (año, mes 1-12) que cubre un rango, inclusive. */
export function mesesDelRango(desde: string, hasta: string): { y: number; m: number }[] {
  const a = partesFecha(desde), b = partesFecha(hasta)
  const out: { y: number; m: number }[] = []
  let y = a.y, m = a.m
  while (y < b.y || (y === b.y && m <= b.m)) {
    out.push({ y, m })
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

// ─── normalización de entradas (agente / formularios) ───────────────────────

export const TIPO_HITO_IDS: TipoHitoCrono[] = TIPOS_HITO_CRONO.map((t) => t.id)

export function esTipoHito(v: unknown): v is TipoHitoCrono {
  return typeof v === 'string' && (TIPO_HITO_IDS as string[]).includes(v)
}
export function esEtapa(v: unknown): v is EtapaCrono {
  return typeof v === 'string' && (ETAPA_IDS as string[]).includes(v)
}

/** Monto CLP entero ≥ 0 o null. Acepta number o string numérico ("1200000", "1.200.000"). */
export function montoONull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(/,/g, '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

export interface HitoEntrada {
  id?: string
  tipo: TipoHitoCrono
  titulo: string
  fecha: string | null
  fecha_fin: string | null
  etapa: EtapaCrono | null
  monto: number | null
  notas: string | null
  responsable: string | null
  hecho: boolean
  rodaje_id: string | null
}

/**
 * Normaliza un hito venido de afuera (agente o formulario) a la forma que se
 * escribe en `crono_hitos`. Defensivo y nunca lanza: tipo desconocido → 'otro',
 * etapa desconocida → null (se deduce), fecha inválida → null, fecha_fin anterior
 * o igual a fecha → null, monto inválido → null.
 */
export function normalizarHito(v: unknown): HitoEntrada {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  const tipo = esTipoHito(o.tipo) ? o.tipo : 'otro'
  const fecha = fechaONull(o.fecha)
  let fecha_fin = fechaONull(o.fecha_fin)
  if (!fecha || (fecha_fin && diaNum(fecha_fin) <= diaNum(fecha))) fecha_fin = null
  const id = typeof o.id === 'string' && /^[0-9a-f-]{36}$/i.test(o.id) ? o.id : undefined
  return {
    id,
    tipo,
    titulo: typeof o.titulo === 'string' ? o.titulo.trim() : '',
    fecha,
    fecha_fin,
    etapa: esEtapa(o.etapa) ? o.etapa : null,
    monto: tipo === 'pago' ? montoONull(o.monto) : null,
    notas: typeof o.notas === 'string' && o.notas.trim() ? o.notas.trim() : null,
    responsable: typeof o.responsable === 'string' && o.responsable.trim() ? o.responsable.trim() : null,
    hecho: o.hecho === true,
    rodaje_id: typeof o.rodaje_id === 'string' && o.rodaje_id ? o.rodaje_id : null,
  }
}

/** Las 8 columnas de etapas a partir de un objeto libre {desarrollo:{desde,hasta}, ...}. Fechas inválidas → null. */
export function columnasEtapasDesde(v: unknown): Partial<Record<
  'desarrollo_desde' | 'desarrollo_hasta' | 'pre_desde' | 'pre_hasta' |
  'produccion_desde' | 'produccion_hasta' | 'post_desde' | 'post_hasta', string | null>> {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  const out: Record<string, string | null> = {}
  for (const id of ETAPA_IDS) {
    const et = o[id]
    if (et === undefined) continue // no tocar lo que no vino
    const r = et && typeof et === 'object' ? (et as Record<string, unknown>) : {}
    out[`${id}_desde`] = fechaONull(r.desde)
    out[`${id}_hasta`] = fechaONull(r.hasta)
  }
  return out
}

// ─── semanas (la grilla semanal del módulo y del export) ─────────────────────

/** Lunes de la semana que contiene `iso`. */
export function lunesDe(iso: string): string {
  return sumarDias(iso, -diaSemana(iso))
}

/**
 * Semanas (lunes ISO) que cubren el rango del crono, con un mínimo de `minSemanas`.
 * Sin rango: las semanas alrededor de `hoy`. Siempre empieza en lunes y termina
 * en domingo — es la grilla "todo en una página" del crono.
 */
export function semanasDelCrono(
  rango: { desde: string; hasta: string } | null,
  hoy: string,
  minSemanas = 4,
): string[] {
  const base = rango ?? { desde: hoy, hasta: hoy }
  const ini = lunesDe(base.desde)
  let fin = lunesDe(base.hasta)
  let n = Math.round((diaNum(fin) - diaNum(ini)) / 7) + 1
  while (n < minSemanas) {
    fin = sumarDias(fin, 7)
    n++
  }
  const out: string[] = []
  for (let w = ini; diaNum(w) <= diaNum(fin); w = sumarDias(w, 7)) out.push(w)
  return out
}

/** Los 7 días de una semana a partir de su lunes. */
export function diasDeSemana(lunes: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

/** Próximo hito clave (fecha ≥ hoy), o null. */
export function proximoHitoClave<T extends Pick<CronoHito, 'tipo' | 'fecha' | 'orden' | 'hecho'>>(hitos: T[], hoy: string): T | null {
  const h = diaNum(hoy)
  return hitosOrdenados(hitos).find((x) => esHitoClave(x.tipo) && !x.hecho && fechaValida(x.fecha) && diaNum(x.fecha) >= h) ?? null
}

// ─── v2: feriados, lectura y compuertas ──────────────────────────────────────


export type MapaFeriados = Map<string, string>

export function mapaFeriados(lista: Feriado[]): MapaFeriados {
  return new Map(lista.filter((f) => fechaValida(f.fecha)).map((f) => [f.fecha, f.nombre]))
}

export function esFinde(iso: string): boolean {
  return diaSemana(iso) >= 5
}

/** Día hábil = ni fin de semana ni feriado. */
export function esHabil(iso: string, feriados: MapaFeriados): boolean {
  return !esFinde(iso) && !feriados.has(iso)
}

/** Días hábiles en [desde, hasta], inclusive. 0 si el rango es inválido. */
export function diasHabiles(desde: string | null | undefined, hasta: string | null | undefined, feriados: MapaFeriados): number {
  if (!fechaValida(desde) || !fechaValida(hasta) || diaNum(hasta) < diaNum(desde)) return 0
  let n = 0
  for (let d = diaNum(desde); d <= diaNum(hasta); d++) if (esHabil(isoDeDia(d), feriados)) n++
  return n
}

export interface LecturaEtapa {
  id: EtapaCrono
  nombre: string
  desde: string | null
  hasta: string | null   // fin efectivo (puede venir de la siguiente etapa)
  corridos: number
  habiles: number
  peso: number           // 0..1 del total de días corridos con fecha
}

/** Días corridos y hábiles por etapa, y su peso en el proyecto. */
export function lecturaEtapas(etapas: Record<EtapaCrono, RangoEtapa>, feriados: MapaFeriados, finAbierto?: string): LecturaEtapa[] {
  const finN = finAbierto && fechaValida(finAbierto) ? diaNum(finAbierto) : undefined
  const filas = ETAPAS_CRONO.map((e) => {
    const et = etapas[e.id]
    const fin = finEfectivoEtapa(etapas, e.id, finN ?? Number.POSITIVE_INFINITY)
    const hasta = fin != null && Number.isFinite(fin) ? isoDeDia(fin) : null
    const corridos = et.desde && hasta ? diaNum(hasta) - diaNum(et.desde) + 1 : 0
    return { id: e.id, nombre: e.nombre, desde: et.desde ?? null, hasta, corridos, habiles: diasHabiles(et.desde, hasta, feriados), peso: 0 }
  })
  const total = filas.reduce((s, f) => s + f.corridos, 0)
  return filas.map((f) => ({ ...f, peso: total > 0 ? f.corridos / total : 0 }))
}

export interface AvisoCrono {
  tipo: 'hito_no_habil' | 'etapa_invertida' | 'hueco' | 'sin_fecha'
  texto: string
  hito_id?: string
  /** Sugerencia: el hábil anterior más cercano, para "moverlo al …". */
  sugerido?: string
}

/** El hábil anterior más cercano a `iso` (o el mismo si ya es hábil). */
export function habilAnterior(iso: string, feriados: MapaFeriados): string {
  let d = iso
  for (let i = 0; i < 14 && !esHabil(d, feriados); i++) d = sumarDias(d, -1)
  return d
}

/** Lo que la herramienta debe decir sola: hitos clave o pagos en día no hábil, etapas invertidas, hitos sin fecha. */
export function avisosCrono(
  etapas: Record<EtapaCrono, RangoEtapa>,
  hitos: Pick<CronoHito, 'id' | 'tipo' | 'titulo' | 'fecha' | 'hecho'>[],
  feriados: MapaFeriados,
): AvisoCrono[] {
  const out: AvisoCrono[] = []
  for (const e of ETAPAS_CRONO) {
    const et = etapas[e.id]
    if (rangoInvertido(et.desde, et.hasta)) out.push({ tipo: 'etapa_invertida', texto: `${e.nombre} termina antes de empezar.` })
  }
  for (const h of hitos) {
    if (h.hecho) continue
    const nombre = h.titulo || nombreTipoHito(h.tipo)
    if (!fechaValida(h.fecha)) {
      if (esHitoClave(h.tipo)) out.push({ tipo: 'sin_fecha', texto: `${nombre} no tiene fecha todavía.`, hito_id: h.id })
      continue
    }
    if ((esHitoClave(h.tipo) || h.tipo === 'pago') && !esHabil(h.fecha, feriados)) {
      const motivo = feriados.get(h.fecha) ?? (esFinde(h.fecha) ? 'fin de semana' : '')
      const sug = habilAnterior(h.fecha, feriados)
      out.push({ tipo: 'hito_no_habil', texto: `${nombre} cae en ${motivo} (${formatoDia(h.fecha)}).`, hito_id: h.id, sugerido: sug !== h.fecha ? sug : undefined })
    }
  }
  return out
}

export interface CompuertaEvaluada extends Pick<CronoCompuerta, 'id' | 'destino' | 'orden' | 'texto' | 'hito_id' | 'responsable'> {
  automatica: boolean
  ok: boolean
  /** Para las automáticas: la fecha del hito, para mostrar "automático, 7 oct". */
  fecha_hito: string | null
}
export interface GrupoCompuertas {
  destino: DestinoCompuerta
  nombre: string
  checks: CompuertaEvaluada[]
  faltan: number
  lista: boolean
}

/**
 * Evalúa las compuertas contra los hitos: una automática está ok cuando su hito
 * está hecho (o cuando ese hito es un rodaje real confirmado en Hilván, si se pasa
 * `rodajesConfirmados`); una manual, cuando `hecho`.
 */
export function evaluarCompuertas(
  compuertas: Pick<CronoCompuerta, 'id' | 'destino' | 'orden' | 'texto' | 'hito_id' | 'responsable' | 'hecho'>[],
  hitos: Pick<CronoHito, 'id' | 'fecha' | 'hecho' | 'rodaje_id'>[],
  rodajesConfirmados: Set<string> = new Set(),
): GrupoCompuertas[] {
  const porId = new Map(hitos.map((h) => [h.id, h]))
  return DESTINOS_COMPUERTA.map((d) => {
    const checks = compuertas
      .filter((c) => c.destino === d.id)
      .sort((a, b) => a.orden - b.orden)
      .map((c) => {
        const h = c.hito_id ? porId.get(c.hito_id) ?? null : null
        const automatica = !!c.hito_id
        const ok = automatica ? !!h && (h.hecho || (!!h.rodaje_id && rodajesConfirmados.has(h.rodaje_id))) : c.hecho
        return { id: c.id, destino: c.destino, orden: c.orden, texto: c.texto, hito_id: c.hito_id, responsable: c.responsable, automatica, ok, fecha_hito: h?.fecha ?? null }
      })
    const faltan = checks.filter((c) => !c.ok).length
    return { destino: d.id, nombre: d.nombre, checks, faltan, lista: checks.length > 0 && faltan === 0 }
  })
}

/**
 * Compuertas sugeridas al crear un crono: los checks automáticos se enganchan al
 * primer hito de cada tipo que exista; si no existe, el check nace manual con el
 * mismo texto (se vuelve automático al asociarle un hito).
 */
export function compuertasPorDefecto(hitos: Pick<CronoHito, 'id' | 'tipo' | 'fecha' | 'orden'>[]): Omit<CronoCompuerta, 'id' | 'crono_id' | 'created_at' | 'updated_at'>[] {
  const ordenados = hitosOrdenados(hitos)
  const primero = (tipo: TipoHitoCrono) => ordenados.find((h) => h.tipo === tipo)?.id ?? null
  const ultimo = (tipo: TipoHitoCrono) => [...ordenados].reverse().find((h) => h.tipo === tipo)?.id ?? null
  const mk = (destino: DestinoCompuerta, orden: number, texto: string, hito_id: string | null = null): Omit<CronoCompuerta, 'id' | 'crono_id' | 'created_at' | 'updated_at'> =>
    ({ destino, orden, texto, hito_id, responsable: null, hecho: false })
  return [
    mk('pre', 0, 'Primer pago cobrado', primero('pago')),
    mk('pre', 1, 'Devolución hecha', primero('devolucion')),
    mk('pre', 2, 'Guion y planta aprobados por el cliente'),
    mk('produccion', 0, 'Cast cerrado'),
    mk('produccion', 1, 'Locaciones confirmadas'),
    mk('produccion', 2, 'Pre de equipo hecha', primero('pre_equipo')),
    mk('produccion', 3, 'Rodaje confirmado en Hilván', primero('rodaje')),
    mk('post', 0, 'Rodaje terminado', ultimo('rodaje')),
    mk('post', 1, 'Material respaldado en dos discos'),
    mk('cierre', 0, 'Entrega final hecha', ultimo('entrega')),
    mk('cierre', 1, 'Pago final cobrado', ultimo('pago')),
  ]
}

/** Hitos entre dos fechas (inclusive), ordenados — "esta semana y la próxima". */
export function hitosEntre<T extends Pick<CronoHito, 'fecha' | 'fecha_fin' | 'orden'>>(hitos: T[], desde: string, hasta: string): T[] {
  const a = diaNum(desde), b = diaNum(hasta)
  return hitosOrdenados(hitos).filter((h) => {
    if (!fechaValida(h.fecha)) return false
    const x = diaNum(h.fecha), y = fechaValida(h.fecha_fin) ? diaNum(h.fecha_fin) : x
    return y >= a && x <= b
  })
}
