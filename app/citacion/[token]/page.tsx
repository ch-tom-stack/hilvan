import { getCitacionPublica, responderCitacion } from '@/app/actions/rodaje'
import { formatHora, resolverHoraLlamado, generarLinkUber, Rodaje, RodajeEquipoTecnico } from '@/types'
import { notFound } from 'next/navigation'

export default async function CitacionPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let citacion: any
  try {
    citacion = await getCitacionPublica(token)
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

  const escenas = (rodaje.escenas || []).filter((e: any) => {
    if (rodaje.visibilidad_plan === 'ninguna') return false
    if (rodaje.visibilidad_plan === 'completo') return true
    return e.visible_en_citacion
  })

  const miembrosDept = persona.es_jefe_departamento && persona.departamento_id
    ? (citacion.persona?.miembros_departamento || []).filter((m: any) => m.id !== persona.id)
    : []

  return (
    <div className="min-h-screen bg-ch-black text-ch-cream">
      {/* Header */}
      <div className="border-b border-ch-border px-6 py-4 flex items-center justify-between">
        <img src="/logos/logo-horizontal-negro.png" alt="Casa Hiedra" className="h-5 opacity-80 invert" />
        <span className="font-body text-[10px] tracking-[0.4em] uppercase text-ch-subtle">Citación de rodaje</span>
      </div>

      <div className="max-w-xl mx-auto px-6 py-10 space-y-8">

        {/* Saludo */}
        <div>
          <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-2">Hola,</p>
          <h1 className="font-display italic text-4xl text-ch-cream leading-none">{persona.nombre}</h1>
          {persona.rol && <p className="font-body text-sm text-ch-muted mt-1.5">{persona.rol}</p>}
        </div>

        {/* Card principal */}
        <div className="bg-ch-surface border border-ch-border p-6 space-y-5">
          <div>
            <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-1.5">Producción</p>
            <p className="font-body text-sm text-ch-cream">{rodaje.nombre}</p>
          </div>

          {fecha && (
            <div>
              <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-1.5">Fecha</p>
              <p className="font-body text-sm text-ch-cream capitalize">{fecha}</p>
              {!rodaje.fecha_confirmada && (
                <p className="font-body text-[10px] text-ch-gold mt-1">Fecha por confirmar</p>
              )}
            </div>
          )}

          <div>
            <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-1.5">Tu hora de llegada</p>
            <p className="font-display italic text-5xl text-ch-cream leading-none">{horaEfectiva}</p>
          </div>

          {(rodaje.locacion_nombre || rodaje.locacion_direccion) && (
            <div>
              <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-1.5">Locación</p>
              {rodaje.locacion_nombre && <p className="font-body text-sm text-ch-cream">{rodaje.locacion_nombre}</p>}
              {rodaje.locacion_direccion && <p className="font-body text-xs text-ch-muted mt-0.5">{rodaje.locacion_direccion}</p>}
              {uberLink && (
                <a
                  href={uberLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 font-body text-[10px] tracking-[0.3em] uppercase bg-ch-dark border border-ch-border px-3 py-1.5 text-ch-muted hover:border-ch-muted hover:text-ch-cream transition-colors"
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
            <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-3">
              Tu departamento — {persona.departamento?.nombre}
            </p>
            <div className="space-y-2">
              {miembrosDept.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between bg-ch-surface border border-ch-border px-4 py-3">
                  <div>
                    <p className="font-body text-sm text-ch-cream">{m.nombre}</p>
                    {m.rol && <p className="font-body text-xs text-ch-muted">{m.rol}</p>}
                  </div>
                  <span className="font-body text-sm text-ch-cream">
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
            <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-3">Plan del día</p>
            <div className="space-y-2">
              {escenas.map((e: any, i: number) => (
                <div key={e.id} className="flex gap-4 bg-ch-surface border border-ch-border px-4 py-3">
                  <span className="font-body text-xs text-ch-subtle w-4 pt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-body text-sm text-ch-cream">{e.titulo}</p>
                      {e.hora_estimada && (
                        <span className="font-body text-xs text-ch-muted">{formatHora(e.hora_estimada)}</span>
                      )}
                      {e.duracion_min && (
                        <span className="font-body text-xs text-ch-subtle">{e.duracion_min} min</span>
                      )}
                    </div>
                    {e.descripcion && <p className="font-body text-xs text-ch-subtle mt-0.5">{e.descripcion}</p>}
                    {e.locacion_especifica && <p className="font-body text-xs text-ch-subtle mt-0.5">📍 {e.locacion_especifica}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formulario de respuesta */}
        <div className="border-t border-ch-border pt-8">
          {yaRespondio ? (
            <div className={`p-5 text-center ${citacion.confirmada ? 'bg-ch-green/10 border border-ch-green/30' : 'bg-ch-surface border border-ch-border'}`}>
              <p className="font-body text-sm text-ch-cream mb-1">
                {citacion.confirmada ? '✓ Asistencia confirmada' : 'Has indicado que no puedes asistir'}
              </p>
              {citacion.restricciones_alimentarias && (
                <p className="font-body text-xs text-ch-muted mt-1">
                  Restricciones registradas: {citacion.restricciones_alimentarias}
                </p>
              )}
              <p className="font-body text-xs text-ch-subtle mt-3">
                Si necesitas cambiar tu respuesta, contacta al equipo de producción.
              </p>
            </div>
          ) : (
            <div>
              <p className="font-body text-sm text-ch-cream mb-5">Confirma tu asistencia e indícanos si tienes restricciones alimentarias.</p>
              <div className="flex flex-col gap-3">
                <BotonConfirmar token={token} />
                <BotonDeclinar token={token} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-ch-border pt-6 text-center">
          <p className="font-body text-[10px] text-ch-subtle tracking-[0.3em]">Casa Hiedra · casahiedra.com</p>
        </div>
      </div>
    </div>
  )
}

function BotonConfirmar({ token }: { token: string }) {
  return (
    <form
      action={async (fd: FormData) => {
        'use server'
        await responderCitacion(token, fd)
      }}
      className="space-y-3"
    >
      <input type="hidden" name="confirmada" value="true" />
      <div>
        <label className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted block mb-1.5">
          Restricciones alimentarias
        </label>
        <input
          name="restricciones_alimentarias"
          placeholder="vegetariano, sin gluten, alergia a mariscos… (opcional)"
          className="w-full bg-ch-dark border border-ch-border px-3 py-2 font-body text-sm text-ch-cream placeholder:text-ch-subtle focus:outline-none focus:border-ch-green"
        />
      </div>
      <button
        type="submit"
        className="w-full font-body text-[10px] tracking-[0.4em] uppercase px-5 py-3 transition-colors bg-ch-green text-ch-black hover:bg-ch-green-light"
      >
        ✓ Confirmo mi asistencia
      </button>
    </form>
  )
}

function BotonDeclinar({ token }: { token: string }) {
  return (
    <form
      action={async (fd: FormData) => {
        'use server'
        await responderCitacion(token, fd)
      }}
    >
      <input type="hidden" name="confirmada" value="false" />
      <button
        type="submit"
        className="w-full font-body text-[10px] tracking-[0.4em] uppercase px-5 py-3 transition-colors bg-ch-surface border border-ch-border text-ch-muted hover:border-ch-muted hover:text-ch-cream"
      >
        No puedo asistir
      </button>
    </form>
  )
}
