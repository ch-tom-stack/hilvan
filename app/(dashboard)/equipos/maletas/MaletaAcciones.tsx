'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { eliminarMaleta, convertirMaletaABundle } from '@/app/actions/maletas'
import { momento } from '@/lib/momentos'

interface Props {
  maletaId: string
  maletaNombre: string
}

type Confirmando = 'eliminar' | 'convertir' | null

export default function MaletaAcciones({ maletaId, maletaNombre }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmando, setConfirmando] = useState<Confirmando>(null)
  const [bundleCreado, setBundleCreado] = useState<{ id: string; codigo: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleEliminar = () => {
    setError(null)
    startTransition(async () => {
      const res = await eliminarMaleta(maletaId)
      if (res.error) { setError(res.error); setConfirmando(null); momento('error', { mensaje: res.error }) }
      else { momento('equipo.eliminado', { mensaje: 'Maleta eliminada' }); router.refresh() }
    })
  }

  const handleConvertir = () => {
    setError(null)
    startTransition(async () => {
      const res = await convertirMaletaABundle(maletaId)
      if (res.error) { setError(res.error); setConfirmando(null); momento('error', { mensaje: res.error }) }
      else if (res.bundleId) {
        momento('maleta.convertida')
        setBundleCreado({ id: res.bundleId, codigo: res.bundleCodigo! })
      }
    })
  }

  if (bundleCreado) {
    return (
      <div className="mt-3 bg-ch-green/10 border border-ch-green/30 px-3 py-2 text-center space-y-1">
        <p className="font-body text-[10px] text-ch-green">✓ Bundle creado</p>
        <Link
          href="/equipos/bundles"
          className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream transition-colors"
        >
          Ver bundles →
        </Link>
      </div>
    )
  }

  // Estado de confirmación inline
  if (confirmando === 'eliminar') {
    return (
      <div className="mt-2 border border-red-400/30 p-3 space-y-2">
        <p className="font-body text-[10px] text-ch-cream text-center">¿Eliminar &quot;{maletaNombre}&quot;?</p>
        <p className="font-body text-[9px] text-ch-subtle text-center">Esta acción no se puede deshacer</p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmando(null)}
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

  if (confirmando === 'convertir') {
    return (
      <div className="mt-2 border border-ch-green/30 p-3 space-y-2">
        <p className="font-body text-[10px] text-ch-cream text-center">¿Convertir a bundle?</p>
        <p className="font-body text-[9px] text-ch-subtle text-center">Se copian los ítems. La maleta no se elimina.</p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmando(null)}
            disabled={pending}
            className="flex-1 border border-ch-border text-ch-muted font-body text-[9px] tracking-widest uppercase py-2 transition-colors hover:text-ch-cream ch-press"
          >
            Cancelar
          </button>
          <button
            onClick={handleConvertir}
            disabled={pending}
            className="flex-1 border border-ch-green/50 text-ch-green font-body text-[9px] tracking-widest uppercase py-2 transition-colors hover:bg-ch-green/10 disabled:opacity-40 ch-press"
          >
            {pending ? 'Creando…' : 'Confirmar'}
          </button>
        </div>
        {error && <p className="font-body text-[10px] text-ch-gold text-center">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2 mt-2">
      {error && <p className="font-body text-[10px] text-ch-gold text-center">{error}</p>}
      <button
        onClick={() => setConfirmando('convertir')}
        className="w-full border border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-muted font-body text-[9px] tracking-widest uppercase py-2 transition-colors ch-press"
      >
        → Convertir a bundle
      </button>
      <button
        onClick={() => setConfirmando('eliminar')}
        className="w-full border border-ch-border text-ch-subtle hover:text-red-400 hover:border-red-400/40 font-body text-[9px] tracking-widest uppercase py-2 transition-colors ch-press"
      >
        Eliminar
      </button>
    </div>
  )
}
