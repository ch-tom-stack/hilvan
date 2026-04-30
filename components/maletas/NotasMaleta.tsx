'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { agregarNota } from '@/app/actions/maletas'
import type { MaletaNota } from '@/types'

interface Props {
  maletaId: string
  notas: MaletaNota[]
  usuarioLogueado: boolean
  nombreUsuario: string
}

export default function NotasMaleta({ maletaId, notas, usuarioLogueado, nombreUsuario }: Props) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)

  function formatFecha(iso: string) {
    return new Date(iso).toLocaleDateString('es-CL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  async function handleEnviar() {
    if (!texto.trim()) return
    setGuardando(true)
    await agregarNota(maletaId, texto.trim(), nombreUsuario)
    setTexto('')
    setGuardando(false)
    router.refresh()
  }

  return (
    <div>
      {notas.length === 0 ? (
        <p className="text-ch-muted font-body text-sm italic mb-4">Sin notas aún.</p>
      ) : (
        <div className="space-y-3 mb-5">
          {notas.map(nota => (
            <div key={nota.id} className="border border-ch-border bg-ch-surface/30 px-4 py-3">
              <p className="font-body text-sm text-ch-cream leading-relaxed">{nota.contenido}</p>
              <p className="font-body text-[10px] text-ch-muted mt-2">
                {nota.autor_nombre || 'Anónimo'} · {formatFecha(nota.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}

      {usuarioLogueado ? (
        <div>
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder='Ej: "Batería NP-3 mala"'
            rows={3}
            className="w-full bg-ch-surface border border-ch-border text-ch-cream font-body px-4 py-3 text-sm placeholder:text-ch-border focus:outline-none focus:border-ch-green transition-colors resize-none mb-3"
          />
          <button
            onClick={handleEnviar}
            disabled={guardando || !texto.trim()}
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Dejar nota'}
          </button>
        </div>
      ) : (
        <p className="text-ch-muted font-body text-xs italic">
          Inicia sesión en Hilván para dejar notas.
        </p>
      )}
    </div>
  )
}
