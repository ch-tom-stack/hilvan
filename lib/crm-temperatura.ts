// Temperatura de origen (CH-10): ¿el prospecto llegó solo, o fuimos nosotros?
//
// OJO con el nombre: la etapa `en_frio` del Kanban significa otra cosa —
// "se enfrió", un prospecto que dejó de responder. Eso es un ESTADO y cambia
// con el tiempo. La temperatura de acá es el ORIGEN y no cambia nunca: quien
// llegó por La Lectura llegó por La Lectura para siempre, avance o no avance.
//
// Por eso es un eje aparte de la etapa y no una columna del Kanban: si fuera
// columna, un prospecto frío que llega a Conversación tendría que abandonarla
// y perderíamos justo el dato.
//
// Se DERIVA de `origen` — no hay campo nuevo que mantener ni que poblar.

export type Temperatura = 'frio' | 'entrante' | 'sin_clasificar'

/**
 * Orígenes donde el prospecto levantó la mano: llenó La Lectura, escribió por
 * el sitio, se acercó en una feria, o alguien lo refirió. En todos hay un
 * gesto previo de su parte.
 */
const ORIGENES_ENTRANTES = new Set(['lectura', 'web', 'feria', 'referido'])

/**
 * Orígenes donde golpeamos nosotros primero, sin gesto previo. `otro` cae acá
 * porque en la práctica se usó como cajón de correo frío (Total Tools,
 * Ellesse, Monster, Froens — los cuatro fueron correo directo).
 */
const ORIGENES_FRIOS = new Set(['correo', 'linkedin', 'instagram', 'otro'])

export function temperaturaDe(origen?: string | null): Temperatura {
  const o = (origen ?? '').trim().toLowerCase()
  if (!o) return 'sin_clasificar'
  if (ORIGENES_ENTRANTES.has(o)) return 'entrante'
  if (ORIGENES_FRIOS.has(o)) return 'frio'
  // Un origen que no conocemos no se asume frío: se marca para que alguien lo
  // mire. Inventarle temperatura es peor que declarar la ignorancia.
  return 'sin_clasificar'
}

export const TEMPERATURA_LABELS: Record<Temperatura, string> = {
  frio:           'Frío',
  entrante:       'Entrante',
  sin_clasificar: 'Sin clasificar',
}

/** Qué fue lo que pasó, en una línea, para el tooltip de la tarjeta. */
export const TEMPERATURA_GLOSA: Record<Temperatura, string> = {
  frio:           'Golpeamos nosotros primero — no hubo gesto previo de su parte',
  entrante:       'Llegaron solos: La Lectura, el sitio, una feria o un referido',
  sin_clasificar: 'Sin origen registrado — hay que completarlo en la ficha',
}

/**
 * Borde izquierdo de la tarjeta. Verde = levantaron la mano; el frío queda en
 * un tono apagado y neutro porque no es una alerta, es sólo otra cosa.
 *
 * El `hover:` repetido no sobra: la tarjeta lleva `hover:border-ch-muted`, que
 * pinta los cuatro lados y se comería este borde justo cuando el cursor está
 * encima — es decir, cuando lo estás mirando.
 */
export const TEMPERATURA_BORDE: Record<Temperatura, string> = {
  frio:           'border-l-ch-subtle hover:border-l-ch-subtle',
  entrante:       'border-l-ch-green hover:border-l-ch-green',
  sin_clasificar: 'border-l-ch-gold hover:border-l-ch-gold',
}

export const TEMPERATURA_TEXTO: Record<Temperatura, string> = {
  frio:           'text-ch-subtle',
  entrante:       'text-ch-green',
  sin_clasificar: 'text-ch-gold',
}

export const TEMPERATURAS: Temperatura[] = ['frio', 'entrante', 'sin_clasificar']
