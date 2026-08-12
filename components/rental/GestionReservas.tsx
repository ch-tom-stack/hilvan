'use client'

import { useState, useTransition } from 'react'
import { useConfirm } from '@/components/ui/useConfirm'
import { actualizarEstadoReserva, eliminarReserva } from '@/app/actions/rental'
import { toastOk, toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import type { RentalReserva, EstadoRental } from '@/types'
import EstadoVacio from '@/components/ui/EstadoVacio'
import { parseFechaLocal } from '@/lib/fechas'

type ReservaConJoins = RentalReserva & {
  equipo?: { codigo: string; nombre: string } | null
  maleta?: { codigo: string; nombre: string } | null
  cliente?: { nombre: string } | null
  solicitante?: { nombre: string; email: string } | null
}

const ESTADO_COLORS: Record<EstadoRental, string> = {
  pendiente:  'text-amber-400 border-amber-400/30 bg-amber-400/5',
  aprobada:   'text-blue-400  border-blue-400/30  bg-blue-400/5',
  denegada:   'text-red-400   border-red-400/30   bg-red-400/5',
  entregada:  'text-ch-green  border-ch-green/30  bg-ch-green/5',
  devuelta:   'text-ch-muted  border-ch-border    bg-transparent',
}

const ESTADO_LABELS: Record<EstadoRental, string> = {
  pendiente: 'Pendiente',
  aprobada:  'Aprobada',
  denegada:  'Denegada',
  entregada: 'Entregada',
  devuelta:  'Devuelta',
}

function TagEstadoReserva({ estado }: { estado: EstadoRental }) {
  return (
    <span className={`text-xs font-body px-2.5 py-0.5 rounded-[2px] border shrink-0 ${ESTADO_COLORS[estado]}`}>
      {ESTADO_LABELS[estado]}
    </span>
  )
}

function FilaReserva({
  reserva,
  esAdmin,
  expandida,
  onToggle,
}: {
  reserva: ReservaConJoins
  esAdmin: boolean
  expandida: boolean
  onToggle: () => void
}) {
  const [pending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()

  const itemLabel = reserva.equipo
    ? `${reserva.equipo.codigo} · ${reserva.equipo.nombre}`
    : reserva.maleta
    ? `${reserva.maleta.codigo} · ${reserva.maleta.nombre}`
    : '—'

  const solicitanteLabel = reserva.solicitante?.nombre ?? reserva.cliente?.nombre ?? '—'

  const fechaInicio = parseFechaLocal(reserva.fecha_inicio).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  const fechaFin    = parseFechaLocal(reserva.fecha_fin).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })

  function cambiarEstado(estado: EstadoRental) {
    startTransition(async () => {
      const r = await actualizarEstadoReserva(reserva.id, estado)
      if (r.ok) {
        toastOk(`Reserva marcada como ${ESTADO_LABELS[estado].toLowerCase()}`)
        // Aprobar y denegar no pueden sonar igual; el resto de los estados son
        // seguimiento y comparten el sonido de avance.
        if (estado === 'aprobada') momento('rental.aprobada', { mensaje: '' })
        else if (estado === 'denegada') momento('rental.denegada', { mensaje: '' })
        else momento('crm.avance', { mensaje: '' })
      } else {
        toastError(r.error ?? 'Error al actualizar')
        momento('error', { mensaje: r.error ?? 'Error al actualizar' })
      }
    })
  }

  async function eliminar() {
    if (!await confirm('¿Eliminar esta reserva?')) return
    startTransition(async () => {
      const r = await eliminarReserva(reserva.id)
      if (r.ok) { toastOk('Reserva eliminada'); momento('item.eliminado') }
      else { toastError(r.error ?? 'Error al eliminar'); momento('error', { mensaje: r.error ?? 'Error al eliminar' }) }
    })
  }

  return (
    <div className="border-b border-ch-border/50 last:border-b-0">
      {ConfirmDialog}
      {/* Fila principal */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-ch-surface/30 transition-colors text-left ch-press"
        disabled={pending}
      >
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm text-ch-cream truncate">{itemLabel}</p>
          {esAdmin && (
            <p className="font-body text-[10px] text-ch-subtle">{solicitanteLabel}</p>
          )}
        </div>
        <div className="hidden sm:block text-right shrink-0">
          <p className="font-body text-xs text-ch-muted">{fechaInicio} → {fechaFin}</p>
        </div>
        <TagEstadoReserva estado={reserva.estado} />
        <span className="text-ch-subtle text-xs">{expandida ? '▲' : '▼'}</span>
      </button>

      {/* Panel expandido */}
      {expandida && (
        <div className="px-5 pb-4 bg-ch-surface/10">
          <div className="sm:hidden mb-3">
            <p className="font-body text-xs text-ch-muted">{fechaInicio} → {fechaFin}</p>
          </div>

          {reserva.notas && (
            <p className="font-body text-xs text-ch-muted italic mb-3">
              Notas: {reserva.notas}
            </p>
          )}

          <p className="font-body text-[9px] text-ch-subtle mb-3">
            Creada {new Date(reserva.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          {/* Acciones admin */}
          {esAdmin && (
            <div className="flex flex-wrap gap-2">
              {reserva.estado === 'pendiente' && (
                <>
                  <button
                    onClick={() => cambiarEstado('aprobada')}
                    disabled={pending}
                    className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[9px] tracking-[0.3em] uppercase px-4 py-2 transition-colors disabled:opacity-50 ch-press"
                  >
                    Aprobar
                  </button>
                  <button
                    onClick={() => cambiarEstado('denegada')}
                    disabled={pending}
                    className="border border-red-900/50 text-red-400 hover:bg-red-950/30 font-body text-[9px] tracking-[0.3em] uppercase px-4 py-2 transition-colors disabled:opacity-50 ch-press"
                  >
                    Denegar
                  </button>
                  <button
                    onClick={eliminar}
                    disabled={pending}
                    className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-subtle hover:text-red-400 transition-colors disabled:opacity-50 ch-press"
                  >
                    Eliminar
                  </button>
                </>
              )}
              {reserva.estado === 'aprobada' && (
                <button
                  onClick={() => cambiarEstado('entregada')}
                  disabled={pending}
                  className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[9px] tracking-[0.3em] uppercase px-4 py-2 transition-colors disabled:opacity-50 ch-press"
                >
                  Marcar entregada
                </button>
              )}
              {reserva.estado === 'entregada' && (
                <button
                  onClick={() => cambiarEstado('devuelta')}
                  disabled={pending}
                  className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-[0.3em] uppercase px-4 py-2 transition-colors disabled:opacity-50 ch-press"
                >
                  Marcar devuelta
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function GestionReservas({
  reservas,
  esAdmin,
  vista,
}: {
  reservas: ReservaConJoins[]
  esAdmin: boolean
  vista: 'mias' | 'todas'
}) {
  const [expandida, setExpandida] = useState<string | null>(null)

  const activas   = reservas.filter(r => !['devuelta', 'denegada'].includes(r.estado))
  const historial = reservas.filter(r =>  ['devuelta', 'denegada'].includes(r.estado))

  const toggle = (id: string) => setExpandida(prev => prev === id ? null : id)

  if (reservas.length === 0) {
    return (
      <EstadoVacio
        mensaje={`No hay reservas${vista === 'mias' ? ' tuyas' : ''} aún.`}
        submensaje="Las solicitudes aparecerán aquí una vez enviadas."
      />
    )
  }

  return (
    <div className="space-y-8">
      {/* Activas */}
      {activas.length > 0 && (
        <div>
          <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-3">
            Activas — {activas.length}
          </p>
          <div className="border border-ch-border">
            {activas.map(r => (
              <FilaReserva
                key={r.id}
                reserva={r}
                esAdmin={esAdmin}
                expandida={expandida === r.id}
                onToggle={() => toggle(r.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <div>
          <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-3">
            Historial — {historial.length}
          </p>
          <div className="border border-ch-border opacity-70">
            {historial.map(r => (
              <FilaReserva
                key={r.id}
                reserva={r}
                esAdmin={false}
                expandida={expandida === r.id}
                onToggle={() => toggle(r.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
