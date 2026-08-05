'use client'

import { useEffect } from 'react'
import { desbloquearAudio } from '@/lib/sfx'
import { rastrearPuntero } from '@/lib/celebrate'

/**
 * Los navegadores no permiten reproducir audio hasta que hay un gesto del
 * usuario. Este componente engancha el primer click/tecla de la sesión para
 * abrir el AudioContext y precargar los sonidos más frecuentes, de modo que el
 * primer sonido real no llegue tarde.
 *
 * No renderiza nada. Va montado una sola vez en el layout raíz.
 */
export default function AudioBootstrap() {
  useEffect(() => {
    desbloquearAudio()
    // Guarda dónde tocó el usuario para anclar ahí la micro-celebración.
    rastrearPuntero()
  }, [])
  return null
}
