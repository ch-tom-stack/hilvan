// Medallas del CRM.
//
// LA NARRATIVA. La app se llama Hilván: la puntada provisional que sostiene la
// tela antes de la costura definitiva. Captar es exactamente eso — puntadas que
// puede que se suelten, y algunas se vuelven costura. La metáfora no se le
// impuso al módulo: es lo que el módulo hace.
//
// De ahí salen los tres capítulos, que son el arco real de un prospecto:
//   I  · Hilvanar   — dar la primera puntada. Sólo pide aparecer.
//   II · Sostener   — que la puntada aguante. Es la parte que cuesta.
//   III· Que quede  — cuando el hilván se vuelve costura.
//
// DOS REGLAS, las dos de problemas reales:
//
// 1. NINGUNA compara personas. En un equipo de cuatro que se ve entre sí,
//    comparar mide quién recibió más prospectos — el reparto, no el trabajo.
//    Es la regla de docs/crm/operador-contexto.md §6.
//
// 2. El criterio de cada una se ve ANTES de ganarla. Una medalla que aparece
//    por algo que no sabías que hacías se siente arbitraria; la gracia está en
//    verla venir.

export type Capitulo = 'hilvanar' | 'sostener' | 'quede'

/** Qué tan difícil es. Decide el peso visual: sin esto las nueve se ven igual. */
export type Rareza = 'comun' | 'dificil' | 'rara'

export interface DefinicionMedalla {
  clave: string
  titulo: string
  capitulo: Capitulo
  rareza: Rareza
  /** Qué hay que hacer. Se muestra ANTES de ganarla, no después. */
  criterio: string
  /** Por qué vale. Sólo cuando no es evidente. */
  nota?: string
}

export const CAPITULOS: { clave: Capitulo; numero: string; titulo: string; bajada: string }[] = [
  {
    clave: 'hilvanar',
    numero: 'I',
    titulo: 'Hilvanar',
    bajada: 'La primera puntada. Sólo pide aparecer.',
  },
  {
    clave: 'sostener',
    numero: 'II',
    titulo: 'Sostener',
    bajada: 'Que la puntada aguante. Es la parte que cuesta, y la que nadie ve.',
  },
  {
    clave: 'quede',
    numero: 'III',
    titulo: 'Que quede',
    bajada: 'Cuando el hilván se vuelve costura.',
  },
]

export const MEDALLAS: DefinicionMedalla[] = [
  // ── I · Hilvanar ──────────────────────────────────────────────────────────
  {
    clave: 'primer_contacto',
    titulo: 'La primera puntada',
    capitulo: 'hilvanar',
    rareza: 'comun',
    criterio: 'Registrar tu primer contacto.',
  },
  {
    clave: 'diez_marcas',
    titulo: 'Diez telas',
    capitulo: 'hilvanar',
    rareza: 'comun',
    criterio: 'Tocar 10 marcas distintas.',
    nota: 'Cuentan las marcas, no los toques: diez contactos a una sola marca no es esto.',
  },

  // ── II · Sostener ─────────────────────────────────────────────────────────
  {
    clave: 'diez_contactos',
    titulo: 'Mano firme',
    capitulo: 'sostener',
    rareza: 'comun',
    criterio: 'Registrar 10 contactos.',
  },
  {
    clave: 'veinte_dias',
    titulo: 'Veinte jornadas',
    capitulo: 'sostener',
    rareza: 'dificil',
    criterio: 'Registrar algo en 20 días distintos.',
    nota: 'No tienen que ser seguidos. Faltar no rompe nada.',
  },
  {
    clave: 'perseverancia',
    titulo: 'No soltar',
    capitulo: 'sostener',
    rareza: 'dificil',
    criterio: 'Llevar una marca hasta el contacto 16.',
    nota: 'El tope del mapa de calor de la tarjeta.',
  },
  {
    clave: 'cien_contactos',
    titulo: 'Cien puntadas',
    capitulo: 'sostener',
    rareza: 'rara',
    criterio: 'Registrar 100 contactos.',
    nota: 'La constancia es la parte difícil, no el arranque.',
  },

  // ── III · Que quede ───────────────────────────────────────────────────────
  {
    clave: 'primera_respuesta',
    titulo: 'Del otro lado',
    capitulo: 'quede',
    rareza: 'comun',
    criterio: 'Que una marca responda a un contacto tuyo.',
  },
  {
    clave: 'primer_cierre',
    titulo: 'Costura firme',
    capitulo: 'quede',
    rareza: 'rara',
    criterio: 'Que un prospecto tuyo llegue a Confirmado.',
  },
  {
    clave: 'frio_a_cierre',
    titulo: 'De la nada',
    capitulo: 'quede',
    rareza: 'rara',
    criterio: 'Cerrar un prospecto que había nacido en frío.',
    nota: 'Lo más difícil del módulo: nadie había levantado la mano.',
  },
]

