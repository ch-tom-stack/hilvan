'use client'

import { useState, useTransition } from 'react'
import { toggleRentable } from '@/app/actions/equipos'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'

interface Props {
  id: string
  rentable: boolean
}

export default function ToggleRentable({ id, rentable: initialRentable }: Props) {
  const [activo, setActivo] = useState(initialRentable)
  const [pending, startTransition] = useTransition()

  function handleToggle() {
    const nuevo = !activo
    setActivo(nuevo) // optimistic
    // Dentro del gesto: es micro-feedback local, esperar al servidor lo
    // desacopla del click y se siente roto.
    momento(nuevo ? 'toggle.on' : 'toggle.off')
    startTransition(async () => {
      const res = await toggleRentable(id, nuevo)
      if (res?.error) {
        setActivo(!nuevo) // revert
        toastError('No se pudo actualizar')
        momento('error', { mensaje: 'No se pudo actualizar' })
      }
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      title={activo ? 'Quitar del rental' : 'Agregar al rental'}
      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
        activo
          ? 'border-ch-green bg-ch-green/20'
          : 'border-ch-border bg-transparent'
      }`}
    >
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full transition-transform duration-200 ${
          activo
            ? 'translate-x-3.5 bg-ch-green'
            : 'translate-x-0.5 bg-ch-subtle'
        }`}
      />
    </button>
  )
}
