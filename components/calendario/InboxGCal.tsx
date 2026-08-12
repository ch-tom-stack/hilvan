'use client'

import { useState, useTransition } from 'react'
import { clasificarEvento, triggerSyncGCal } from '@/app/actions/calendario'
import type { EventoCalendario, ClasificacionEvento } from '@/types'
import { momento } from '@/lib/momentos'

interface Props {
  eventos: EventoCalendario[]
  esAdmin: boolean
}

function formatFechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function FilaEvento({ evento }: { evento: EventoCalendario }) {
  const [clasificado, setClasificado] = useState(false)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')

  const handleClasificar = (clasificacion: ClasificacionEvento) => {
    setMsg('')
    start(async () => {
      const res = await clasificarEvento(evento.id, clasificacion)
      if (res.error) { setMsg(res.error); momento('error', { mensaje: res.error }); return }
      // Ignorar no es un avance: sacar ruido de la bandeja se acusa distinto
      // que reconocer un rodaje o una reunión.
      momento(clasificacion === 'ignorar' ? 'item.eliminado' : 'checklist.marcado')
      setClasificado(true)
    })
  }

  if (clasificado) return null

  return (
    <div className="flex items-start gap-4 py-3 border-b border-ch-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ch-cream truncate">{evento.titulo}</p>
        <p className="text-[10px] text-ch-muted mt-0.5">
          {formatFechaCorta(evento.fecha_inicio)}
          {evento.descripcion && (
            <span className="ml-2 truncate text-ch-subtle">{evento.descripcion.slice(0, 60)}</span>
          )}
        </p>
        {msg && <p className="text-xs text-red-400 mt-1">{msg}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => handleClasificar('rodaje')}
          disabled={pending}
          className="text-[10px] font-body px-2 py-1 border border-ch-green/40 text-ch-green rounded-[2px] hover:bg-ch-green/10 transition-colors disabled:opacity-40 ch-press"
        >
          Rodaje
        </button>
        <button
          onClick={() => handleClasificar('reunion')}
          disabled={pending}
          className="text-[10px] font-body px-2 py-1 border border-blue-400/40 text-blue-400 rounded-[2px] hover:bg-blue-400/10 transition-colors disabled:opacity-40 ch-press"
        >
          Reunión
        </button>
        <button
          onClick={() => handleClasificar('ignorar')}
          disabled={pending}
          className="text-[10px] font-body px-2 py-1 border border-ch-border text-ch-subtle rounded-[2px] hover:bg-ch-surface transition-colors disabled:opacity-40 ch-press"
        >
          Ignorar
        </button>
      </div>
    </div>
  )
}

export default function InboxGCal({ eventos, esAdmin }: Props) {
  const [syncPending, startSync] = useTransition()
  const [syncMsg, setSyncMsg]   = useState('')
  const [abierto, setAbierto]   = useState(false)

  const handleSync = () => {
    setSyncMsg('')
    startSync(async () => {
      const res = await triggerSyncGCal()
      if (res.error) { setSyncMsg(res.error); momento('error', { mensaje: res.error }); return }
      const d = res.data as { upserted?: number } | undefined
      const n = d?.upserted ?? 0
      // Traer cero eventos no es un fallo, pero tampoco un logro: se acusa
      // distinto para que no parezca que funcionó a medias.
      momento(n > 0 ? 'guardado' : 'atencion', {
        mensaje: n > 0 ? `${n} evento${n === 1 ? '' : 's'} sincronizado${n === 1 ? '' : 's'}` : 'Sin eventos nuevos',
      })
      setSyncMsg(`✓ Sincronizado — ${n} eventos`)
    })
  }

  return (
    <div className="border border-ch-border bg-ch-surface/20 rounded-[2px]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAbierto(v => !v)}
            className="flex items-center gap-2 text-left ch-press"
          >
            <p className="text-[9px] font-body tracking-[0.4em] uppercase text-ch-muted">
              Inbox Google Calendar
            </p>
            {eventos.length > 0 && (
              <span className="bg-ch-gold/20 text-ch-gold text-[9px] font-body px-2 py-0.5 rounded-[2px] border border-ch-gold/30">
                {eventos.length} sin clasificar
              </span>
            )}
            {eventos.length === 0 && (
              <span className="text-[9px] text-ch-green">✓ Todo clasificado</span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && (
            <p className={`text-[10px] ${syncMsg.startsWith('✓') ? 'text-ch-green' : 'text-red-400'}`}>
              {syncMsg}
            </p>
          )}
          {esAdmin && (
            <button
              onClick={handleSync}
              disabled={syncPending}
              className="text-[10px] font-body text-ch-muted border border-ch-border rounded-[2px] px-3 py-1 hover:text-ch-cream transition-colors disabled:opacity-40 ch-press"
            >
              {syncPending ? 'Sincronizando…' : '↻ Sincronizar'}
            </button>
          )}
          <button
            onClick={() => setAbierto(v => !v)}
            className="text-ch-subtle hover:text-ch-muted transition-colors text-xs ch-press"
          >
            {abierto ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Lista de eventos sin clasificar */}
      {abierto && (
        <div className="border-t border-ch-border px-5 py-2">
          {eventos.length === 0 ? (
            <p className="text-xs text-ch-muted py-3 text-center">No hay eventos sin clasificar.</p>
          ) : (
            eventos.map(e => <FilaEvento key={e.id} evento={e} />)
          )}
        </div>
      )}
    </div>
  )
}
