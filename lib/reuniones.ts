// lib/reuniones.ts
// Motor de disponibilidad para el agendamiento público de reuniones (/reunion).
// Genera los slots libres según reglas de negocio, restando lo ocupado del Google
// Calendar (freebusy), y CAPA a un máximo por día (para no exponer toda la agenda).
// Puro (sin I/O): recibe `ahora` y los intervalos ocupados; devuelve los slots.

export const REUNIONES_CONFIG = {
  tz: 'America/Santiago',
  diasHabiles: [1, 2, 3, 4, 5], // getDay: 0=domingo … 6=sábado → lun a vie
  ventanas: [
    ['10:00', '13:00'],
    ['15:00', '18:00'],
  ] as [string, string][],
  duracionMin: 30,
  bufferMin: 15, // separación mínima contra eventos existentes y entre slots
  anticipacionHoras: 24, // no agendar con menos de 24 h
  horizonteDias: 14, // hasta 2 semanas hacia adelante
  maxPorDia: 4, // tope de slots visibles por día (agenda "sana")
}

export interface Slot {
  inicio: Date
  fin: Date
}

// Offset (minutos que la tz va adelantada respecto de UTC) en un instante dado.
// Ej. America/Santiago en invierno → -240 (UTC-4).
function offsetMinutos(tz: string, instante: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(dtf.formatToParts(instante).map((x) => [x.type, x.value]))
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? '0' : p.hour), +p.minute, +p.second)
  return (asUTC - instante.getTime()) / 60000
}

// Hora de pared (Y-M-D hh:mm) en la tz → instante UTC (Date).
function paredTzAUTC(tz: string, y: number, m: number, d: number, hh: number, mm: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm))
  const off = offsetMinutos(tz, guess)
  return new Date(guess.getTime() - off * 60000)
}

// Y-M-D y día de semana de un instante EN la tz.
function fechaEnTz(tz: string, instante: Date): { y: number; m: number; d: number; dow: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  })
  const p = Object.fromEntries(dtf.formatToParts(instante).map((x) => [x.type, x.value]))
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { y: +p.year, m: +p.month, d: +p.day, dow: dowMap[p.weekday] ?? 0 }
}

const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return { h, m } }

// Selecciona hasta `max` slots repartidos parejo (primero, ~1/3, ~2/3, último).
function repartir(slots: Slot[], max: number): Slot[] {
  if (slots.length <= max) return slots
  const out: Slot[] = []
  for (let i = 0; i < max; i++) out.push(slots[Math.round((i * (slots.length - 1)) / (max - 1))])
  return out
}

/**
 * Genera los slots disponibles entre `ahora + anticipación` y `ahora + horizonte`.
 * @param ahora  instante actual
 * @param ocupados intervalos ocupados del calendario ({start,end} ISO)
 */
export function generarSlots(ahora: Date, ocupados: { start: string; end: string }[], cfg = REUNIONES_CONFIG): Slot[] {
  const busy = ocupados.map((b) => ({ ini: new Date(b.start).getTime(), fin: new Date(b.end).getTime() }))
  const bufferMs = cfg.bufferMin * 60000
  const minInicio = ahora.getTime() + cfg.anticipacionHoras * 3600000
  const maxInicio = ahora.getTime() + cfg.horizonteDias * 86400000
  const pasoMs = (cfg.duracionMin + cfg.bufferMin) * 60000
  const durMs = cfg.duracionMin * 60000

  const libre = (ini: number, fin: number) =>
    !busy.some((b) => ini - bufferMs < b.fin && fin + bufferMs > b.ini)

  const resultado: Slot[] = []
  // Recorremos día a día en la tz (partimos de "hoy" y avanzamos por fecha de pared).
  for (let off = 0; off <= cfg.horizonteDias; off++) {
    const ref = new Date(ahora.getTime() + off * 86400000)
    const { y, m, d, dow } = fechaEnTz(cfg.tz, ref)
    if (!cfg.diasHabiles.includes(dow)) continue

    const delDia: Slot[] = []
    for (const [desde, hasta] of cfg.ventanas) {
      const a = hm(desde), b = hm(hasta)
      const ventInicio = paredTzAUTC(cfg.tz, y, m, d, a.h, a.m).getTime()
      const ventFin = paredTzAUTC(cfg.tz, y, m, d, b.h, b.m).getTime()
      for (let t = ventInicio; t + durMs <= ventFin; t += pasoMs) {
        if (t < minInicio || t > maxInicio) continue
        if (libre(t, t + durMs)) delDia.push({ inicio: new Date(t), fin: new Date(t + durMs) })
      }
    }
    resultado.push(...repartir(delDia, cfg.maxPorDia))
  }
  return resultado.sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
}

// ¿El slot que pide el visitante es uno de los realmente disponibles ahora?
// (El endpoint re-valida contra esto para no confiar en el cliente.)
export function slotDisponible(inicioISO: string, ahora: Date, ocupados: { start: string; end: string }[]): Slot | null {
  const t = new Date(inicioISO).getTime()
  if (Number.isNaN(t)) return null
  return generarSlots(ahora, ocupados).find((s) => s.inicio.getTime() === t) ?? null
}