export const RAREZA_LABEL: Record<Rareza, string> = {
  comun:   '',            // lo común no se anuncia
  dificil: 'Difícil',
  rara:    'Rara',
}

/**
 * Los datos con los que se evalúa todo. Se arman una vez por persona en la
 * acción; acá no hay acceso a base.
 */
export interface DatosMedallas {
  /** Contactos que registró ESTA persona (crm_interacciones.registrado_por). */
  contactos: number
  /** Días distintos en que registró algo. No es una racha: no castiga faltar. */
  diasActivos: number
  /** Marcas distintas que tocó. 12 toques a una marca no es tocar 12 marcas. */
  marcasTocadas: number
  /** Alguno de sus contactos tuvo respuesta. */
  tuvoRespuesta: boolean
  /** Prospectos a su cargo que llegaron a confirmado. */
  cierres: number
  /** De esos cierres, cuántos habían nacido en frío. */
  cierresFrios: number
  /** El contador más alto que alcanzó una marca suya. */
  maxToquesEnUnaMarca: number
}

/** Claves que la persona YA cumple, se hayan registrado o no. */
export function medallasCumplidas(d: DatosMedallas): string[] {
  const ganadas: string[] = []
  const si = (cond: boolean, clave: string) => { if (cond) ganadas.push(clave) }

  si(d.contactos >= 1, 'primer_contacto')
  si(d.marcasTocadas >= 10, 'diez_marcas')
  si(d.contactos >= 10, 'diez_contactos')
  si(d.diasActivos >= 20, 'veinte_dias')
  si(d.maxToquesEnUnaMarca >= 16, 'perseverancia')
  si(d.contactos >= 100, 'cien_contactos')
  si(d.tuvoRespuesta, 'primera_respuesta')
  si(d.cierres >= 1, 'primer_cierre')
  si(d.cierresFrios >= 1, 'frio_a_cierre')

  return ganadas
}

/**
 * Progreso hacia una medalla no ganada, entre 0 y 1, más el texto de avance.
 * Devuelve null en las que no son de conteo — un "60% de que te respondan" no
 * significa nada, y fingir precisión es peor que no mostrar.
 */
export function progresoMedalla(
  clave: string,
  d: DatosMedallas,
): { fraccion: number; texto: string } | null {
  const p = (hecho: number, meta: number, unidad: string) => ({
    fraccion: Math.max(0, Math.min(1, hecho / meta)),
    texto: `${Math.min(hecho, meta)} de ${meta} ${unidad}`,
  })
  switch (clave) {
    case 'primer_contacto': return p(d.contactos, 1, 'contactos')
    case 'diez_marcas':     return p(d.marcasTocadas, 10, 'marcas')
    case 'diez_contactos':  return p(d.contactos, 10, 'contactos')
    case 'veinte_dias':     return p(d.diasActivos, 20, 'días')
    case 'perseverancia':   return p(d.maxToquesEnUnaMarca, 16, 'contactos')
    case 'cien_contactos':  return p(d.contactos, 100, 'contactos')
    default:                return null
  }
}

/** Cuántas medallas tiene cada capítulo. Para el encabezado de la vitrina. */
export function porCapitulo(capitulo: Capitulo): DefinicionMedalla[] {
  return MEDALLAS.filter(m => m.capitulo === capitulo)
}
