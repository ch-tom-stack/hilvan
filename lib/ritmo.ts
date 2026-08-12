// Ritmo: el rango del período, al lado del histórico.
//
// POR QUÉ EXISTE. El rango histórico sólo sube. A los seis meses deja de decir
// nada sobre cómo vas AHORA: alguien que trabajó mucho el primer trimestre y
// nada el segundo sigue viéndose igual de bien. El ritmo es la mitad que puede
// bajar, y por eso es la que informa.
//
// QUÉ CUENTA, Y POR QUÉ NO SÓLO CONTACTOS. Si midiera captación, una semana de
// rodaje daría cero y la persona estaría trabajando a full. Cuenta actividad en
// toda la app —contactos, cotizaciones, rodajes, reservas, gastos, eventos—
// porque la pregunta es "¿estuviste trabajando?", no "¿hiciste captación?".
//
// LOS NOMBRES NO JUZGAN. El más bajo es "En reposo", no "Lento": alguien puede
// venir de vacaciones, de licencia o de una semana en set. La escala describe,
// no reprocha — y va de coser a mano a coser a máquina, que es la progresión
// real de velocidad en el oficio.

/** Días hábiles de la ventana. Diez ≈ dos semanas de trabajo. */
export const DIAS_HABILES = 10

export interface Ritmo {
  titulo: string
  desde: number
  glosa: string
}

export const RITMOS: Ritmo[] = [
  { titulo: 'En reposo', desde: 0,  glosa: 'Sin movimiento en la ventana. Puede ser rodaje, vacaciones o pausa.' },
  { titulo: 'A mano',    desde: 5,  glosa: 'Puntada a puntada.' },
  { titulo: 'A ritmo',   desde: 20, glosa: 'La tela avanza parejo.' },
  { titulo: 'A máquina', desde: 50, glosa: 'A toda velocidad.' },
]

export function ritmoDe(actividad: number): { actual: Ritmo; siguiente: Ritmo | null; fraccion: number } {
  let i = 0
  for (let k = 0; k < RITMOS.length; k++) if (actividad >= RITMOS[k].desde) i = k
  const actual = RITMOS[i]
  const siguiente = RITMOS[i + 1] ?? null
  const fraccion = siguiente
    ? Math.max(0, Math.min(1, (actividad - actual.desde) / (siguiente.desde - actual.desde)))
    : 1
  return { actual, siguiente, fraccion }
}

/**
 * Retrocede `n` días hábiles desde `hoy` (YYYY-MM-DD) y devuelve la fecha
 * resultante, también plana.
 *
 * Sábados y domingos no cuentan: incluirlos haría que un lunes se comparara
 * contra una ventana con dos días muertos y otro lunes contra una sin ellos.
 * No contempla feriados — agregarlos pediría un calendario chileno mantenido a
 * mano, y el ruido que introducen es menor que el de los fines de semana.
 */
export function haceDiasHabiles(hoy: string, n: number): string {
  const d = new Date(hoy + 'T12:00:00')
  let restantes = n
  while (restantes > 0) {
    d.setDate(d.getDate() - 1)
    const dia = d.getDay()
    if (dia !== 0 && dia !== 6) restantes--
  }
  return d.toLocaleDateString('en-CA')
}

/** Cómo cambió respecto al período anterior. */
export function variacion(ahora: number, antes: number): { signo: '+' | '−' | '='; delta: number } {
  const delta = ahora - antes
  if (delta === 0) return { signo: '=', delta: 0 }
  return { signo: delta > 0 ? '+' : '−', delta: Math.abs(delta) }
}
