// Misiones — jornadas y vencimiento.
//
// La guía para humanos es docs/crm/reglas-misiones.md. Acá vive solo lo que el
// código necesita calcular, y la regla que más se presta a error.

export interface Mision {
  id: string
  persona_id: string
  tipo: 'diaria' | 'semanal'
  texto: string
  guia?: string | null
  fuente_verificacion?: string | null
  verificado_en?: string | null
  fecha_objetivo: string
  cumplida_en?: string | null
}

/**
 * Días libres de cada persona, por día de semana (0 = domingo, 6 = sábado).
 *
 * Se indexa por email porque es lo único estable: los nombres se editan desde
 * /perfil y los ids no se pueden leer de un vistazo. Si esto cambia, cambiarlo
 * también en `docs/crm/reglas-misiones.md` — el operador lee esa guía, no este
 * archivo, y dos fuentes que se contradicen son peores que una desactualizada.
 *
 * El fin de semana es libre para todos y no se enumera acá.
 */
export const DIAS_LIBRES: Record<string, number[]> = {
  'nataliaalejandra.r@gmail.com':        [2], // martes
  'simonpedrofernandezsilva@gmail.com':  [5], // viernes
}

/** Sábado y domingo no son días hábiles para nadie. */
function esFinDeSemana(d: Date): boolean {
  const n = d.getUTCDay()
  return n === 0 || n === 6
}

export function esDiaHabil(email: string, fecha: Date): boolean {
  if (esFinDeSemana(fecha)) return false
  return !(DIAS_LIBRES[email] ?? []).includes(fecha.getUTCDay())
}

function fechaUTC(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

function aISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * ¿Sigue viva una misión diaria?
 *
 * La regla, tal como la fijó Tomás: *"la misión diaria no existe el día libre
 * pero puede persistir la del día anterior"*. O sea vive su día, sobrevive los
 * días libres que le siguen, y muere cuando llega el próximo día hábil de esa
 * persona.
 *
 * La del lunes de Natalia sigue viva su martes libre y muere el miércoles. La
 * del jueves de Simón sobrevive su viernes libre y el fin de semana, y muere el
 * lunes.
 *
 * Se calcula, no se guarda: la jornada de alguien puede cambiar, y un estado
 * congelado quedaría mintiendo sobre misiones viejas.
 */
export function diariaVigente(email: string, fechaObjetivo: string, hoy: string): boolean {
  if (hoy < fechaObjetivo) return true       // todavía no le toca
  if (hoy === fechaObjetivo) return true

  // Murió si entre su día y hoy hubo algún día hábil de esa persona.
  const cursor = fechaUTC(fechaObjetivo)
  const fin = fechaUTC(hoy)
  cursor.setUTCDate(cursor.getUTCDate() + 1)
  while (cursor <= fin) {
    if (esDiaHabil(email, cursor)) return false
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return true
}

/** El lunes de la semana de una fecha — cómo se agrupan las semanales. */
export function lunesDeLaSemana(iso: string): string {
  const d = fechaUTC(iso)
  const n = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (n === 0 ? 6 : n - 1))
  return aISO(d)
}

/** Hoy en Santiago, como YYYY-MM-DD. */
export function hoyChile(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}
