'use client'

import Link from 'next/link'
import type { Prospecto } from '@/types'

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
  /** marca un punto ch-gold (placeholder Bandeja, se activa en F2) */
  pendiente?: boolean
}

export default function TarjetaProspecto({ prospecto, draggable, onDragStart, pendiente }: Props) {
  const p = prospecto
  return (
    <Link
      href={`/crm/${p.id}`}
      draggable={draggable}
      onDragStart={onDragStart}
      className="block bg-ch-surface/30 border border-ch-border p-4 hover:border-ch-muted transition-colors group"
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

      <p className="font-body text-[10px] tracking-[0.15em] uppercase text-ch-subtle">
        {p.responsable?.nombre ?? 'Sin asignar'}
      </p>
    </Link>
  )
}
