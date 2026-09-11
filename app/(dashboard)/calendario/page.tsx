import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile, Rodaje, EventoCalendario } from '@/types'
import { CLASIFICACION_COLORES } from '@/types'
import CalendarioCliente from '@/components/calendario/CalendarioCliente'
import InboxGCal from '@/components/calendario/InboxGCal'
import type { EventoFC } from '@/components/calendario/CalendarioCliente'
import { cronosVisibles, esHitoClave, nombreTipoHito, sumarDias } from '@/lib/crono'
import type { CronoHito, TipoHitoCrono } from '@/types'

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

  // Cargar hitos de cronos con fecha (CH-11) — una capa más, junto a rodajes y GCal.
  const { data: hitosCrono } = await supabase
    .from('crono_hitos')
    .select('id, tipo, titulo, fecha, fecha_fin, hecho, crono:cronos(id, nombre, estado, variante_de, variante)')
    .not('fecha', 'is', null)
    .order('fecha', { ascending: true })

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

  // Mapear hitos de crono a FullCalendar. `end` es exclusivo en FullCalendar, por
  // eso un rango suma un día al fin. Los cronos cerrados no se pintan.
  type HitoCal = Pick<CronoHito, 'id' | 'tipo' | 'titulo' | 'fecha' | 'fecha_fin' | 'hecho'> & { crono: { id: string; nombre: string; estado: 'borrador' | 'vigente' | 'cerrado'; variante_de: string | null; variante: string | null } | null }
  const hitosCal = (hitosCrono ?? []) as unknown as HitoCal[]
  // Variantes (v5): un solo crono por grupo — la vigente, o el original si ninguna lo es.
  const visibles = new Set(cronosVisibles(Array.from(new Map(hitosCal.filter(h => h.crono).map(h => [h.crono!.id, h.crono!])).values())).map(c => c.id))
  const eventosCrono: EventoFC[] = hitosCal
    .filter(h => h.fecha && h.crono && visibles.has(h.crono.id))
    .map(h => {
      const tipo = h.tipo as TipoHitoCrono
      const clave = esHitoClave(tipo)
      const color = clave ? '#d9d2c4' : tipo === 'pago' ? '#c9a84c' : '#5a5a55'
      return {
        id:              `crono-${h.id}`,
        title:           `${h.titulo || nombreTipoHito(tipo)} · ${h.crono!.nombre}${h.crono!.variante ? ` (${h.crono!.variante})` : ''}`,
        start:           h.fecha!,
        end:             sumarDias(h.fecha_fin ?? h.fecha!, 1),
        allDay:          true,
        backgroundColor: color,
        borderColor:     color,
        textColor:       clave || tipo === 'pago' ? '#111110' : '#f5f0e8',
        extendedProps: {
          tipo:        'crono' as const,
          cronoId:     h.crono!.id,
          cronoNombre: h.crono!.nombre,
          estado:      h.hecho ? 'hecho' : undefined,
        },
      }
    })

  const todosLosEventos = [...eventosRodaje, ...eventosCrono, ...eventosGCalFC]

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
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[1px] inline-block" style={{ background: '#d9d2c4' }} />
          <span className="text-[10px] font-body text-ch-muted">Hito clave de crono</span>
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
