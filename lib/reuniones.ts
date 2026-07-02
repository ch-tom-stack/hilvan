// lib/reuniones.ts
// Motor de disponibilidad para el agendamiento público (/reunion).
// Devuelve, por día hábil, TODOS los slots de la grilla marcados como disponible
// o bloqueado — para mostrar los bloqueados y dar sensación de escasez. Los
// "abiertos" se limitan con un cupo por DÍA DE SEMANA (mar/mié/jue más, lun/vie
// menos, y un día opcional siempre cerrado), y se restan los ocupados del
// Google Calendar (freebusy). Puro (sin I/O).

export const REUNIONES_CONFIG = {
  tz: 'America/Santiago',
  ventanas: [
    ['10:00', '13:00'],
    ['15:00', '18:00'],
  ] as [string, string][],
  duracionMin: 30,
  bufferMin: 15,
  anticipacionHoras: 24,
  horizonteDias: 14, // 2 semanas
  // Cupos [min,max] por día de semana (0=dom … 6=sáb). Ausente = cerrado.
  cuposPorDow: {
    1: [1, 2], // lunes
    2: [4, 5], // martes
    3: [4, 5], // miércoles
    4: [4, 5], // jueves
    5: [1, 2], // viernes
  } as Record<number, [number, number]>,
  // Días de semana SIEMPRE cerrados (además de sáb/dom). Ej. [1] cierra los lunes.
  diasCerrados: [] as number[],
  // Cierra (cupo 0) el PRIMER día del rango cuyo día de semana esté acá — para que
  // siempre haya un día "bajo" en cero (sensación de escasez). [1,5] = lun o vie,
  // el que caiga primero.
  cerrarPrimerDow: [1, 5] as number[],
}

export interface SlotEstado { inicio: Date; fin: Date; disponible: boolean }
export interface DiaDisponibilidad { key: string; slots: SlotEstado[] }

function offsetMinutos(tz: string, instante: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(dtf.formatToParts(instante).map((x) => [x.type, x.value]))
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? '0' : p.hour), +p.minute, +p.second)
  return (asUTC - instante.getTime()) / 60000
}
function paredTzAUTC(tz: string, y: number, m: number, d: number, hh: number, mm: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm))
  return new Date(guess.getTime() - offsetMinutos(tz, guess) * 60000)
}
function fechaEnTz(tz: string, instante: Date): { y: number; m: number; d: number; dow: number; key: string } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  })
  const p = Object.fromEntries(dtf.formatToParts(instante).map((x) => [x.type, x.value]))
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { y: +p.year, m: +p.month, d: +p.day, dow: dowMap[p.weekday] ?? 0, key: `${p.year}-${p.month}-${p.day}` }
}
const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return { h, m } }

// Cupo determinístico dentro de [min,max] a partir de la fecha (estable en el día).
function cupoDelDia(rango: [number, number], key: string): number {
  const [mn, mx] = rango
  if (mx <= mn) return mn
  let h = 2166136261
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return mn + (h % (mx - mn + 1))
}
// Elige `n` índices repartidos parejo de una lista.
function repartirIdx(total: number, n: number): Set<number> {
  const s = new Set<number>()
  if (n <= 0 || total === 0) return s
  if (n >= total) { for (let i = 0; i < total; i++) s.add(i); return s }
  for (let i = 0; i < n; i++) s.add(Math.round((i * (total - 1)) / (n - 1)))
  return s
}

export function generarDias(ahora: Date, ocupados: { start: string; end: string }[], cfg = REUNIONES_CONFIG): DiaDisponibilidad[] {
  const busy = ocupados.map((b) => ({ ini: new Date(b.start).getTime(), fin: new Date(b.end).getTime() }))
  const bufferMs = cfg.bufferMin * 60000
  const durMs = cfg.duracionMin * 60000
  const pasoMs = (cfg.duracionMin + cfg.bufferMin) * 60000
  const minInicio = ahora.getTime() + cfg.anticipacionHoras * 3600000
  const maxInicio = ahora.getTime() + cfg.horizonteDias * 86400000
  const libreCal = (ini: number, fin: number) => !busy.some((b) => ini - bufferMs < b.fin && fin + bufferMs > b.ini)

  const dias: DiaDisponibilidad[] = []
  let cerroPrimero = false
  for (let off = 0; off <= cfg.horizonteDias; off++) {
    const ref = new Date(ahora.getTime() + off * 86400000)
    const { y, m, d, dow, key } = fechaEnTz(cfg.tz, ref)
    const esHabil = cfg.cuposPorDow[dow] !== undefined || cfg.diasCerrados.includes(dow)
    if (!esHabil) continue // sáb/dom → no se muestra
    // Cierra el PRIMER día hábil cuyo dow esté en cerrarPrimerDow (lun/vie).
    let forzarCero = false
    if (!cerroPrimero && (cfg.cerrarPrimerDow ?? []).includes(dow)) { forzarCero = true; cerroPrimero = true }
    const cerrado = cfg.diasCerrados.includes(dow) || forzarCero
    const rango = cerrado ? undefined : cfg.cuposPorDow[dow]

    // Grilla completa de candidatos del día (para mostrar bloqueados).
    const candidatos: { inicio: number; fin: number; elegible: boolean }[] = []
    for (const [desde, hasta] of cfg.ventanas) {
      const a = hm(desde), b = hm(hasta)
      const vIni = paredTzAUTC(cfg.tz, y, m, d, a.h, a.m).getTime()
      const vFin = paredTzAUTC(cfg.tz, y, m, d, b.h, b.m).getTime()
      for (let t = vIni; t + durMs <= vFin; t += pasoMs) {
        const elegible = t >= minInicio && t <= maxInicio && libreCal(t, t + durMs)
        candidatos.push({ inicio: t, fin: t + durMs, elegible })
      }
    }
    // De los elegibles, abrir solo `cupo` (repartidos).
    const elegiblesIdx = candidatos.map((c, i) => (c.elegible ? i : -1)).filter((i) => i >= 0)
    const cupo = rango ? Math.min(cupoDelDia(rango, key), elegiblesIdx.length) : 0
    const abiertosLocal = repartirIdx(elegiblesIdx.length, cupo)
    const abiertos = new Set([...abiertosLocal].map((k) => elegiblesIdx[k]))

    dias.push({
      key,
      slots: candidatos.map((c, i) => ({ inicio: new Date(c.inicio), fin: new Date(c.fin), disponible: abiertos.has(i) })),
    })
  }
  return dias
}

// ¿El slot que pide el visitante está realmente ABIERTO ahora? (re-validación backend)
export function slotDisponible(inicioISO: string, ahora: Date, ocupados: { start: string; end: string }[]): SlotEstado | null {
  const t = new Date(inicioISO).getTime()
  if (Number.isNaN(t)) return null
  for (const dia of generarDias(ahora, ocupados)) {
    const s = dia.slots.find((x) => x.inicio.getTime() === t)
    if (s) return s.disponible ? s : null
  }
  return null
}
