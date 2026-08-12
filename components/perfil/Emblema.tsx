'use client'

import { useEffect, useRef } from 'react'
import { EMBLEMAS, EMBLEMA_DEFECTO } from '@/lib/emblemas'

/**
 * El emblema de una medalla.
 *
 * Cuando `nueva` es true el trazo se dibuja solo, como si alguien lo estuviera
 * cosiendo. El largo real del path se mide en el momento —`getTotalLength()`—
 * porque una constante fija haría que los emblemas cortos terminen antes y los
 * largos queden a medio dibujar.
 */
export default function Emblema({
  clave, nueva = false, className = '', nivel = 0,
}: {
  clave: string
  nueva?: boolean
  className?: string
  /** Meses ganada: 0 · 1 (3+) · 2 (6+) · 3 (12+). Engrosa el trazo. */
  nivel?: 0 | 1 | 2 | 3
}) {
  const ref = useRef<SVGPathElement>(null)

  useEffect(() => {
    if (!nueva || !ref.current) return
    try {
      const largo = Math.ceil(ref.current.getTotalLength())
      ref.current.style.setProperty('--largo', String(largo))
    } catch {
      // getTotalLength puede fallar en paths degenerados: se muestra entero.
    }
  }, [nueva, clave])

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`w-6 h-6 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      /* El nivel engrosa el trazo en vez de agregar adornos: la medalla es la
         misma, sólo que hecha más veces. Un anillo o una estrella encima
         competiría con la rareza, que ya usa el dorado. */
      strokeWidth={1.4 + nivel * 0.35}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path ref={ref} d={EMBLEMAS[clave] ?? EMBLEMA_DEFECTO} className={nueva ? 'ch-emblema-traza' : ''} />
    </svg>
  )
}
