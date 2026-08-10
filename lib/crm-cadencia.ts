// Cadencia de contacto (CH-10): CUÁNDO toca el próximo correo.
//
// Complementa `components/crm/ComoAbordarlo.tsx`, que resuelve el QUÉ decir en
// cada toque. Acá solo vive el reloj. Reglas confirmadas por Tomás (ago 2026),
// documentadas en docs/crm/reglas-cadencia.md.
//
// Decisiones de diseño:
//  - CUALQUIER toque (correo, llamada, mensaje, reunión) reinicia el reloj: no
//    tiene sentido perseguir por correo a alguien con quien se habló ayer.
//  - Una respuesta manda sobre todo: se contesta lo antes posible y la escalera
//    vuelve a empezar. Nadie sigue en una secuencia después de contestar.
//  - Todo se calcula sobre fechas planas YYYY-MM-DD; nunca `new Date(str)`
//    directo, que se corre un día por UTC.

/** Días de espera según cuántos toques seguidos van sin respuesta. */
export function intervaloPara(sinRespuesta: number): number {
  if (sinRespuesta <= 1) return 2
  if (sinRespuesta === 2) return 4
  return 7
}

/** Al 16° sin respuesta se corta la cadencia y se propone pasarlo a En frío. */
export const LIMITE_SIN_RESPUESTA = 16

/** El snooze nunca puede pasar de un tercio del tramo (mínimo un día). */
export function snoozeMaximo(intervalo: number): number {
  return Math.max(1, Math.floor(intervalo / 3))
}

export type EstadoCadencia =
  | 'respondio'   // contestó y le debemos respuesta — lo más urgente
  | 'nunca'       // sin ningún toque todavía
  | 'atrasado'    // se pasó la fecha
  | 'hoy'         // vence hoy
  | 'espera'      // aún no toca
  | 'snooze'      // pospuesto a mano
  | 'agotado'     // 16 sin respuesta: se detiene

export interface Cadencia {
  estado: EstadoCadencia
  /** Toques consecutivos sin respuesta (0 si acaba de contestar). */
  sinRespuesta: number
  ultimoToque: string | null
  /** Fecha en que toca el próximo contacto (YYYY-MM-DD). */
  vence: string | null
  /** Días de atraso; 0 si no está vencido. */
  diasAtraso: number
  /** Días del tramo actual de la escalera. */
  intervalo: number
  /** Tope de días que se puede posponer. */
  snoozeMax: number
  /** Entra en la lista del día. */
  pendiente: boolean
}

export interface ToqueCadencia {
  fecha: string | null
  respondido?: boolean | null
}

// ── Fechas planas ────────────────────────────────────────────────────────────

function aDate(iso: string): Date {
  // Mediodía: inmune a cualquier corrimiento por zona horaria.
  return new Date(`${iso}T12:00:00`)
}

function aISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function sumarDias(iso: string, dias: number): string {
  const d = aDate(iso)
  d.setDate(d.getDate() + dias)
  return aISO(d)
}

export function diffDias(desde: string, hasta: string): number {
  return Math.round((aDate(hasta).getTime() - aDate(desde).getTime()) / 86_400_000)
}

/** Sábado o domingo se corren al lunes: no mandamos correos de trabajo el finde. */
export function aDiaHabil(iso: string): string {
  const dow = aDate(iso).getDay() // 0 dom, 6 sáb
  if (dow === 6) return sumarDias(iso, 2)
  if (dow === 0) return sumarDias(iso, 1)
  return iso
}

// ── Motor ────────────────────────────────────────────────────────────────────

/**
 * Estado de cadencia de un prospecto.
 *
 * `toques` puede venir en cualquier orden; se ordena por fecha. Los toques sin
 * fecha se ignoran (no se puede fechar un reloj con ellos).
 */
export function calcularCadencia(
  toques: ToqueCadencia[],
  hoy: string,
  snoozeHasta?: string | null,
): Cadencia {
  const orden = toques
    .filter((t): t is ToqueCadencia & { fecha: string } => Boolean(t.fecha))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))

  const base = { snoozeMax: snoozeMaximo(2), intervalo: 2 }

  // Nunca tocado: entra hoy.
  if (orden.length === 0) {
    return {
      estado: 'nunca', sinRespuesta: 0, ultimoToque: null,
      vence: hoy, diasAtraso: 0, ...base, pendiente: true,
    }
  }

  const ultimo = orden[orden.length - 1]

  // Contestó el último toque → le debemos respuesta. Manda sobre todo lo demás,
  // incluido el snooze: la escalera se reinicia cuando alguien habla.
  if (ultimo.respondido) {
    return {
      estado: 'respondio', sinRespuesta: 0, ultimoToque: ultimo.fecha,
      vence: hoy, diasAtraso: 0, ...base, pendiente: true,
    }
  }

  // Toques consecutivos sin respuesta, contando hacia atrás.
  let sinRespuesta = 0
  for (let i = orden.length - 1; i >= 0; i--) {
    if (orden[i].respondido) break
    sinRespuesta++
  }

  const intervalo = intervaloPara(sinRespuesta)
  const snoozeMax = snoozeMaximo(intervalo)

  // Agotado: 16 sin respuesta. Se detiene la máquina y se propone En frío.
  if (sinRespuesta >= LIMITE_SIN_RESPUESTA) {
    return {
      estado: 'agotado', sinRespuesta, ultimoToque: ultimo.fecha,
      vence: null, diasAtraso: 0, intervalo, snoozeMax, pendiente: false,
    }
  }

  let vence = aDiaHabil(sumarDias(ultimo.fecha, intervalo))

  // El snooze solo puede EMPUJAR hacia adelante.
  if (snoozeHasta && snoozeHasta > vence) {
    vence = aDiaHabil(snoozeHasta)
    if (vence > hoy) {
      return {
        estado: 'snooze', sinRespuesta, ultimoToque: ultimo.fecha,
        vence, diasAtraso: 0, intervalo, snoozeMax, pendiente: false,
      }
    }
  }

  const atraso = diffDias(vence, hoy)
  const estado: EstadoCadencia = atraso > 0 ? 'atrasado' : atraso === 0 ? 'hoy' : 'espera'

  return {
    estado, sinRespuesta, ultimoToque: ultimo.fecha,
    vence, diasAtraso: Math.max(0, atraso), intervalo, snoozeMax,
    pendiente: atraso >= 0,
  }
}

/** Orden de la lista del día: primero quien contestó, después el más atrasado. */
export function prioridadCadencia(c: Cadencia): number {
  if (c.estado === 'respondio') return 1000 + c.diasAtraso
  if (c.estado === 'nunca') return 500
  return c.diasAtraso
}
