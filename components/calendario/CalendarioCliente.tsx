'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { EventoCalendario } from '@/types'
import EventoDetalle from './EventoDetalle'

// Importación dinámica — FullCalendar no funciona en SSR
const CalendarioFC = dynamic(() => import('./CalendarioFC'), {
  ssr: false,
  loading: () => (
    <div className="h-96 flex items-center justify-center text-ch-muted text-sm">
      Cargando calendario…
    </div>
  ),
})

export interface EventoFC {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  backgroundColor: string
  borderColor: string
  extendedProps: {
    tipo: 'rodaje' | 'gcal'
    descripcion?: string | null
    clasificacion?: string
    rodajeId?: string | null
    estado?: string
  }
}

interface Props {
  eventosFC: EventoFC[]
  eventosGCal: EventoCalendario[]
}

export default function CalendarioCliente({ eventosFC, eventosGCal }: Props) {
  const [seleccionado, setSeleccionado] = useState<EventoFC | null>(null)

  const handleEventClick = useCallback((evento: EventoFC) => {
    setSeleccionado(evento)
  }, [])

  return (
    <div className="flex gap-6 items-start">
      {/* Calendario */}
      <div className="flex-1 min-w-0 fc-hilvan">
        <CalendarioFC eventos={eventosFC} onEventClick={handleEventClick} />
      </div>

      {/* Panel de detalle */}
      {seleccionado && (
        <div className="w-72 shrink-0">
          <EventoDetalle
            evento={seleccionado}
            eventosGCal={eventosGCal}
            onClose={() => setSeleccionado(null)}
          />
        </div>
      )}
    </div>
  )
}
