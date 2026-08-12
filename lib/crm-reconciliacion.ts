// Vigilancia del cotejo de correos (CH-10).
//
// Toda la cadencia se apoya en el campo `respondido`, y ese campo lo llena el
// operador cotejando Gmail contra la bitácora. Es el único punto del sistema
// donde un proceso que se detiene NO produce un error: simplemente deja de
// llegar información, y el CRM sigue operando con una premisa falsa —que nadie
// contestó— escalando a todos hasta proponer enfriar clientes que sí hablaron.
//
// Esto no arregla el cotejo: lo hace visible cuando falta.

import { diffDias } from './crm-cadencia'

/** Herramientas de agente cuya ejecución cuenta como cotejo. */
export const HERRAMIENTAS_COTEJO = ['crm-interacciones-bulk', 'crm-interaccion'] as const

/**
 * Días sin cotejar a partir de los cuales se avisa.
 *
 * La rutina corre en días hábiles, así que un lunes siempre arrastra dos días
 * de fin de semana: con un umbral menor el aviso saldría todas las semanas y se
 * volvería paisaje.
 */
export const DIAS_AVISO_COTEJO = 3

export interface EstadoCotejo {
  /** Fecha del último cotejo (YYYY-MM-DD), o null si no hay ninguno. */
  ultimo: string | null
  /** Días transcurridos; null si nunca se ha cotejado. */
  dias: number | null
  avisar: boolean
  /** Frase lista para mostrar, o null si todo está al día. */
  mensaje: string | null
}

export function evaluarCotejo(ultimo: string | null, hoy: string): EstadoCotejo {
  if (!ultimo) {
    return {
      ultimo: null,
      dias: null,
      avisar: true,
      mensaje: 'Nunca se han cotejado los correos: las respuestas no están registradas y la agenda no es confiable.',
    }
  }

  const dias = Math.max(0, diffDias(ultimo, hoy))
  if (dias < DIAS_AVISO_COTEJO) {
    return { ultimo, dias, avisar: false, mensaje: null }
  }

  return {
    ultimo,
    dias,
    avisar: true,
    // Se nombra la consecuencia, no el proceso: "hace N días sin cotejar" no le
    // dice nada a quien no construyó esto.
    mensaje: `Hace ${dias} días que no se cotejan los correos. Puede haber respuestas sin registrar — si alguien contestó, su prospecto no aparece como urgente y sigue escalando.`,
  }
}
