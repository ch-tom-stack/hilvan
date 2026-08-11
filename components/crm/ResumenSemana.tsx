'use client'

import { useEffect, useRef } from 'react'
import type { ResumenSemana as Datos } from '@/app/actions/crm'
import { contar } from '@/lib/animar'
import { formatFecha } from '@/lib/fechas'

/**
 * Lo que lleva el equipo esta semana.
 *
 * Existe porque la Agenda cierra el día y ahí muere: el trabajo no se acumulaba
 * en ninguna parte. Cuenta de lunes a hoy, no los últimos 7 días — una semana
 * se puede cerrar, una ventana móvil no termina nunca.
 *
 * NO es una racha, a propósito. Una racha castiga la ausencia y con un equipo
 * de cuatro y fines de semana se rompe sola.
 */
export default function ResumenSemana({ datos }: { datos: Datos }) {
  // Sin nada registrado no se muestra: un tablero en cero al empezar la semana
  // no informa, sólo señala lo que falta.
  if (datos.contactos === 0) return null

  return (
    <div className="border border-ch-border bg-ch-surface/20 mb-6 px-4 py-3">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">
          Esta semana
        </p>
        <p className="font-body text-[10px] text-ch-subtle">
          desde el {formatFecha(datos.desde)}
        </p>
      </div>

      <div className="flex items-baseline gap-x-8 gap-y-2 mt-2 flex-wrap">
        <Dato n={datos.contactos} label={datos.contactos === 1 ? 'contacto' : 'contactos'} acento />
        <Dato n={datos.marcas} label={datos.marcas === 1 ? 'marca' : 'marcas'} />
        {datos.respondieron > 0 && (
          <Dato n={datos.respondieron} label={datos.respondieron === 1 ? 'respondió' : 'respondieron'} oro />
        )}
      </div>
    </div>
  )
}

function Dato({ n, label, acento, oro }: { n: number; label: string; acento?: boolean; oro?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => contar(ref.current, n, v => String(Math.round(v))), [n])
  const color = oro ? 'text-ch-gold' : acento ? 'text-ch-green' : 'text-ch-cream'
  return (
    <span className="flex items-baseline gap-1.5">
      {/* El valor va en el HTML y `contar` lo sobreescribe desde 0: existe sin
          JS y no parpadea. */}
      <span ref={ref} className={`font-display italic text-2xl leading-none tabular-nums ${color}`}>{n}</span>
      <span className="font-body text-[10px] tracking-[0.2em] uppercase text-ch-subtle">{label}</span>
    </span>
  )
}
