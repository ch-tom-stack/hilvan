// lib/crm-preguntas.ts
// "¿En qué quedó?" — lógica pura: a quién se le pregunta y por qué.
// La parte que toca la base vive en lib/crm-preguntas-io.ts.

export const RESPUESTAS = ['hablamos', 'postergo', 'no', 'planto', 'nada'] as const
export type RespuestaPregunta = (typeof RESPUESTAS)[number]
export type MotivoPregunta = 'reunion' | 'silencio'

export const ETIQUETA_RESPUESTA: Record<RespuestaPregunta, string> = {
  hablamos: 'Hablamos por otro canal',
  postergo: 'Postergó',
  no: 'Dijo que no',
  planto: 'Me plantó',
  nada: 'Nada nuevo',
}

/** Qué pasa en el CRM con cada respuesta — se muestra en la página antes de guardar. */
export const EFECTO_RESPUESTA: Record<RespuestaPregunta, string> = {
  hablamos: 'Queda registrado como un contacto de hoy y el reloj de seguimiento parte de nuevo.',
  postergo: 'Queda registrado lo que dijo y el prospecto sale de tu lista hasta la fecha que indiques.',
  no: 'Queda registrada su respuesta y el prospecto pasa a Descartado.',
  planto: 'Queda registrado que no llegó a la reunión.',
  nada: 'No cambia nada en el CRM. No te volvemos a preguntar por una semana.',
}

export const DIAS_TRAS_REUNION = 2
export const DIAS_DE_SILENCIO = 10
export const DIAS_SIN_REPREGUNTAR = 7
export const MAX_PREGUNTAS_POR_PERSONA = 5
export const DIAS_POSTERGACION_DEFECTO = 30

export function esRespuesta(v: unknown): v is RespuestaPregunta {
  return typeof v === 'string' && (RESPUESTAS as readonly string[]).includes(v)
}

export interface ToquePregunta {
  fecha: string | null
  tipo?: string | null
  direccion?: string | null
}

/** Días entre dos fechas planas YYYY-MM-DD, sin pasar por la zona horaria local. */
export function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

/**
 * ¿Hay que preguntarle a alguien en qué quedó este prospecto?
 *
 * Dos situaciones en que el CRM probablemente está ciego:
 *   · reunion  — lo último registrado es una reunión y pasaron días. Después de
 *                una reunión siempre pasa ALGO (propuesta, postergación, plantón),
 *                y casi nunca pasa por correo.
 *   · silencio — está en 'conversacion' y no hay nada registrado hace rato. Una
 *                conversación viva que se calla suele haberse mudado de canal.
 *
 * Si lo último es un mensaje RECIBIDO no se pregunta: ahí no falta información,
 * falta contestar — y de eso ya se encarga la cadencia.
 */
export function motivoPregunta(
  toques: ToquePregunta[],
  etapa: string,
  hoy: string,
): { motivo: MotivoPregunta; dias: number; ultimaFecha: string } | null {
  const conFecha = toques.filter((t): t is ToquePregunta & { fecha: string } => !!t.fecha && t.fecha <= hoy)
  if (conFecha.length === 0) return null
  const ultimo = conFecha.reduce((a, b) => (b.fecha >= a.fecha ? b : a))
  const dias = diasEntre(ultimo.fecha, hoy)

  if (ultimo.tipo === 'reunion' && dias >= DIAS_TRAS_REUNION) {
    return { motivo: 'reunion', dias, ultimaFecha: ultimo.fecha }
  }
  if (etapa === 'conversacion' && ultimo.direccion !== 'recibido' && dias >= DIAS_DE_SILENCIO) {
    return { motivo: 'silencio', dias, ultimaFecha: ultimo.fecha }
  }
  return null
}

export interface CandidatoPregunta {
  prospecto_id: string
  empresa: string
  motivo: MotivoPregunta
  dias: number
  ultimaFecha: string
}

/**
 * Las preguntas de UNA persona para hoy. Pocas a propósito: un correo con veinte
 * preguntas no se contesta. Primero las reuniones (es donde más se pierde),
 * después el silencio más largo.
 */
export function elegirPreguntas(candidatos: CandidatoPregunta[], max = MAX_PREGUNTAS_POR_PERSONA): CandidatoPregunta[] {
  return [...candidatos]
    .sort((a, b) => {
      if (a.motivo !== b.motivo) return a.motivo === 'reunion' ? -1 : 1
      return b.dias - a.dias
    })
    .slice(0, max)
}

export function textoMotivo(c: Pick<CandidatoPregunta, 'motivo' | 'dias'>): string {
  return c.motivo === 'reunion'
    ? `reunión hace ${c.dias} día${c.dias === 1 ? '' : 's'}, nada registrado después`
    : `en conversación, ${c.dias} días sin registro`
}
