'use client'

import { useRouter } from 'next/navigation'
import type { Prospecto } from '@/types'
import { CHECKLIST_LABELS, type ChecklistItem } from '@/types'

const SCORE_STYLES: Record<string, string> = {
  alta:  'border-ch-green text-ch-green',
  media: 'border-ch-gold text-ch-gold',
  baja:  'border-ch-border text-ch-subtle',
}

// Escala de calor del contador: 0 contactos = frío (azul) → muy trabajado = caliente (rojo).
// Hue 210 (azul) a 0 (rojo); satura a 8+ contactos.
function heatColor(n: number): string {
  const t = Math.min(Math.max(n, 0) / 8, 1)
  const hue = Math.round(210 * (1 - t))
  return `hsl(${hue}, 78%, 62%)`
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
  /** muestra el botón "+ contacto" (registro rápido en el pipeline) */
  contador?: boolean
  /** abre el registro rápido de contacto en el pipeline */
  onAddContacto?: (p: Prospecto) => void
}

export default function TarjetaProspecto({ prospecto, draggable, onDragStart, pendiente, onAddContacto }: Props) {
  const router = useRouter()
  const p = prospecto
  const checklist = (p.checklist ?? []).filter((x): x is ChecklistItem => x in CHECKLIST_LABELS)
  const n = p.n_interacciones ?? 0
  const heat = heatColor(n)

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={() => router.push(`/crm/${p.id}`)}
      className="block bg-ch-surface/30 border border-ch-border p-4 hover:border-ch-muted transition-colors group cursor-pointer"
    >
      {/* Epígrafe: contador de contactos con código de calor */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-ch-border">
        <div className="flex items-baseline gap-1.5" style={{ color: heat }}>
          <span className="font-body font-bold text-3xl leading-none tabular-nums">{n}</span>
          <span className="font-body font-bold text-[9px] tracking-[0.25em] uppercase">
            contacto{n === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pendiente && (
            <span className="w-2 h-2 bg-ch-gold" title="Pendiente en la Bandeja" />
          )}
          {onAddContacto && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onAddContacto(p) }}
              className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-green hover:text-ch-green-light transition-colors"
            >
              + contacto
            </button>
          )}
        </div>
      </div>

      <h3 className="font-display italic text-lg text-ch-cream leading-tight group-hover:text-white transition-colors mb-2">
        {p.empresa}
      </h3>

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

      <p className="font-body text-[10px] tracking-[0.15em] uppercase text-ch-subtle">
        {p.responsable?.nombre ?? 'Sin asignar'}
      </p>
    </div>
  )
}
