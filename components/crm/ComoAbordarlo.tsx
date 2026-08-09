'use client'

import type { CrmInsight, CrmInteraccion } from '@/types'
import { TIPO_INSIGHT_LABEL } from '@/types'
import { temperaturaDe, TEMPERATURA_LABELS, TEMPERATURA_GLOSA, TEMPERATURA_TEXTO } from '@/lib/crm-temperatura'

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
 *
 * La escalera DEPENDE del origen. A un entrante —llenó La Lectura, escribió por
 * el sitio, se acercó en una feria— mandarle el toque 1 de valor es no haberlo
 * escuchado: ya levantó la mano. En Rackham, la fase de descubrimiento ya
 * ocurrió, así que el avance se pide antes.
 */
function guiaFria(n: number): { etapa: string; que: string } {
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

function guiaEntrante(n: number): { etapa: string; que: string } {
  if (n === 1) return {
    etapa: 'Toque 1 · responder',
    que: 'Llegaron ellos. No abras con un correo de valor: responde lo que preguntaron, concreto y corto. Acá la velocidad rinde más que la elaboración.',
  }
  if (n === 2) return {
    etapa: 'Toque 2 · pedir un avance',
    que: 'El interés ya está declarado, así que el avance se pide antes que en frío. Qué tendría que pasar para que esto avance — sin volver a presentarse.',
  }
  if (n <= 4) return {
    etapa: `Toque ${n} · avance concreto`,
    que: 'Ya van varios sin cerrar. Propón algo específico y chico: una fecha, un alcance acotado, un número. Vago se responde vago.',
  }
  return {
    etapa: `Toque ${n} · reactivar`,
    que: 'Se enfrió alguien que había levantado la mano — eso vale la pena nombrarlo. "Parece que quedó en nada por ahora, ¿es mala idea retomarlo en un par de meses?".',
  }
}

interface Props {
  insights: CrmInsight[]
  interacciones: CrmInteraccion[]
  /** Decide la escalera: un entrante no parte con el toque 1 de valor. */
  origen?: string | null
}

export default function ComoAbordarlo({ insights, interacciones, origen }: Props) {
  const n = interacciones.length + 1
  const temp = temperaturaDe(origen)
  // Sin origen registrado se usa la escalera fría, que es la conservadora: si
  // resulta ser entrante, un correo de valor de más molesta menos que pedirle
  // un avance a alguien que nunca habló con nosotros.
  const g = temp === 'entrante' ? guiaEntrante(n) : guiaFria(n)
  const conRespuesta = interacciones.some(i => i.respondido)

  return (
    <div className="border border-ch-border bg-ch-surface/30 p-5">
      <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted mb-4">
        Cómo abordarlo
      </h2>

      {/* De dónde salió: es lo que decide la secuencia de abajo */}
      <div className="flex items-baseline gap-2 mb-3 flex-wrap">
        <span className={`inline-block font-body text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 border border-current ${TEMPERATURA_TEXTO[temp]}`}>
          {TEMPERATURA_LABELS[temp]}
        </span>
        <span className="font-body text-[11px] text-ch-muted">{TEMPERATURA_GLOSA[temp]}</span>
      </div>

      {/* Dónde está en la secuencia */}
      <div className="border-l-2 border-ch-green pl-3 mb-5">
        <p className="font-body text-[9px] tracking-[0.25em] uppercase text-ch-green mb-1">{g.etapa}</p>
        <p className="font-body text-xs text-ch-cream leading-relaxed">{g.que}</p>
        {conRespuesta && (
          <p className="font-body text-xs text-ch-gold leading-relaxed mt-2">
            Ya respondió: si pidió precio, plazo o disponibilidad, cierra ahora — eso manda sobre el número de toque.
          </p>
        )}
        {temp === 'sin_clasificar' && (
          <p className="font-body text-xs text-ch-gold leading-relaxed mt-2">
            Sin origen registrado, así que esta es la secuencia fría por defecto. Si llegaron ellos,
            completa el origen en la ficha: la secuencia es otra.
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
