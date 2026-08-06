'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toastError } from '@/lib/toast'
import type { Etiqueta } from '@/types'

const PALETA = [
  '#7a9e7e', // ch-green
  '#c9a84c', // ch-gold
  '#c0392b', // rojo
  '#4a7ba6', // azul
  '#9b6b9e', // morado
  '#8c8c86', // gris
]

interface EtiquetaPickerProps {
  entidadId: string
  disponibles: Etiqueta[]
  asignadas: Etiqueta[]
  onAsignar: (entidadId: string, etiquetaId: string) => Promise<void>
  onQuitar: (entidadId: string, etiquetaId: string) => Promise<void>
  onCrear: (texto: string, color?: string) => Promise<Etiqueta>
}

// Chips de color+texto asignados a una cotización/rodaje, con un "+" que abre
// un popover para asignar de la lista existente o crear una nueva. Sets
// separados por módulo: cada página pasa sus propias 3 funciones (cotización
// vs rodaje son tablas distintas, mismo shape).
export default function EtiquetaPicker({ entidadId, disponibles, asignadas, onAsignar, onQuitar, onCrear }: EtiquetaPickerProps) {
  const [abierto, setAbierto] = useState(false)
  const [pending, setPending] = useState(false)
  const [nuevoTexto, setNuevoTexto] = useState('')
  const [nuevoColor, setNuevoColor] = useState(PALETA[0])
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const idsAsignados = new Set(asignadas.map(e => e.id))

  const toggle = async (etiquetaId: string) => {
    if (pending) return
    setPending(true)
    try {
      if (idsAsignados.has(etiquetaId)) await onQuitar(entidadId, etiquetaId)
      else await onAsignar(entidadId, etiquetaId)
      router.refresh()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error con la etiqueta')
    } finally {
      setPending(false)
    }
  }

  const crear = async () => {
    if (!nuevoTexto.trim() || pending) return
    setPending(true)
    try {
      const nueva = await onCrear(nuevoTexto.trim(), nuevoColor)
      await onAsignar(entidadId, nueva.id)
      setNuevoTexto('')
      router.refresh()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al crear la etiqueta')
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className="relative inline-flex items-center gap-1 flex-wrap"
      ref={ref}
      onClick={e => { e.preventDefault(); e.stopPropagation() }}
    >
      {asignadas.map(et => (
        <span
          key={et.id}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-body rounded-[2px] border"
          style={{ borderColor: `${et.color}66`, color: et.color, backgroundColor: `${et.color}14` }}
        >
          {et.texto}
        </span>
      ))}
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="w-4 h-4 flex items-center justify-center text-ch-border hover:text-ch-muted text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
        title="Etiquetas"
      >
        +
      </button>

      {abierto && (
        <div className="absolute z-30 top-6 left-0 w-56 bg-ch-surface border border-ch-border rounded-[2px] p-2 shadow-none">
          <div className="max-h-40 overflow-y-auto space-y-0.5 mb-2">
            {disponibles.length === 0 && (
              <p className="font-body text-[11px] text-ch-muted px-1 py-1">Sin etiquetas todavía.</p>
            )}
            {disponibles.map(et => (
              <button
                key={et.id}
                type="button"
                disabled={pending}
                onClick={() => toggle(et.id)}
                className="w-full flex items-center gap-2 px-1.5 py-1 text-left hover:bg-ch-border/20 rounded-[2px] transition-colors disabled:opacity-50"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: et.color }} />
                <span className="font-body text-xs text-ch-cream flex-1 truncate">{et.texto}</span>
                {idsAsignados.has(et.id) && <span className="text-ch-green text-xs">✓</span>}
              </button>
            ))}
          </div>
          <div className="border-t border-ch-border pt-2 space-y-1.5">
            <div className="flex items-center gap-1">
              {PALETA.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNuevoColor(c)}
                  className={`w-4 h-4 rounded-full shrink-0 ${nuevoColor === c ? 'ring-1 ring-ch-cream' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input
                value={nuevoTexto}
                onChange={e => setNuevoTexto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crear() } }}
                placeholder="Nueva etiqueta…"
                maxLength={40}
                className="flex-1 min-w-0 bg-ch-dark border border-ch-border rounded-[2px] px-2 py-1 font-body text-xs text-ch-cream focus:outline-none focus:border-ch-cream/40"
              />
              <button
                type="button"
                disabled={!nuevoTexto.trim() || pending}
                onClick={crear}
                className="shrink-0 px-2 py-1 font-body text-xs text-ch-muted hover:text-ch-cream disabled:opacity-30 transition-colors"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
