'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Prospecto } from '@/types'
import { CHECKLIST_LABELS, type ChecklistItem } from '@/types'
import { registrarToque } from '@/app/actions/crm'
import { momento } from '@/lib/momentos'

// El toque de un click. Cuatro canales: registrar y detallar son dos momentos
// distintos, y el detalle se agrega después desde la ficha si vale la pena.
const CANALES: { tipo: string; label: string }[] = [
  { tipo: 'correo',  label: 'Correo'  },
  { tipo: 'llamada', label: 'Llamada' },
  { tipo: 'mensaje', label: 'Mensaje' },
  { tipo: 'reunion', label: 'Reunión' },
]

const SCORE_STYLES: Record<string, string> = {
  alta:  'border-ch-green text-ch-green',
  media: 'border-ch-gold text-ch-gold',
  baja:  'border-ch-border text-ch-subtle',
}

// Mapa de calor del contador. Frío alargado con pasos definidos:
// 0 = azul, 1 = celeste, 2 = celeste desaturado, 3 = amarillo; de 3 a 16 la
// rampa cálida (amarillo→dorado→naranja→rojo) comprimida. Satura en 16
// (≈ el 80% de los calificados acepta cerca del toque 16).
function heatColor(n: number): string {
  if (n <= 0) return '#2F6FD1'   // azul — sin tocar
  if (n === 1) return '#74CDE4'  // celeste
  if (n === 2) return '#96C7D6'  // celeste desaturado
  const stops: { t: number; c: [number, number, number] }[] = [
    { t: 0.00, c: [230, 212, 94] },  // amarillo (n=3)
    { t: 0.40, c: [230, 175, 60] },  // dorado
    { t: 0.72, c: [233, 120, 52] },  // naranja
    { t: 1.00, c: [229, 70, 47] },   // rojo (n=16)
  ]
  const t = Math.min((n - 3) / 13, 1)
  let a = stops[0], b = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) { a = stops[i]; b = stops[i + 1]; break }
  }
  const k = (t - a.t) / ((b.t - a.t) || 1)
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k)
  return `rgb(${mix(a.c[0], b.c[0])}, ${mix(a.c[1], b.c[1])}, ${mix(a.c[2], b.c[2])})`
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
  /** la tarjeta acaba de cambiar de etapa: aterriza con ch-settle */
  recienMovido?: boolean
}

export default function TarjetaProspecto({ prospecto, draggable, onDragStart, pendiente, onAddContacto, recienMovido }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Suma optimista: el contador late y sube de color en el acto, sin esperar
  // al servidor. Si falla, se revierte.
  const [extra, setExtra] = useState(0)
  const p = prospecto
  const checklist = (p.checklist ?? []).filter((x): x is ChecklistItem => x in CHECKLIST_LABELS)
  const n = (p.n_interacciones ?? 0) + extra
  const heat = heatColor(n)

  const tocar = (tipo: string) => {
    setExtra(e => e + 1)
    // Va dentro del gesto, no después del await: es micro-feedback local.
    momento('crm.contacto', { mensaje: '' })
    startTransition(async () => {
      const res = await registrarToque(p.id, tipo)
      if (res.error) {
        setExtra(e => Math.max(0, e - 1))
        momento('error', { mensaje: res.error })
        return
      }
      router.refresh()
    })
  }

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={() => router.push(`/crm/${p.id}`)}
      className={`block bg-ch-surface/30 border border-ch-border p-4 hover:border-ch-muted transition-colors group cursor-pointer ${recienMovido ? 'ch-settle' : ''}`}
    >
      {/* Epígrafe: contador de toques con código de calor */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-ch-border">
        <div className="flex items-baseline gap-1.5 transition-colors duration-500" style={{ color: heat }}>
          <span key={n} className="font-body font-bold text-2xl leading-none tabular-nums ch-pulse">{n}</span>
          <span className="font-body font-bold text-[9px] tracking-[0.25em] uppercase leading-none">
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
              title="Registrar contacto"
              className="font-body text-2xl leading-none text-ch-green hover:text-ch-green-light transition-colors px-1"
            >
              +
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

      {/* Toque de un click. Visible siempre, no en hover: es LA acción que el
          módulo quiere fomentar; esconderla sería trabajar en contra. */}
      {onAddContacto && (
        // Sangrada a los bordes de la tarjeta: en la columna más angosta del
        // Kanban (220 px) el texto no cabe dentro del padding. Gana 32 px y
        // además se lee como un pie de tarjeta.
        <div className="-mx-4 -mb-4 mt-3 border-t border-ch-border grid grid-cols-4">
          {CANALES.map(c => (
            <button
              key={c.tipo}
              type="button"
              title={`Registrar ${c.label.toLowerCase()} de hoy`}
              onClick={e => { e.stopPropagation(); tocar(c.tipo) }}
              className="font-body text-[8px] tracking-[0.04em] uppercase text-ch-subtle hover:text-ch-green hover:bg-ch-green/10 transition-colors py-2 ch-press truncate"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
