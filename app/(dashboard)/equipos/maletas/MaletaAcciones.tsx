'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { eliminarMaleta, convertirMaletaABundle } from '@/app/actions/maletas'

interface Props {
  maletaId: string
  maletaNombre: string
}

export default function MaletaAcciones({ maletaId, maletaNombre }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [bundleCreado, setBundleCreado] = useState<{ id: string; codigo: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleEliminar = () => {
    if (!confirm(`¿Eliminar la maleta "${maletaNombre}"? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      const res = await eliminarMaleta(maletaId)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  const handleConvertir = () => {
    if (!confirm(`¿Convertir "${maletaNombre}" en bundle? Se creará un bundle con los mismos ítems. La maleta no se elimina.`)) return
    setError(null)
    startTransition(async () => {
      const res = await convertirMaletaABundle(maletaId)
      if (res.error) setError(res.error)
      else if (res.bundleId) setBundleCreado({ id: res.bundleId, codigo: res.bundleCodigo! })
    })
  }

  if (bundleCreado) {
    return (
      <div className="mt-3 bg-ch-green/10 border border-ch-green/30 px-3 py-2 text-center space-y-1">
        <p className="font-body text-[10px] text-ch-green">✓ Bundle creado</p>
        <a
          href="/equipos/bundles"
          className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream transition-colors"
        >
          Ver bundles →
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-2 mt-2">
      {error && (
        <p className="font-body text-[10px] text-ch-gold text-center">{error}</p>
      )}
      <button
        onClick={handleConvertir}
        disabled={pending}
        className="w-full border border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-muted font-body text-[9px] tracking-widest uppercase py-2 transition-colors disabled:opacity-40"
      >
        → Convertir a bundle
      </button>
      <button
        onClick={handleEliminar}
        disabled={pending}
        className="w-full border border-ch-border text-ch-subtle hover:text-red-400 hover:border-red-400/40 font-body text-[9px] tracking-widest uppercase py-2 transition-colors disabled:opacity-40"
      >
        Eliminar
      </button>
    </div>
  )
}
