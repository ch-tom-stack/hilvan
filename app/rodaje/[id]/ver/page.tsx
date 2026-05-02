import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { calcularCascada, minutosAHora, formatHora, resolverHoraLlamado } from '@/types'
import SunCalc from 'suncalc'

export default async function RodajeVerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: rodaje } = await supabase
    .from('rodajes')
    .select(`*, proyecto:proyectos(nombre), equipo_tecnico:rodaje_equipo_tecnico(*)`)
    .eq('id', id)
    .single()

  if (!rodaje) notFound()

  const { data: bloques } = await supabase
    .from('rodaje_bloques')
    .select('*')
    .eq('rodaje_id', id)
    .is('padre_id', null)
    .order('orden')

  const { data: locaciones } = await supabase
    .from('rodaje_locaciones')
    .select('*')
    .eq('rodaje_id', id)
    .order('orden')

  const bloquesData = bloques || []
  const cascada = calcularCascada(bloquesData)
  const callMin = cascada[0]?.inicio_min
  const locacionPrincipal = locaciones?.find(l => l.es_principal) || locaciones?.[0]
  const equipo = rodaje.equipo_tecnico || []

  const fecha = rodaje.fecha
    ? new Date(rodaje.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

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

  const durTotal = bloquesData
    .filter(b => !b.es_paralelo)
    .reduce((acc, b) => acc + (b.duracion_min || 0), 0)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* HEADER */}
      <div className="border-b border-zinc-800 px-4 py-5 max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-zinc-600 mb-1">Casa Hiedra</p>
            <h1 className="text-xl font-medium text-zinc-100">{rodaje.nombre}</h1>
            {fecha && <p className="text-sm text-zinc-400 mt-0.5">{fecha}</p>}
            {rodaje.proyecto?.nombre && (
              <p className="text-xs text-zinc-600 mt-1">{rodaje.proyecto.nombre}</p>
            )}
          </div>
          {rodaje.cliente_logo_url && (
            <img
              src={rodaje.cliente_logo_url}
              alt="Cliente"
              className="h-8 w-auto object-contain"
              style={{ filter: 'invert(1)' }}
            />
          )}
        </div>

        {/* Info strip */}
        <div className="flex items-center gap-4 mt-4 flex-wrap text-xs">
          {callMin !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-600">CALL</span>
              <span className="font-medium text-lg text-zinc-100">{minutosAHora(callMin)}</span>
            </div>
          )}
          {locacionPrincipal && (
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-600">📍</span>
              <span className="text-zinc-300">{locacionPrincipal.nombre}</span>
              {locacionPrincipal.direccion && (
                <span className="text-zinc-600">· {locacionPrincipal.direccion}</span>
              )}
            </div>
          )}
          {sol && (
            <div className="flex items-center gap-2 text-zinc-500">
              <span>↑{sol.amanecer}</span>
              <span className="text-amber-500">★{sol.dorada_am}</span>
              <span className="text-amber-500">★{sol.dorada_pm}</span>
              <span>↓{sol.atardecer}</span>
            </div>
          )}
          {durTotal > 0 && (
            <span className="text-zinc-600 ml-auto">{Math.floor(durTotal / 60)}h {durTotal % 60}min</span>
          )}
        </div>

        {/* Chiste */}
        {(rodaje.chiste_imagen_url || rodaje.chiste_texto) && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-zinc-900">
            {rodaje.chiste_imagen_url && (
              <img src={rodaje.chiste_imagen_url} alt="Chiste" className="h-10 w-10 object-cover rounded" />
            )}
            {rodaje.chiste_texto && (
              <p className="text-xs text-zinc-500 italic">{rodaje.chiste_texto}</p>
            )}
          </div>
        )}
      </div>

      {/* PLAN */}
      {bloquesData.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 py-6">
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">Plan de rodaje</p>

          {/* Headers */}
          <div className="grid text-xs text-zinc-700 uppercase tracking-wider pb-1 border-b border-zinc-800 mb-1"
            style={{ gridTemplateColumns: '56px 48px 1fr 70px 36px 36px 52px 52px' }}>
            <span></span>
            <span></span>
            <span>Descripción</span>
            <span>Char #</span>
            <span className="text-center">D/N</span>
            <span className="text-center">I/E</span>
            <span className="text-center">Inicio</span>
            <span className="text-center">Fin</span>
          </div>

          {bloquesData.map((bloque: any, idx: number) => {
            const casc = cascada[idx]
            return (
              <div key={bloque.id}
                className="grid items-center py-2.5 border-b border-zinc-900 text-sm"
                style={{ gridTemplateColumns: '56px 48px 1fr 70px 36px 36px 52px 52px' }}
              >
                {/* Hora calculada */}
                <span className="text-xs text-zinc-600 font-mono">
                  {casc.inicio_min !== undefined ? minutosAHora(casc.inicio_min) : '—'}
                </span>

                {/* SCENES label */}
                <span>
                  {bloque.scenes_label && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-[2px]"
                      style={{ backgroundColor: bloque.scenes_color || '#353135', color: '#fff', fontSize: 9 }}>
                      {bloque.scenes_label}
                    </span>
                  )}
                </span>

                {/* Título + descripción */}
                <div>
                  <p className="text-zinc-100">{bloque.titulo}</p>
                  {bloque.descripcion && <p className="text-xs text-zinc-600 mt-0.5">{bloque.descripcion}</p>}
                  {bloque.nota_previa && <p className="text-xs text-zinc-600 italic mt-0.5">{bloque.nota_previa}</p>}
                </div>

                <span className="text-xs text-zinc-500">{bloque.character_num || ''}</span>
                <span className="text-xs text-zinc-500 text-center">{bloque.dia_noche || 'D'}</span>
                <span className="text-xs text-zinc-500 text-center">{bloque.interior_exterior || 'I'}</span>
                <span className="text-xs font-mono text-zinc-300 text-center">
                  {casc.inicio_min !== undefined ? minutosAHora(casc.inicio_min) : '—'}
                </span>
                <span className="text-xs font-mono text-zinc-300 text-center">
                  {casc.fin_min !== undefined ? minutosAHora(casc.fin_min) : '—'}
                </span>
              </div>
            )
          })}

          {durTotal > 0 && (
            <p className="text-xs text-zinc-600 text-right mt-3">
              Total: {Math.floor(durTotal / 60)}h {durTotal % 60}min
            </p>
          )}
        </div>
      )}

      {/* EQUIPO */}
      {equipo.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 pb-10">
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">Equipo técnico</p>
          <div className="divide-y divide-zinc-900 border-t border-zinc-800">
            {equipo.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm text-zinc-200">{p.nombre}</p>
                  <p className="text-xs text-zinc-600">{p.rol}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-zinc-300">
                    {formatHora(resolverHoraLlamado(p, rodaje)) || '—'}
                  </p>
                  {p.telefono && <p className="text-xs text-zinc-600">{p.telefono}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-900 px-4 py-4 text-center max-w-4xl mx-auto">
        <p className="text-xs text-zinc-800">Casa Hiedra · Hilván</p>
      </div>
    </div>
  )
}
