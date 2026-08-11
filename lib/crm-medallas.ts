// Medallas del CRM. Lógica PURA: la usan la acción con sesión y los tests.
//
// Dos reglas de diseño, y las dos vienen de problemas reales:
//
// 1. NINGUNA medalla compara personas. En un equipo de cuatro que se ve entre
//    sí, comparar mide quién recibió más prospectos — el reparto, no el
//    trabajo. Es la regla de docs/crm/operador-contexto.md §6.
//
// 2. El criterio de CADA medalla se muestra antes de ganarla. Una medalla que
//    aparece por algo que no sabías que estabas haciendo se siente arbitraria;
//    la gracia está en verla venir.

export interface DefinicionMedalla {
  clave: string
  titulo: string
  /** Qué hay que hacer. Se muestra ANTES de ganarla, no después. */
  criterio: string
  /** Por qué vale la pena. Vacío si es evidente. */
  nota?: string
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

export const MEDALLAS: DefinicionMedalla[] = [
  {
    clave: 'primer_contacto',
    titulo: 'El primero',
    criterio: 'Registrar tu primer contacto.',
  },
  {
    clave: 'diez_contactos',
    titulo: 'Diez',
    criterio: 'Registrar 10 contactos.',
  },
  {
    clave: 'cien_contactos',
    titulo: 'Cien',
    criterio: 'Registrar 100 contactos.',
    nota: 'La constancia es la parte difícil, no el arranque.',
  },
  {
    clave: 'diez_marcas',
    titulo: 'Diez puertas',
    criterio: 'Tocar 10 marcas distintas.',
    nota: 'Distinto a diez contactos: acá cuentan las marcas, no los toques.',
  },
  {
    clave: 'veinte_dias',
    titulo: 'Veinte días',
    criterio: 'Registrar algo en 20 días distintos.',
    nota: 'No tienen que ser seguidos. Faltar no rompe nada.',
  },
  {
    clave: 'primera_respuesta',
    titulo: 'Contestaron',
    criterio: 'Que una marca responda a un contacto tuyo.',
  },
  {
    clave: 'perseverancia',
    titulo: 'Perseverancia',
    criterio: 'Llevar una marca hasta el contacto 16.',
    nota: 'El tope del mapa de calor de la tarjeta.',
  },
  {
    clave: 'primer_cierre',
    titulo: 'Cerrado',
    criterio: 'Que un prospecto tuyo llegue a Confirmado.',
  },
  {
    clave: 'frio_a_cierre',
    titulo: 'De la nada',
    criterio: 'Cerrar un prospecto que había nacido en frío.',
    nota: 'El más difícil: nadie había levantado la mano.',
  },
]

/** Claves que la persona YA cumple, se hayan registrado o no. */
export function medallasCumplidas(d: DatosMedallas): string[] {
  const ganadas: string[] = []
  const si = (cond: boolean, clave: string) => { if (cond) ganadas.push(clave) }

  si(d.contactos >= 1, 'primer_contacto')
  si(d.contactos >= 10, 'diez_contactos')
  si(d.contactos >= 100, 'cien_contactos')
  si(d.marcasTocadas >= 10, 'diez_marcas')
  si(d.diasActivos >= 20, 'veinte_dias')
  si(d.tuvoRespuesta, 'primera_respuesta')
  si(d.maxToquesEnUnaMarca >= 16, 'perseverancia')
  si(d.cierres >= 1, 'primer_cierre')
  si(d.cierresFrios >= 1, 'frio_a_cierre')

  return ganadas
}

/**
 * Cuánto falta para una medalla que aún no se tiene, entre 0 y 1.
 * Devuelve null en las que no son de conteo — un "60% de que te respondan" no
 * significa nada y mostrarlo sería inventar precisión.
 */
export function progresoMedalla(clave: string, d: DatosMedallas): number | null {
  const frac = (hecho: number, meta: number) => Math.max(0, Math.min(1, hecho / meta))
  switch (clave) {
    case 'primer_contacto':  return frac(d.contactos, 1)
    case 'diez_contactos':   return frac(d.contactos, 10)
    case 'cien_contactos':   return frac(d.contactos, 100)
    case 'diez_marcas':      return frac(d.marcasTocadas, 10)
    case 'veinte_dias':      return frac(d.diasActivos, 20)
    case 'perseverancia':    return frac(d.maxToquesEnUnaMarca, 16)
    default:                 return null
  }
}
