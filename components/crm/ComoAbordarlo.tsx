'use client'

import type { CrmInsight, CrmInteraccion } from '@/types'
import { TIPO_INSIGHT_LABEL } from '@/types'

/**
 * "Cómo abordarlo": el porqué del próximo correo, donde Nati y Simón trabajan.
 *
 * Antes el operador investigaba la marca, leía su dossier y aplicaba las reglas
 * de la secuencia — y todo eso se quedaba en el chat. Ellos recibían el
 * borrador sin ver en qué se basaba, así que no podían corregirlo con criterio.
 *
 * Las reglas de secuencia vienen de la literatura, no de una opinión:
 * Rackham (SPIN, 35.000 llamadas) muestra que en ventas grandes presionar el
 * cierre PERJUDICA — cada contacto busca un AVANCE, no un cierre.
 * Ver la memoria del proyecto: reglas de outreach.
 */

const COLOR_TIPO: Record<string, string> = {
  investigacion: 'border-ch-green/40 text-ch-green',
  lectura:       'border-ch-gold/40 text-ch-gold',
  literatura:    'border-ch-border text-ch-muted',
}

/**
 * Qué corresponde en el PRÓXIMO toque. La tabla es la acordada con Tomás.
 *
 * `hechos` son las interacciones ya registradas, así que el próximo es
 * `hechos + 1`. Ojo con el off-by-one: con 1 toque hecho, lo que viene es el
 * toque 2, no el 1.
 */
function guia(hechos: number): { etapa: string; que: string } {
  const n = hechos + 1
  if (n === 1) return {
    etapa: 'Toque 1 · valor',
    que: 'Aportar algo útil sin pedir nada. Una observación precisa de su comunicación, qué mejoraría y por qué. Cierra sin CTA.',
  }
  if (n === 2) return {
    etapa: 'Toque 2 · valor',
    que: 'Sigue sin pedir nada. Acá cabe el video de Tomás, que en el primero competía con el mensaje.',
  }
  if (n <= 4) return {
    etapa: `Toque ${n} · pedir un avance`,
    que: 'Un avance es un compromiso concreto que mueve la cosa. Pregunta qué tendría que pasar para que avance — no "¿te parece agendar una reunión?".',
  }
  return {
    etapa: `Toque ${n} · reactivar`,
    que: 'No repitas el pitch. Una etiqueta ("parece que no es prioridad este trimestre") y una pregunta que se pueda responder con un no. Dos líneas.',
  }
}

interface Props {
  insights: CrmInsight[]
  interacciones: CrmInteraccion[]
}

export default function ComoAbordarlo({ insights, interacciones }: Props) {
  const n = interacciones.length
  const g = guia(n)
  const conRespuesta = interacciones.some(i => i.respondido)

  return (
    <div className="border border-ch-border bg-ch-surface/30 p-5">
      <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted mb-4">
        Cómo abordarlo
      </h2>

      {/* Dónde está en la secuencia */}
      <div className="border-l-2 border-ch-green pl-3 mb-5">
        <p className="font-body text-[9px] tracking-[0.25em] uppercase text-ch-green mb-1">{g.etapa}</p>
        <p className="font-body text-xs text-ch-cream leading-relaxed">{g.que}</p>
        {conRespuesta && (
          <p className="font-body text-xs text-ch-gold leading-relaxed mt-2">
            Ya respondió: si pidió precio, plazo o disponibilidad, cierra ahora — eso manda sobre el número de toque.
          </p>
        )}
      </div>

      {/* Lo averiguado */}
      {insights.length === 0 ? (
        <p className="font-body text-xs text-ch-subtle leading-relaxed">
          Sin insights todavía. El operador los deja acá cuando investiga la marca o lee su dossier,
          para que el borrador no llegue sin fundamento.
        </p>
      ) : (
        <div className="space-y-3">
          {insights.map(i => (
            <div key={i.id} className="border-t border-ch-border pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-start gap-2 mb-1 flex-wrap">
                <span className={`inline-block font-body text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 border ${COLOR_TIPO[i.tipo] ?? COLOR_TIPO.literatura}`}>
                  {TIPO_INSIGHT_LABEL[i.tipo] ?? i.tipo}
                </span>
                <p className="font-body text-xs text-ch-cream leading-relaxed flex-1 min-w-0">{i.titulo}</p>
              </div>
              {i.detalle && (
                <p className="font-body text-xs text-ch-muted leading-relaxed">{i.detalle}</p>
              )}
              {i.fuente && (
                i.fuente.startsWith('http') ? (
                  <a href={i.fuente} target="_blank" rel="noopener noreferrer"
                    className="font-body text-[10px] text-ch-subtle hover:text-ch-green transition-colors break-all">
                    {i.fuente}
                  </a>
                ) : (
                  <p className="font-body text-[10px] text-ch-subtle italic">{i.fuente}</p>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
