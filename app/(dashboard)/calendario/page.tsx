import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile, Rodaje, EventoCalendario } from '@/types'
import { CLASIFICACION_COLORES } from '@/types'
import CalendarioCliente from '@/components/calendario/CalendarioCliente'
import InboxGCal from '@/components/calendario/InboxGCal'
import type { EventoFC } from '@/components/calendario/CalendarioCliente'

export const metadata = { title: 'Calendario — Hilván' }

// Color por estado de rodaje
const RODAJE_COLOR: Record<string, string> = {
  confirmado:  '#7a9e7e',
  borrador:    '#4a6b4e',
  completado:  '#3a5a3e',
}

export default async function CalendarioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<Pick<Profile, 'rol'>>()

  const esAdminOProductor = profile?.rol === 'admin' || profile?.rol === 'productor'

  // Cargar rodajes con fecha
  const { data: rodajes } = await supabase
    .from('rodajes')
    .select('id, nombre, fecha, estado')
    .not('fecha', 'is', null)
    .order('fecha', { ascending: true })

  // Cargar eventos GCal (excepto ignorar)
  const { data: eventos } = await supabase
    .from('eventos_calendario')
    .select('*')
    .neq('clasificacion', 'ignorar')
    .order('fecha_inicio', { ascending: true })

  // Cargar inbox (solo para admin/productor)
  const { data: sinClasificar } = esAdminOProductor
    ? await supabase
        .from('eventos_calendario')
        .select('*')
        .eq('clasificacion', 'sin_clasificar')
        .order('fecha_inicio', { ascending: true })
    : { data: [] }

  // Mapear rodajes a eventos de FullCalendar
  const eventosRodaje: EventoFC[] = (rodajes as Rodaje[] ?? []).map(r => {
    const color = RODAJE_COLOR[r.estado] ?? '#7a9e7e'
    return {
      id:              r.id,
      title:           r.nombre,
      start:           r.fecha!,
      end:             r.fecha!,
      allDay:          true,
      backgroundColor: color,
      borderColor:     color,
      extendedProps: {
        tipo:      'rodaje',
        rodajeId:  r.id,
        estado:    r.estado,
      },
    }
  })

  // Mapear eventos GCal a FullCalendar
  const eventosGCalFC: EventoFC[] = (eventos as EventoCalendario[] ?? []).map(e => {
    const color = CLASIFICACION_COLORES[e.clasificacion] ?? CLASIFICACION_COLORES.sin_clasificar
    return {
      id:              e.id,
      title:           e.titulo,
      start:           e.fecha_inicio,
      end:             e.fecha_fin,
      allDay:          e.todo_el_dia,
      backgroundColor: color,
      borderColor:     color,
      extendedProps: {
        tipo:          'gcal',
        descripcion:   e.descripcion,
        clasificacion: e.clasificacion,
      },
    }
  })

  const todosLosEventos = [...eventosRodaje, ...eventosGCalFC]

  return (
    <div className="p-6 lg:p-10 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
          CH-8
        </p>
        <h1 className="font-display italic text-5xl text-ch-cream leading-none">
          Calendario
        </h1>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[1px] inline-block" style={{ background: '#7a9e7e' }} />
          <span className="text-[10px] font-body text-ch-muted">Rodaje confirmado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[1px] inline-block" style={{ background: '#6b8cba' }} />
          <span className="text-[10px] font-body text-ch-muted">Reunión (GCal)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[1px] inline-block" style={{ background: '#c9a84c' }} />
          <span className="text-[10px] font-body text-ch-muted">Sin clasificar</span>
        </div>
      </div>

      {/* Inbox — solo admin/productor */}
      {esAdminOProductor && (
        <div className="mb-6">
          <InboxGCal
            eventos={(sinClasificar as EventoCalendario[]) ?? []}
            esAdmin={profile?.rol === 'admin'}
          />
        </div>
      )}

      {/* Calendario */}
      <div className="border border-ch-border bg-ch-surface/10 p-4 rounded-[2px]">
        <CalendarioCliente
          eventosFC={todosLosEventos}
          eventosGCal={(eventos as EventoCalendario[]) ?? []}
        />
      </div>
    </div>
  )
}
