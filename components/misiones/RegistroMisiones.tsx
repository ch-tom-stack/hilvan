import { getMisionesCumplidas } from '@/app/actions/misiones'
import Pergamino from '@/components/ui/Pergamino'

function rotuloSemana(lunes: string): string {
  const l = new Date(lunes + 'T12:00:00')
  const d = new Date(l); d.setDate(d.getDate() + 6)
  const mismoMes = l.getMonth() === d.getMonth()
  const mes = (x: Date) => x.toLocaleDateString('es-CL', { month: 'long' })
  return mismoMes
    ? `${l.getDate()} al ${d.getDate()} de ${mes(l)}`
    : `${l.getDate()} de ${mes(l)} al ${d.getDate()} de ${mes(d)}`
}

/**
 * Lo que ya cumpliste, semana por semana.
 *
 * Existe porque las misiones se guardaban y no se veían: cada lunes la semana
 * anterior desaparecía de la vista aunque la fila siguiera en la tabla. Lo
 * hecho es el logro de la persona y tiene que quedar en alguna parte.
 *
 * **Sólo lo cumplido, nunca lo vencido.** Es la misma asimetría del resto del
 * sistema, y es lo que separa un registro de logros de una libreta de notas.
 *
 * Nace enrollado: es historia, no lo de hoy. Quien quiera mirarla la abre.
 *
 * Se solapa a propósito con "Tu semana": lo cumplido esta semana sale en los
 * dos, pero no en la misma forma —allá la tarjeta completa con su fuente,
 * acá una línea con un visto—. Excluir la semana en curso habría hecho que el
 * registro naciera vacío el día del estreno.
 */
export default async function RegistroMisiones() {
  const semanas = await getMisionesCumplidas()
  if (semanas.length === 0) return null

  const total = semanas.reduce((n, s) => n + s.misiones.length, 0)

  return (
    <Pergamino
      titulo="Lo cumplido"
      meta={`${total} ${total === 1 ? 'misión' : 'misiones'}`}
      abierto={false}
    >
      <div className="space-y-7">
        {semanas.map(semana => (
          <div key={semana.lunes}>
            <p className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-subtle mb-3">
              {rotuloSemana(semana.lunes)}
            </p>
            <ul className="space-y-2.5">
              {semana.misiones.map(m => (
                <li key={m.id} className="flex items-start gap-3">
                  {/* El visto va en verde y sin caja: acá no hay nada que
                      marcar, sólo constancia de que se hizo. */}
                  <svg
                    viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0 mt-1 text-ch-green"
                    fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="square"
                    aria-hidden
                  >
                    <path d="M3 8.5l3.2 3.2L13 5" />
                  </svg>
                  <div className="min-w-0">
                    <p className="font-body text-[13px] leading-relaxed text-ch-muted">{m.texto}</p>
                    {m.tipo === 'semanal' && (
                      <p className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-gold mt-1">
                        Semanal
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Pergamino>
  )
}
