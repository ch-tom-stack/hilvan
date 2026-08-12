'use client'

import { useEffect, useRef, useState } from 'react'
import { getRitmo, type EstadoRitmo } from '@/app/actions/medallas'
import { DIAS_HABILES, ritmoDe, variacion } from '@/lib/ritmo'
import { contar } from '@/lib/animar'
import { formatFecha } from '@/lib/fechas'

/**
 * El rango del período, al lado del histórico.
 *
 * El histórico sólo sube: a los seis meses deja de decir nada sobre cómo vas
 * ahora. Este puede bajar, y por eso es el que informa.
 *
 * Cuenta actividad en TODA la app, no sólo captación: una semana de rodaje
 * daría cero si midiera contactos, y la persona estaría trabajando a full.
 */
export default function RitmoActual() {
  const [estado, setEstado] = useState<EstadoRitmo | null>(null)
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let vivo = true
    getRitmo().then(r => { if (vivo) setEstado(r) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (estado) contar(ref.current, estado.actividad, n => String(Math.round(n)))
  }, [estado])

  if (!estado) return null

  const { actual, siguiente, fraccion } = ritmoDe(estado.actividad)
  const v = variacion(estado.actividad, estado.anterior)

  return (
    <div className="border border-ch-border bg-ch-black/20 p-4 mt-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2.5">
          <p ref={ref} className="font-display italic text-2xl text-ch-cream leading-none tabular-nums">
            {estado.actividad}
          </p>
          <p className="font-body text-[10px] tracking-[0.25em] uppercase text-ch-green">{actual.titulo}</p>
        </div>
        <span className="font-body text-[10px] tracking-[0.15em] uppercase text-ch-subtle">
          últimos {DIAS_HABILES} días hábiles
        </span>
      </div>

      <p className="font-body text-[11px] text-ch-muted italic mt-1.5">{actual.glosa}</p>

      {/* La comparación es contra TU período anterior, no contra nadie más. */}
      {(estado.actividad > 0 || estado.anterior > 0) && (
        <p className={`font-body text-[10px] tracking-[0.15em] uppercase mt-1.5 ${
          v.signo === '+' ? 'text-ch-green' : v.signo === '−' ? 'text-ch-subtle' : 'text-ch-subtle'
        }`}>
          {v.signo === '=' ? 'igual que el período anterior' : `${v.signo}${v.delta} vs. el período anterior`}
        </p>
      )}

      {estado.detalle.length > 0 && (
        <p className="font-body text-[10px] text-ch-subtle mt-2">
          {estado.detalle.map(d => `${d.n} ${d.etiqueta}`).join(' · ')}
        </p>
      )}

      {siguiente && (
        <div className="mt-3">
          <div className="w-full h-px bg-ch-border relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-ch-green/60 ch-bar-fill"
              style={{ width: `${Math.round(fraccion * 100)}%`, ['--w' as string]: `${Math.round(fraccion * 100)}%` }}
            />
          </div>
          <p className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle mt-1.5">
            {siguiente.desde - estado.actividad} para {siguiente.titulo} · desde el {formatFecha(estado.desde)}
          </p>
        </div>
      )}
    </div>
  )
}
