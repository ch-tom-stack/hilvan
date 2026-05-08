'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventoFC } from './CalendarioCliente'

interface Props {
  eventos: EventoFC[]
  onEventClick: (evento: EventoFC) => void
}

export default function CalendarioFC({ eventos, onEventClick }: Props) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      locale="es"
      firstDay={1}
      headerToolbar={{
        left:   'prev,next today',
        center: 'title',
        right:  'dayGridMonth,timeGridWeek,listMonth',
      }}
      buttonText={{
        today: 'Hoy',
        month: 'Mes',
        week:  'Semana',
        list:  'Lista',
      }}
      events={eventos}
      eventClick={(info) => {
        onEventClick({
          id:              info.event.id,
          title:           info.event.title,
          start:           info.event.startStr,
          end:             info.event.endStr,
          allDay:          info.event.allDay,
          backgroundColor: info.event.backgroundColor,
          borderColor:     info.event.borderColor,
          extendedProps:   info.event.extendedProps as EventoFC['extendedProps'],
        })
      }}
      height="auto"
      eventDisplay="block"
      dayMaxEvents={4}
      moreLinkText={(n) => `+${n} más`}
      noEventsText="Sin eventos"
    />
  )
}
