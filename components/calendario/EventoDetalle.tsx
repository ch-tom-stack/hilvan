'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { clasificarEvento } from '@/app/actions/calendario'
import type { EventoCalendario, ClasificacionEvento } from '@/types'
import { CLASIFICACION_LABELS } from '@/types'
import type { EventoFC } from './CalendarioCliente'
import { momento } from '@/lib/momentos'

const OPCIONES: { value: ClasificacionEvento; label: string; color: string }[] = [
  { value: 'rodaje',   label: 'Rodaje',   color: 'text-ch-green border-ch-green/40 hover:bg-ch-green/10' },
  { value: 'reunion',  label: 'Reunión',  color: 'text-blue-400 border-blue-400/40 hover:bg-blue-400/10' },
  { value: 'ignorar',  label: 'Ignorar',  color: 'text-ch-subtle border-ch-border/40 hover:bg-ch-surface' },
]

interface Props {
  evento: EventoFC
  eventosGCal: EventoCalendario[]
  onClose: () => void
}

export default function EventoDetalle({ evento, eventosGCal, onClose }: Props) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')

  const esGCal = evento.extendedProps.tipo === 'gcal'
  const eventoRaw = eventosGCal.find(e => e.id === evento.id)
  const clasificacionActual = eventoRaw?.clasificacion ?? evento.extendedProps.clasificacion

  const formatFecha = (iso: string, allDay: boolean) => {
    const d = new Date(iso)
    if (allDay) return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
    return d.toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  }

  const handleClasificar = (clasificacion: ClasificacionEvento) => {
    setMsg('')
    start(async () => {
      const res = await clasificarEvento(evento.id, clasificacion)
      if (res.error) { setMsg(res.error); momento('error', { mensaje: res.error }); return }
      momento(clasificacion === 'ignorar' ? 'item.eliminado' : 'checklist.marcado')
      setMsg('✓ Clasificado')
    })
  }

  return (
    <div className="border border-ch-border bg-ch-surface/40 rounded-[2px] p-5 sticky top-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <span
          className="inline-block w-2 h-2 rounded-full mt-1.5 shrink-0"
          style={{ background: evento.backgroundColor }}
        />
        <h3 className="font-display italic text-lg text-ch-cream leading-tight flex-1">
          {evento.title}
        </h3>
        <button onClick={onClose} className="text-ch-subtle hover:text-ch-muted transition-colors text-xs shrink-0 ch-press">✕</button>
      </div>

      {/* Fecha */}
      <div className="mb-4 space-y-1">
        <p className="text-[10px] font-body tracking-[0.3em] uppercase text-ch-muted">Inicio</p>
        <p className="text-xs text-ch-cream capitalize">{formatFecha(evento.start, evento.allDay)}</p>
        {evento.end && evento.end !== evento.start && (
          <>
            <p className="text-[10px] font-body tracking-[0.3em] uppercase text-ch-muted mt-2">Fin</p>
            <p className="text-xs text-ch-cream capitalize">{formatFecha(evento.end, evento.allDay)}</p>
          </>
        )}
      </div>

      {/* Descripción */}
      {evento.extendedProps.descripcion && (
        <div className="mb-4 border-t border-ch-border pt-4">
          <p className="text-[10px] font-body tracking-[0.3em] uppercase text-ch-muted mb-1">Descripción</p>
          <p className="text-xs text-ch-muted leading-relaxed whitespace-pre-wrap line-clamp-4">
            {evento.extendedProps.descripcion}
          </p>
        </div>
      )}

      {/* Link a rodaje */}
      {evento.extendedProps.tipo === 'rodaje' && evento.extendedProps.rodajeId && (
        <div className="mb-4 border-t border-ch-border pt-4">
          <Link
            href={`/rodaje/${evento.extendedProps.rodajeId}`}
            className="text-xs text-ch-green hover:text-ch-green-light transition-colors"
          >
            Ver ficha de rodaje →
          </Link>
        </div>
      )}

      {/* Estado del rodaje */}
      {evento.extendedProps.estado && (
        <div className="mb-4">
          <span className="text-[9px] font-body tracking-[0.3em] uppercase text-ch-muted">Estado: </span>
          <span className="text-[9px] font-body tracking-[0.3em] uppercase text-ch-cream capitalize">
            {evento.extendedProps.estado}
          </span>
        </div>
      )}

      {/* Clasificación (solo eventos GCal) */}
      {esGCal && (
        <div className="border-t border-ch-border pt-4">
          <p className="text-[10px] font-body tracking-[0.3em] uppercase text-ch-muted mb-3">
            Clasificar
            {clasificacionActual && clasificacionActual !== 'sin_clasificar' && (
              <span className="ml-2 normal-case tracking-normal text-ch-cream">
                ({CLASIFICACION_LABELS[clasificacionActual as ClasificacionEvento]})
              </span>
            )}
          </p>
          <div className="flex flex-col gap-1.5">
            {OPCIONES.map(op => (
              <button
                key={op.value}
                onClick={() => handleClasificar(op.value)}
                disabled={pending || clasificacionActual === op.value}
                className={`text-xs font-body border rounded-[2px] px-3 py-1.5 text-left transition-colors disabled:opacity-40 ${op.color} ch-press`}
              >
                {op.label}
              </button>
            ))}
          </div>
          {msg && (
            <p className={`text-xs mt-2 ${msg.startsWith('✓') ? 'text-ch-green' : 'text-red-400'}`}>
              {msg}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
