import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import SunCalc from 'suncalc'
import PlanViewer from './PlanViewer'

export default async function RodajeVerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: rodaje } = await supabase
    .from('rodajes')
    .select('*, proyecto:proyectos(nombre), equipo_tecnico:rodaje_equipo_tecnico(*)')
    .eq('id', id)
    .single()

  if (!rodaje) notFound()

  const [{ data: bloques }, { data: locaciones }] = await Promise.all([
    supabase
      .from('rodaje_bloques')
      .select('*')
      .eq('rodaje_id', id)
      .is('padre_id', null)
      .order('orden'),
    supabase
      .from('rodaje_locaciones')
      .select('*')
      .eq('rodaje_id', id)
      .order('orden'),
  ])

  let sol = null
  if (rodaje.locacion_lat && rodaje.locacion_lng && rodaje.fecha) {
    const fechaObj = new Date(rodaje.fecha + 'T12:00:00')
    const times = SunCalc.getTimes(fechaObj, rodaje.locacion_lat, rodaje.locacion_lng)
    const fmt = (d: Date) => new Intl.DateTimeFormat('es-CL', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago',
    }).format(d)
    sol = {
      amanecer: fmt(times.sunrise),
      atardecer: fmt(times.sunset),
      dorada_am: fmt(times.goldenHourEnd),
      dorada_pm: fmt(times.goldenHour),
    }
  }

  return (
    <PlanViewer
      id={id}
      rodajeInicial={rodaje}
      bloquesIniciales={bloques || []}
      locaciones={locaciones || []}
      solInicial={sol}
    />
  )
}
