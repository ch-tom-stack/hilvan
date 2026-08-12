// Preferencias de feedback (sonido, celebraciones, movimiento).
//
// Vive en localStorage: son preferencias de dispositivo, no de cuenta. Si más
// adelante se quieren sincronizar entre equipos, hay que agregar una columna
// a `profiles` y una migración; el resto del código no cambia porque todos
// leen a través de este módulo.
//
// Cualquier componente puede escuchar `onPreferencias()` para reaccionar a un
// cambio hecho en otra parte de la app (p. ej. el toggle del CRM y el de
// /perfil se mantienen sincronizados).

export type Volumen = 'bajo' | 'medio' | 'alto'

export interface Preferencias {
  /** Sonidos de interfaz encendidos. */
  sonido: boolean
  /** Volumen relativo del set completo. */
  volumen: Volumen
  /** Confeti y celebraciones grandes. Independiente del sonido. */
  celebraciones: boolean
  /**
   * Mostrar medallas y rangos.
   *
   * Existe por autonomía, que es el hueco que señala la literatura de
   * autodeterminación: los badges se sienten manipuladores salvo cuando la
   * persona participa en sus propios términos. Nadie eligió tener medallas —
   * esto convierte el sistema en algo que se elige.
   */
  medallas: boolean
}

export const PREFERENCIAS_POR_DEFECTO: Preferencias = {
  sonido: true,
  medallas: true,
  volumen: 'medio',
  celebraciones: true,
}

export const FACTOR_VOLUMEN: Record<Volumen, number> = {
  bajo: 0.45,
  medio: 1,
  alto: 1.6,
}

const CLAVE = 'ch_feedback'
const CLAVE_LEGADA = 'ch_sfx' // toggle original del CRM (valor 'on' | 'off')
const EVENTO = 'ch:preferencias'

let cache: Preferencias | null = null

function leerDeStorage(): Preferencias {
  if (typeof window === 'undefined') return PREFERENCIAS_POR_DEFECTO

  const crudo = window.localStorage.getItem(CLAVE)
  if (crudo) {
    try {
      const p = JSON.parse(crudo) as Partial<Preferencias>
      return {
        sonido: typeof p.sonido === 'boolean' ? p.sonido : PREFERENCIAS_POR_DEFECTO.sonido,
        volumen: p.volumen && p.volumen in FACTOR_VOLUMEN ? p.volumen : PREFERENCIAS_POR_DEFECTO.volumen,
        celebraciones:
          typeof p.celebraciones === 'boolean' ? p.celebraciones : PREFERENCIAS_POR_DEFECTO.celebraciones,
        // Quien guardó preferencias antes de que existieran las medallas no
        // tiene la clave: cae al default (visibles), no a apagadas.
        medallas: typeof p.medallas === 'boolean' ? p.medallas : PREFERENCIAS_POR_DEFECTO.medallas,
      }
    } catch {
      // JSON corrupto: se ignora y se cae al default.
    }
  }

  // Migración del toggle original del CRM: si el usuario ya había silenciado,
  // se respeta esa decisión en el sistema nuevo.
  const legado = window.localStorage.getItem(CLAVE_LEGADA)
  if (legado === 'off') return { ...PREFERENCIAS_POR_DEFECTO, sonido: false }

  return PREFERENCIAS_POR_DEFECTO
}

export function getPreferencias(): Preferencias {
  if (!cache) cache = leerDeStorage()
  return cache
}

export function setPreferencias(parcial: Partial<Preferencias>): Preferencias {
  const siguiente = { ...getPreferencias(), ...parcial }
  cache = siguiente
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CLAVE, JSON.stringify(siguiente))
    // Se mantiene la clave legada en sincronía por si queda algún consumidor.
    window.localStorage.setItem(CLAVE_LEGADA, siguiente.sonido ? 'on' : 'off')
    window.dispatchEvent(new CustomEvent<Preferencias>(EVENTO, { detail: siguiente }))
  }
  return siguiente
}

/** Se suscribe a los cambios. Devuelve la función para desuscribirse. */
export function onPreferencias(fn: (p: Preferencias) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: Event) => fn((e as CustomEvent<Preferencias>).detail)
  window.addEventListener(EVENTO, handler)
  return () => window.removeEventListener(EVENTO, handler)
}

/**
 * El usuario pidió menos movimiento a nivel de sistema operativo.
 * Se respeta siempre, sin preguntar: es una preferencia de accesibilidad.
 */
export function movimientoReducido(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
