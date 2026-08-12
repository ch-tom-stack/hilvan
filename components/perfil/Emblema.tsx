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
  clave, nueva = false, className = '',
}: {
  clave: string
  nueva?: boolean
  className?: string
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
      strokeWidth={1.4}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path ref={ref} d={EMBLEMAS[clave] ?? EMBLEMA_DEFECTO} className={nueva ? 'ch-emblema-traza' : ''} />
    </svg>
  )
}
