// lib/sii-cola.ts
// Reglas puras de la cola de importaciones del SII (sql/sii_solicitudes.sql).
// SIN I/O. La sesión y la clave del SII viven solo en el Mac de Tomás: Hilván
// encola y el trabajador del Mac (scripts/sii/trabajador.mjs, launchd) toma,
// importa y reporta.
import { LADOS_SII, periodoAAAAMM, type LadoSii } from './sii-cli'

/** Cada cuánto pregunta el Mac (launchd StartInterval). */
export const INTERVALO_TRABAJADOR_MIN = 5
/** Sin latido por más de esto, el Mac se considera fuera de línea (dormido o apagado). */
export const TRABAJADOR_EN_LINEA_MIN = 15
/** Un pedido 'en_curso' más viejo que esto quedó huérfano (el Mac se durmió o se
 *  cayó a mitad de camino) y se puede volver a tomar. Una importación dura ~10 s. */
export const EN_CURSO_HUERFANO_MIN = 30

/** Fecha de hoy en Chile → { anio, mes, dia }. */
export function hoyEnChile(ahora: Date): { anio: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora)
  const n = (t: string) => Number(partes.find((p) => p.type === t)?.value)
  return { anio: n('year'), mes: n('month'), dia: n('day') }
}

/** Períodos que el cron de los lunes manda a importar: el mes en curso y, hasta el
 *  día 15, también el anterior (las facturas de un mes siguen llegando al registro
 *  del SII durante los primeros días del siguiente). Más reciente primero. */
export function periodosSemanales(ahora: Date): string[] {
  const { anio, mes, dia } = hoyEnChile(ahora)
  const actual = `${anio}${String(mes).padStart(2, '0')}`
  if (dia > 15) return [actual]
  const anterior = mes === 1 ? `${anio - 1}12` : `${anio}${String(mes - 1).padStart(2, '0')}`
  return [actual, anterior]
}

/** Valida los lados pedidos (default: los tres). Inválido → null. */
export function ladosPedidos(v: unknown): LadoSii[] | null {
  if (v === undefined || v === null) return [...LADOS_SII]
  if (!Array.isArray(v) || !v.length) return null
  const lados = [...new Set(v.map((x) => String(x)))]
  return lados.every((l) => (LADOS_SII as readonly string[]).includes(l)) ? (lados as LadoSii[]) : null
}

/** Un período pedible: válido y no futuro (el SII no tiene nada que mostrar). */
export function periodoPedible(v: unknown, ahora: Date): { ok: true; periodo: string } | { ok: false; error: string } {
  const periodo = periodoAAAAMM(v)
  if (!periodo) return { ok: false, error: 'periodo inválido (AAAAMM o AAAA-MM, ej. 2026-09)' }
  const { anio, mes } = hoyEnChile(ahora)
  if (periodo > `${anio}${String(mes).padStart(2, '0')}`) {
    return { ok: false, error: `El período ${periodo} todavía no empieza` }
  }
  return { ok: true, periodo }
}

const minutosDesde = (iso: string | null | undefined, ahora: Date): number | null =>
  iso ? (ahora.getTime() - new Date(iso).getTime()) / 60_000 : null

export interface EstadoTrabajador {
  ultimo_latido: string | null
  bloqueado: boolean
  motivo_bloqueo: string | null
  bloqueado_at?: string | null
  version?: string | null
}

/** Cómo ve el agente al Mac: en línea, fuera de línea o bloqueado, con qué hacer. */
export function describirTrabajador(t: EstadoTrabajador | null, ahora: Date): {
  estado: 'en_linea' | 'fuera_de_linea' | 'bloqueado' | 'nunca_conectado'
  ultimo_latido: string | null
  minutos_sin_latido: number | null
  mensaje: string
} {
  const min = minutosDesde(t?.ultimo_latido, ahora)
  const base = { ultimo_latido: t?.ultimo_latido ?? null, minutos_sin_latido: min === null ? null : Math.round(min) }
  if (t?.bloqueado) {
    return {
      ...base,
      estado: 'bloqueado',
      mensaje:
        `El SII rechazó el login del Mac (${t.motivo_bloqueo ?? 'sin detalle'}). No se reintenta para no ` +
        'bloquear la cuenta. Tomás debe revisar la clave del Llavero y liberar el trabajador desde el Mac. ' +
        'No pidas importaciones hasta entonces.',
    }
  }
  if (min === null) {
    return { ...base, estado: 'nunca_conectado', mensaje: 'El trabajador del Mac nunca se ha conectado. Avisa a Tomás.' }
  }
  if (min > TRABAJADOR_EN_LINEA_MIN) {
    return {
      ...base,
      estado: 'fuera_de_linea',
      mensaje:
        `El Mac de Tomás no responde hace ${Math.round(min)} min (dormido o apagado). Los pedidos quedan en ` +
        'cola y se procesan cuando despierte; avísale si es urgente.',
    }
  }
  return {
    ...base,
    estado: 'en_linea',
    mensaje: `El Mac está en línea: un pedido nuevo se procesa en menos de ${INTERVALO_TRABAJADOR_MIN + 1} min.`,
  }
}

export interface Solicitud {
  id: string
  periodo: string
  lados: LadoSii[]
  estado: 'pendiente' | 'en_curso' | 'hecha' | 'fallida'
  origen: 'agente' | 'cron'
  solicitado_at: string
  tomado_at: string | null
  terminado_at: string | null
  resultado: unknown
  error: string | null
}

/** ¿El trabajador puede tomar este pedido? Pendiente, o en curso pero huérfano. */
export function solicitudTomable(s: Pick<Solicitud, 'estado' | 'tomado_at'>, ahora: Date): boolean {
  if (s.estado === 'pendiente') return true
  if (s.estado !== 'en_curso') return false
  const min = minutosDesde(s.tomado_at, ahora)
  return min === null || min > EN_CURSO_HUERFANO_MIN
}
