import { getCitacionPublica, responderCitacion } from '@/app/actions/rodaje'
import { formatHora, resolverHoraLlamado, generarLinkUber, Rodaje, RodajeEquipoTecnico } from '@/types'
import { notFound } from 'next/navigation'

export default async function CitacionPublicaPage({ params }: { params: { token: string } }) {
  let citacion: any
  try {
    citacion = await getCitacionPublica(params.token)
  } catch {
    notFound()
  }

  const rodaje = citacion.rodaje as Rodaje
  const persona = citacion.persona as RodajeEquipoTecnico
  const horaEfectiva = formatHora(resolverHoraLlamado(persona, rodaje))
  const uberLink = generarLinkUber(rodaje)
  const yaRespondio = !!citacion.respondida_at

  const fecha = rodaje.fecha
    ? new Date(rodaje.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  // Escenas visibles según visibilidad_plan
  const escenas = (rodaje.escenas || []).filter((e: any) => {
    if (rodaje.visibilidad_plan === 'ninguna') return false
    if (rodaje.visibilidad_plan === 'completo') return true
    return e.visible_en_citacion
  })

  // Si es jefe, mostrar miembros del departamento
  const miembrosDept = persona.es_jefe_departamento && persona.departamento_id
    ? (citacion.persona?.miembros_departamento || []).filter((m: any) => m.id !== persona.id)
    : []

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-900 px-6 py-4 flex items-center justify-between">
        <img src="/logos/logo-horizontal-negro.png" alt="Casa Hiedra" className="h-5 opacity-80 invert" />
        <span className="text-xs text-zinc-600">Citación de rodaje</span>
      </div>

      <div className="max-w-xl mx-auto px-6 py-10 space-y-8">

        {/* Saludo */}
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Hola,</p>
          <h1 className="text-2xl font-medium text-zinc-100">{persona.nombre}</h1>
          {persona.rol && <p className="text-sm text-zinc-500 mt-0.5">{persona.rol}</p>}
        </div>

        {/* Card principal */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-[2px] p-6 space-y-4">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Producción</p>
            <p className="text-base font-medium text-zinc-100">{rodaje.nombre}</p>
          </div>

          {fecha && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Fecha</p>
              <p className="text-sm text-zinc-200 capitalize">{fecha}</p>
              {!rodaje.fecha_confirmada && (
                <p className="text-xs text-amber-500 mt-0.5">Fecha por confirmar</p>
              )}
            </div>
          )}

          <div>
            <p className="text-xs text-zinc-500 mb-1">Tu hora de llegada</p>
            <p className="text-3xl font-medium text-zinc-100">{horaEfectiva}</p>
          </div>

          {(rodaje.locacion_nombre || rodaje.locacion_direccion) && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Locación</p>
              {rodaje.locacion_nombre && <p className="text-sm text-zinc-200">{rodaje.locacion_nombre}</p>}
              {rodaje.locacion_direccion && <p className="text-xs text-zinc-500 mt-0.5">{rodaje.locacion_direccion}</p>}
              {uberLink && (
                <a
                  href={uberLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-xs bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded-[2px] text-zinc-300 hover:border-zinc-500 transition-colors"
                >
                  Abrir en Uber →
                </a>
              )}
            </div>
          )}
        </div>

        {/* Miembros del departamento (solo jefes) */}
        {miembrosDept.length > 0 && (
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
              Tu departamento — {persona.departamento?.nombre}
            </p>
            <div className="space-y-2">
              {miembrosDept.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-[2px] px-4 py-3">
                  <div>
                    <p className="text-sm text-zinc-200">{m.nombre}</p>
                    {m.rol && <p className="text-xs text-zinc-500">{m.rol}</p>}
                  </div>
                  <span className="text-sm text-zinc-300">
                    {m.hora_llamado_individual ? formatHora(m.hora_llamado_individual) : formatHora(rodaje.hora_llamado_general)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plan del día */}
        {escenas.length > 0 && (
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Plan del día</p>
            <div className="space-y-2">
              {escenas.map((e: any, i: number) => (
                <div key={e.id} className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-[2px] px-4 py-3">
                  <span className="text-xs text-zinc-700 w-4 pt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-zinc-200">{e.titulo}</p>
                      {e.hora_estimada && (
                        <span className="text-xs text-zinc-500">{formatHora(e.hora_estimada)}</span>
                      )}
                      {e.duracion_min && (
                        <span className="text-xs text-zinc-700">{e.duracion_min} min</span>
                      )}
                    </div>
                    {e.descripcion && <p className="text-xs text-zinc-600 mt-0.5">{e.descripcion}</p>}
                    {e.locacion_especifica && <p className="text-xs text-zinc-700 mt-0.5">📍 {e.locacion_especifica}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formulario de respuesta */}
        <div className="border-t border-zinc-800 pt-8">
          {yaRespondio ? (
            <div className={`rounded-[2px] p-5 text-center ${citacion.confirmada ? 'bg-emerald-950/40 border border-emerald-900' : 'bg-zinc-900 border border-zinc-800'}`}>
              <p className="text-sm font-medium text-zinc-100 mb-1">
                {citacion.confirmada ? '✓ Asistencia confirmada' : 'Has indicado que no puedes asistir'}
              </p>
              {citacion.restricciones_alimentarias && (
                <p className="text-xs text-zinc-500">
                  Restricciones registradas: {citacion.restricciones_alimentarias}
                </p>
              )}
              <p className="text-xs text-zinc-600 mt-3">
                Si necesitas cambiar tu respuesta, contacta al equipo de producción.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-zinc-300 mb-5">Confirma tu asistencia e indícanos si tienes restricciones alimentarias.</p>
              <form className="space-y-5">
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">Restricciones alimentarias</label>
                  <input
                    name="restricciones_alimentarias"
                    placeholder="ej: vegetariano, sin gluten, alergia a los mariscos... (opcional)"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <BotonRespuesta token={params.token} confirmada={true} label="✓ Confirmo mi asistencia" clase="bg-[#E6E2ED] text-zinc-900 hover:bg-white" />
                  <BotonRespuesta token={params.token} confirmada={false} label="No puedo asistir" clase="bg-zinc-900 border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200" />
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-900 pt-6 text-center">
          <p className="text-xs text-zinc-700">Casa Hiedra · casahiedra.com</p>
        </div>
      </div>
    </div>
  )
}

// Botón con server action inline
function BotonRespuesta({ token, confirmada, label, clase }: {
  token: string
  confirmada: boolean
  label: string
  clase: string
}) {
  return (
    <form
      action={async (fd: FormData) => {
        'use server'
        await responderCitacion(token, fd)
      }}
    >
      <input type="hidden" name="confirmada" value={confirmada ? 'true' : 'false'} />
      <button
        type="submit"
        className={`w-full text-sm font-medium px-5 py-3 rounded-[2px] transition-colors ${clase}`}
      >
        {label}
      </button>
    </form>
  )
}
