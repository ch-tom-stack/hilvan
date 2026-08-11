'use client'

import { useEffect, useState } from 'react'
import { revisarMedallas, type EstadoMedallas } from '@/app/actions/medallas'
import { MEDALLAS, progresoMedalla } from '@/lib/crm-medallas'
import { momento } from '@/lib/momentos'
import { formatFecha } from '@/lib/fechas'

/**
 * Vitrina personal de medallas.
 *
 * Las no ganadas se muestran igual, con su criterio a la vista: una medalla
 * que aparece por algo que no sabías que estabas haciendo se siente arbitraria.
 * La gracia está en verla venir.
 *
 * Ninguna compara personas — ver lib/crm-medallas.ts.
 */
export default function Medallas() {
  const [estado, setEstado] = useState<EstadoMedallas | null>(null)

  useEffect(() => {
    let vivo = true
    revisarMedallas().then(e => {
      if (!vivo) return
      setEstado(e)
      // Celebrar sólo lo que se acaba de registrar. La acción es idempotente,
      // así que recargar la página no vuelve a celebrar nada.
      for (const clave of e.nuevas) {
        const def = MEDALLAS.find(m => m.clave === clave)
        if (def) momento('hito.alcanzado', { mensaje: `Medalla: ${def.titulo}` })
      }
    }).catch(() => { /* sin medallas es un degradado aceptable */ })
    return () => { vivo = false }
  }, [])

  if (!estado) return null

  const ganadas = new Map(estado.ganadas.map(g => [g.medalla, g.ganada_en]))

  return (
    <div className="border border-ch-border bg-ch-surface/30 p-5">
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted">Medallas</h2>
        <span className="font-body text-[10px] text-ch-subtle tabular-nums">
          {ganadas.size} de {MEDALLAS.length}
        </span>
      </div>
      <p className="font-body text-[11px] text-ch-subtle mb-4 max-w-prose">
        Son sobre tu propia historia: ninguna te compara con el resto del equipo.
        Cuentan desde que se registró quién hace cada contacto — lo anterior no
        tiene autor y no se le puede atribuir a nadie.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {MEDALLAS.map((m, i) => {
          const fecha = ganadas.get(m.clave)
          const p = fecha ? null : progresoMedalla(m.clave, estado.datos)
          return (
            <div
              key={m.clave}
              style={{ ['--i' as string]: i }}
              className={`border p-3 ch-fade-up ch-stagger ${
                fecha ? 'border-ch-green/40 bg-ch-green/5' : 'border-ch-border'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className={`font-display italic text-lg leading-tight ${fecha ? 'text-ch-cream' : 'text-ch-subtle'}`}>
                  {m.titulo}
                </p>
                {fecha && (
                  <span className="font-body text-[9px] tracking-[0.15em] uppercase text-ch-green shrink-0">
                    {formatFecha(fecha)}
                  </span>
                )}
              </div>
              <p className={`font-body text-[11px] leading-relaxed mt-1 ${fecha ? 'text-ch-muted' : 'text-ch-subtle'}`}>
                {m.criterio}
              </p>
              {m.nota && (
                <p className="font-body text-[10px] text-ch-subtle/80 italic mt-1">{m.nota}</p>
              )}

              {/* Sólo las de conteo muestran barra: un "60% de que te respondan"
                  no significa nada y fingir precisión es peor que no mostrar. */}
              {p !== null && p > 0 && (
                <div className="w-full h-px bg-ch-border relative mt-2 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-ch-muted ch-bar-fill"
                    style={{ width: `${Math.round(p * 100)}%`, ['--w' as string]: `${Math.round(p * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
