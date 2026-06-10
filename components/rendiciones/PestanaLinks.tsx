'use client'

import { useState } from 'react'
import EstadoVacio from '@/components/ui/EstadoVacio'

export interface LinkTemporal {
  id: string
  token: string
  email: string | null
  expires_at: string
  created_at: string
  rendicion_id: string
  cotizacion_item_id: string
  colaborador_id: string | null
  cotizacion_item: { id: string; nombre: string } | null
  colaborador: { id: string; nombre: string; email: string } | null
  rendicion: {
    id: string
    cotizacion: { id: string; nombre: string; grupo: { numero_base?: string } | null } | null
  } | null
}

// ─── PESTAÑA LINKS ────────────────────────────────────────────────────────────

export default function PestanaLinks({
  links,
  onEliminar,
  onReenviar,
}: {
  links: LinkTemporal[]
  onEliminar: (id: string) => void
  onReenviar: (id: string) => void
}) {
  const [confirmarEliminarLink, setConfirmarEliminarLink] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {links.length === 0 ? (
        <EstadoVacio mensaje="No hay links generados aún." />
      ) : links.map(link => {
        const vencido = new Date(link.expires_at) < new Date()
        const diasRestantes = Math.ceil((new Date(link.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        const cotNombre = link.rendicion?.cotizacion?.nombre || '—'
        const numBase = link.rendicion?.cotizacion?.grupo?.numero_base
        const itemNombre = link.cotizacion_item?.nombre || '—'
        const destEmail = link.email || link.colaborador?.email || null
        const destNombre = link.colaborador?.nombre || link.email || 'Sin destinatario'

        return (
          <div key={link.id} className={`border p-4 ${vencido ? 'border-ch-border/30 opacity-60' : 'border-ch-border/60'}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-body text-xs text-ch-cream">{destNombre}</span>
                  {destEmail && destEmail !== destNombre && (
                    <span className="font-body text-[10px] text-ch-muted">{destEmail}</span>
                  )}
                  {vencido
                    ? <span className="font-body text-[9px] px-1.5 border border-red-500/40 text-red-400">Vencido</span>
                    : <span className="font-body text-[9px] px-1.5 border border-ch-green/30 text-ch-green">Vigente</span>
                  }
                </div>
                <p className="font-body text-[10px] text-ch-muted">
                  {numBase && <span className="mr-1">{numBase}</span>}
                  {cotNombre} · <span className="text-ch-cream/70">{itemNombre}</span>
                </p>
                <p className="font-body text-[10px] text-ch-muted font-mono break-all">/r/{link.token}</p>
                <p className="font-body text-[10px] text-ch-muted">
                  {vencido
                    ? `Venció ${new Date(link.expires_at).toLocaleDateString('es-CL')}`
                    : `Vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''} · ${new Date(link.expires_at).toLocaleDateString('es-CL')}`
                  }
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/r/${link.token}`)}
                  className="font-body text-[10px] tracking-wider uppercase px-3 py-1.5 border border-ch-border text-ch-muted hover:text-ch-cream transition-colors">
                  Copiar link
                </button>
                {!vencido && destEmail && (
                  <button onClick={() => onReenviar(link.id)}
                    className="font-body text-[10px] tracking-wider uppercase px-3 py-1.5 border border-ch-border text-ch-muted hover:text-ch-cream transition-colors">
                    Reenviar email
                  </button>
                )}
                {confirmarEliminarLink === link.id ? (
                  <span className="flex items-center gap-1">
                    <span className="font-body text-[10px] text-ch-muted">¿Eliminar?</span>
                    <button onClick={() => { setConfirmarEliminarLink(null); onEliminar(link.id) }}
                      className="font-body text-[10px] text-red-400 hover:text-red-300 px-1 transition-colors">
                      Sí
                    </button>
                    <button onClick={() => setConfirmarEliminarLink(null)}
                      className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1 transition-colors">
                      No
                    </button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmarEliminarLink(link.id)}
                    className="font-body text-[10px] tracking-wider uppercase px-3 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
