'use client'

import { useCallback, useRef } from 'react'
import { animar } from '@/lib/animar'

/**
 * Marca el elemento que la persona acaba de modificar.
 *
 * CUÁNDO USARLO. Cuando una acción CAMBIA algo que ya está en pantalla —un
 * toggle, un campo editado en línea, un total que se recalcula— y no hay nada
 * que cargar. Ahí el esqueleto sobra (no falta contenido) y el toast mira al
 * lado equivocado (la esquina, no la cosa). Lo que confirma un cambio es el
 * objeto cambiado.
 *
 * Usa `animar()`, que limpia la clase al terminar: por eso se puede disparar
 * dos veces seguidas sobre el mismo elemento sin que la segunda se pierda —
 * que es exactamente lo que pasa cuando alguien prende y apaga un toggle.
 *
 *     const { ref, marcar } = useCambiado<HTMLButtonElement>()
 *     <button ref={ref} onClick={() => { marcar(); guardar() }}>
 */
export function useCambiado<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const marcar = useCallback(() => animar(ref.current, 'ch-cambiado'), [])
  return { ref, marcar }
}
