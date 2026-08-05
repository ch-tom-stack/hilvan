'use client'

import { useRouter } from 'next/navigation'
import type { Prospecto } from '@/types'
import { CHECKLIST_LABELS, type ChecklistItem } from '@/types'

const SCORE_STYLES: Record<string, string> = {
  alta:  'border-ch-green text-ch-green',
  media: 'border-ch-gold text-ch-gold',
  baja:  'border-ch-border text-ch-subtle',
}

export function Tag({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-block font-body text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 border ${className}`}
    >
      {children}
    </span>
  )
}

interface Props {
  prospecto: Prospecto
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  /** marca un punto ch-gold (pendiente en la Bandeja) */
  pendiente?: boolean
  /** muestra el contador de contactos y el botón "+ contacto" (Contacto/Conversación) */
  contador?: boolean
  /** abre el registro rápido de contacto en el pipeline */
  onAddContacto?: (p: Prospecto) => void
}

export default function TarjetaProspecto({ prospecto, draggable, onDragStart, pendiente, contador, onAddContacto }: Props) {
  const router = useRouter()
  const p = prospecto
  const checklist = (p.checklist ?? []).filter((x): x is ChecklistItem => x in CHECKLIST_LABELS)

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={() => router.push(`/crm/${p.id}`)}
      className="block bg-ch-surface/30 border border-ch-border p-4 hover:border-ch-muted transition-colors group cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-display italic text-lg text-ch-cream leading-tight group-hover:text-white transition-colors">
          {p.empresa}
        </h3>
        {pendiente && (
          <span className="w-2 h-2 bg-ch-gold shrink-0 mt-1.5" title="Pendiente en la Bandeja" />
        )}
      </div>

      {p.nombre_contacto && (
        <p className="font-body text-xs text-ch-muted mb-3 truncate">{p.nombre_contacto}</p>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        {p.producto_objetivo && p.producto_objetivo !== 'sin_definir' && (
          <Tag className="border-ch-border text-ch-muted capitalize">{p.producto_objetivo}</Tag>
        )}
        {p.score && (
          <Tag className={`capitalize ${SCORE_STYLES[p.score] ?? 'border-ch-border text-ch-subtle'}`}>
            {p.score}
          </Tag>
        )}
      </div>

      {/* Checklist (hitos marcados) */}
      {checklist.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {checklist.map(item => (
            <span key={item} className="inline-flex items-center gap-1 font-body text-[9px] tracking-[0.1em] uppercase text-ch-green">
              <span aria-hidden>✓</span>{CHECKLIST_LABELS[item]}
            </span>
          ))}
        </div>
      )}

      {/* Contador de contactos + registro rápido */}
      {contador && (
        <div className="flex items-center justify-between mb-3 border-t border-ch-border pt-2">
          <span className="font-body text-[10px] text-ch-muted">
            {p.n_interacciones ?? 0} contacto{(p.n_interacciones ?? 0) === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onAddContacto?.(p) }}
            className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-green hover:text-ch-green-light transition-colors"
          >
            + contacto
          </button>
        </div>
      )}

      <p className="font-body text-[10px] tracking-[0.15em] uppercase text-ch-subtle">
        {p.responsable?.nombre ?? 'Sin asignar'}
      </p>
    </div>
  )
}
