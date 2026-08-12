'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { eliminarEquipo } from '@/app/actions/equipos'
import { momento } from '@/lib/momentos'

interface Props {
  equipoId: string
  equipoNombre: string
}

export default function EquipoAcciones({ equipoId, equipoNombre }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEliminar = () => {
    setError(null)
    startTransition(async () => {
      const res = await eliminarEquipo(equipoId)
      if (res.error) {
        setError(res.error)
        setConfirmando(false)
        momento('error', { mensaje: res.error })
      } else {
        momento('equipo.eliminado')
        router.push('/equipos')
        router.refresh()
      }
    })
  }

  if (confirmando) {
    return (
      <div className="border border-red-400/30 p-3 space-y-2 min-w-[200px]">
        <p className="font-body text-[10px] text-ch-cream text-center">¿Eliminar &quot;{equipoNombre}&quot;?</p>
        <p className="font-body text-[9px] text-ch-subtle text-center">Esta acción no se puede deshacer</p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmando(false)}
            disabled={pending}
            className="flex-1 border border-ch-border text-ch-muted font-body text-[9px] tracking-widest uppercase py-2 transition-colors hover:text-ch-cream ch-press"
          >
            Cancelar
          </button>
          <button
            onClick={handleEliminar}
            disabled={pending}
            className="flex-1 border border-red-400/40 text-red-400 font-body text-[9px] tracking-widest uppercase py-2 transition-colors hover:bg-red-400/10 disabled:opacity-40 ch-press"
          >
            {pending ? 'Eliminando…' : 'Confirmar'}
          </button>
        </div>
        {error && <p className="font-body text-[10px] text-ch-gold text-center">{error}</p>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      className="border border-ch-border text-ch-subtle hover:text-red-400 hover:border-red-400/40 font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors ch-press"
    >
      Eliminar
    </button>
  )
}
