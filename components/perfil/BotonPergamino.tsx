'use client'

import { useState } from 'react'
import { descargarPergamino } from '@/lib/pergamino-imagen'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'

/**
 * Bajarse el pergamino de una medalla ganada.
 *
 * Todos los símbolos del sistema viven dentro de Hilván: si no abres la app, no
 * existen. Uno que se puede sacar —imprimir, mandar, poner de foto— pesa
 * distinto, porque sobrevive fuera del lugar que lo otorgó.
 *
 * Aparece sólo al pasar el mouse por encima de la medalla. Un botón permanente
 * en cada una de las 38 convertiría la vitrina en una lista de descargas.
 */
export default function BotonPergamino({
  clave, titulo, rareza, criterio, persona, fecha,
}: {
  clave: string
  titulo: string
  rareza: string
  criterio: string
  persona: string
  fecha: string
}) {
  const [bajando, setBajando] = useState(false)

  async function bajar(e: React.MouseEvent) {
    e.stopPropagation()
    setBajando(true)
    try {
      await descargarPergamino({ clave, titulo, rareza, criterio, persona, fecha })
      momento('toggle.on')
    } catch {
      toastError('No se pudo generar la imagen')
    } finally {
      setBajando(false)
    }
  }

  return (
    <button
      onClick={bajar}
      disabled={bajando}
      title="Bajar el pergamino"
      className="ch-press font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-40 shrink-0"
    >
      {bajando ? '…' : 'Pergamino'}
    </button>
  )
}
