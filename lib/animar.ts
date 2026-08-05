// Helpers de animación. Aplican una clase de `globals.css` y la limpian al
// terminar, para que se pueda volver a disparar. Respetan la preferencia de
// movimiento reducido del sistema.
//
// Las clases están definidas en `app/globals.css` (sección "Vocabulario de
// movimiento"). Ver `docs/gamificacion/animaciones.md` para el catálogo.

import { movimientoReducido } from './preferencias'

export type Animacion =
  | 'ch-fade-up'
  | 'ch-pulse'
  | 'ch-shake'
  | 'ch-flash-row'
  | 'ch-settle'
  | 'ch-badge-pop'
  | 'ch-glow-hito'

/** Dispara una animación sobre un elemento. No-op si el elemento no existe. */
export function animar(el: Element | null | undefined, anim: Animacion): void {
  if (!el || movimientoReducido()) return
  el.classList.remove(anim)
  // Fuerza un reflow para poder re-disparar la misma animación consecutivamente.
  void (el as HTMLElement).offsetWidth
  el.classList.add(anim)
  el.addEventListener('animationend', () => el.classList.remove(anim), { once: true })
}

/**
 * Encaje: dos elementos se acercan y calzan, con el borde encendiéndose al
 * momento del contacto. Para conciliar un movimiento con su gasto — la tarea
 * más tediosa de la app, la que más merece un acuse de recibo.
 */
export function encajar(arriba: HTMLElement | null, abajo: HTMLElement | null): void {
  if (!arriba || !abajo) return
  if (movimientoReducido()) {
    ;[arriba, abajo].forEach(el => animar(el, 'ch-flash-row'))
    return
  }
  const ida = 'transform .35s cubic-bezier(0.16, 1, 0.3, 1), border-color .3s'
  for (const [el, dy] of [[arriba, 5], [abajo, -5]] as const) {
    el.style.transition = ida
    el.style.transform = `translateY(${dy}px)`
  }
  // Al contacto: ambos bordes se encienden y vuelven.
  window.setTimeout(() => {
    ;[arriba, abajo].forEach(el => { el.style.borderColor = '#7a9e7e' })
  }, 340)
  window.setTimeout(() => {
    ;[arriba, abajo].forEach(el => {
      el.style.borderColor = ''
      el.style.transform = ''
    })
  }, 1100)
}

/**
 * Cuenta un número desde su valor actual hasta `hasta`, escribiendo el
 * resultado con `formato`. Devuelve una función para cancelar.
 */
export function contar(
  el: HTMLElement | null,
  hasta: number,
  formato: (n: number) => string,
  ms = 600,
): () => void {
  if (!el) return () => {}
  if (movimientoReducido()) { el.textContent = formato(hasta); return () => {} }

  const desde = 0
  const t0 = performance.now()
  let vivo = true

  const paso = (t: number) => {
    if (!vivo) return
    const p = Math.min(1, (t - t0) / ms)
    const suave = 1 - Math.pow(1 - p, 3)
    el.textContent = formato(desde + (hasta - desde) * suave)
    if (p < 1) requestAnimationFrame(paso)
    else el.textContent = formato(hasta)
  }
  requestAnimationFrame(paso)
  return () => { vivo = false }
}
