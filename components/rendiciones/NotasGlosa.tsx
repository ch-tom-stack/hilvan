'use client'

import { useState, useTransition } from 'react'
import { getNotasGlosa, crearNotaGlosa } from '@/app/actions/rendiciones'
import { toastError } from '@/lib/toast'
import type { RendicionNotaGlosa } from '@/types'

interface Props {
  cotizacionItemId: string
}

export default function NotasGlosa({ cotizacionItemId }: Props) {
  const [notas, setNotas] = useState<RendicionNotaGlosa[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [nueva, setNueva] = useState('')
  const [isPending, startTransition] = useTransition()

  const cargar = async () => {
    if (notas !== null) return
    setCargando(true)
    try {
      const data = await getNotasGlosa(cotizacionItemId)
      setNotas(data)
    } finally {
      setCargando(false)
    }
  }

  const agregar = () => {
    if (!nueva.trim()) return
    startTransition(async () => {
      try {
        const n = await crearNotaGlosa(cotizacionItemId, nueva.trim())
        setNotas(prev => [n, ...(prev ?? [])])
        setNueva('')
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al agregar nota')
      }
    })
  }

  return (
    <div className="mt-2 border border-ch-border/50 bg-ch-surface/20 p-3">
      {notas === null && !cargando && (
        <button onClick={cargar}
          className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors tracking-wider">
          Cargar notas
        </button>
      )}
      {cargando && <p className="font-body text-[10px] text-ch-muted">Cargando...</p>}

      {notas !== null && (
        <div className="space-y-3">
          {/* Historial */}
          {notas.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {notas.map(n => (
                <div key={n.id}>
                  <p className="font-body text-xs text-ch-cream">{n.nota}</p>
                  <p className="font-body text-[9px] text-ch-muted mt-0.5">
                    {n.autor?.nombre || n.autor?.email || 'Admin'} · {new Date(n.created_at).toLocaleDateString('es-CL')}
                  </p>
                </div>
              ))}
            </div>
          )}
          {notas.length === 0 && (
            <p className="font-body text-[10px] text-ch-muted">Sin notas.</p>
          )}

          {/* Nueva nota */}
          <div className="flex gap-2 pt-1 border-t border-ch-border/30">
            <input
              value={nueva}
              onChange={e => setNueva(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agregar() } }}
              placeholder="Agregar nota..."
              className="input-ch flex-1 text-xs"
            />
            <button onClick={agregar} disabled={isPending || !nueva.trim()}
              className="font-body text-[10px] tracking-wider uppercase px-3 border border-ch-border text-ch-muted hover:text-ch-cream transition-colors disabled:opacity-40">
              +
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
