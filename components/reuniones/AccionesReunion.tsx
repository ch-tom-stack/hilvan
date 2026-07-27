'use client'

import { useTransition } from 'react'
import { actualizarEstadoReunion } from '@/app/actions/reuniones'
import { toastOk, toastError } from '@/lib/toast'

export default function AccionesReunion({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()

  const accionar = (estado: 'realizada' | 'cancelada') => {
    if (estado === 'cancelada' && !confirm('¿Cancelar esta reunión? Se borra del calendario.')) return
    startTransition(async () => {
      try {
        const r = await actualizarEstadoReunion(id, estado)
        if (r.error) { toastError(r.error); return }
        toastOk(estado === 'realizada' ? 'Marcada como realizada' : 'Reunión cancelada')
      } catch (e: any) {
        toastError(e?.message || 'No se pudo actualizar')
      }
    })
  }

  return (
    <div className="flex items-center gap-3 shrink-0">
      <button
        onClick={() => accionar('realizada')} disabled={isPending}
        className="font-body text-[10px] tracking-wider uppercase text-ch-muted hover:text-ch-green transition-colors disabled:opacity-50"
      >
        Marcar realizada
      </button>
      <button
        onClick={() => accionar('cancelada')} disabled={isPending}
        className="font-body text-[10px] tracking-wider uppercase text-ch-muted hover:text-red-400 transition-colors disabled:opacity-50"
      >
        Cancelar
      </button>
    </div>
  )
}
