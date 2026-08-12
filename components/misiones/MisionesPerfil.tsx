import { getMisMisiones, getMisionesEquipo } from '@/app/actions/misiones'
import { hoyChile, lunesDeLaSemana } from '@/lib/misiones'
import TarjetaMision from '@/components/misiones/TarjetaMision'
import Pergamino from '@/components/ui/Pergamino'

function rotuloDia(iso: string, hoy: string): string {
  if (iso === hoy) return 'Hoy'
  const d = new Date(iso + 'T12:00:00')
  const txt = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

function rotuloSemana(lunes: string): string {
  const d = new Date(lunes + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
}


/**
 * Las misiones en /perfil: la semana completa, junto al resto de los logros.
 *
 * A diferencia del aviso del dashboard, acá sí se ven las de los días que
 * vienen: la semana se despacha por adelantado y poder mirarla entera es el
 * punto. Lo que no aparece en ninguna de las dos vistas son las vencidas.
 *
 * Cada lista va en su propio scroll acotado. Sin eso la sección medía 1.398px
 * con el panel de equipo abierto y empujaba las medallas fuera de la vista:
 * una sección que crece con la cantidad de gente termina tapando al resto de
 * la página.
 */
export default async function MisionesPerfil({ esAdmin }: { esAdmin: boolean }) {
  const [mias, equipo] = await Promise.all([
    getMisMisiones(),
    esAdmin ? getMisionesEquipo() : Promise.resolve([]),
  ])

  const hoy = hoyChile()
  const tengoAlgo = !!mias && (mias.semanal || mias.diarias.length > 0)
  const otros = equipo.filter(p => p.persona_id !== mias?.persona_id)

  if (!tengoAlgo && otros.length === 0) return null

  return (
    <Pergamino
      titulo="Tu semana"
      meta={`Semana del ${rotuloSemana(lunesDeLaSemana(hoy))}`}
    >

      {tengoAlgo && mias && (
        <div className="space-y-5">
          {mias.semanal && (
            <div>
              <p className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-green mb-2">
                Esta semana
              </p>
              <TarjetaMision mision={mias.semanal} />
            </div>
          )}

          {mias.diarias.map(m => (
            <div key={m.id}>
              <p className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-subtle mb-2">
                {rotuloDia(m.fecha_objetivo, hoy)}
              </p>
              <TarjetaMision mision={m} />
            </div>
          ))}
        </div>
      )}

      {/* Panel de equipo, solo admin. Sin totales ni conteos por persona: dos
          números comparables son un ranking con otro nombre. */}
      {otros.length > 0 && (
        <div className="mt-8 pt-6 border-t border-ch-border">
          <p className="font-body text-[9px] tracking-[0.5em] uppercase text-ch-subtle mb-4">
            El equipo
          </p>
          <div className="space-y-6">
            {otros.map(p => (
              <div key={p.persona_id}>
                <p className="font-body text-xs text-ch-muted mb-2">{p.nombre}</p>
                <div className="space-y-2">
                  {p.semanal && <TarjetaMision mision={p.semanal} soloLectura />}
                  {p.diarias
                    .filter(m => m.fecha_objetivo <= hoy)
                    .map(m => <TarjetaMision key={m.id} mision={m} soloLectura />)}
                  {!p.semanal && p.diarias.length === 0 && (
                    <p className="font-body text-xs text-ch-subtle">Sin misiones esta semana.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Pergamino>
  )
}
