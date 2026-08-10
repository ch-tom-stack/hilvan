'use client'

import { useMemo } from 'react'
import type { Prospecto } from '@/types'

interface Props {
  prospectos: Prospecto[]
  /** Pool de operadores: aparecen todos, incluso los que hoy no tienen nada. */
  operadores: { id: string; nombre: string }[]
}

/**
 * Progreso del equipo — solo lo ve quien gestiona.
 *
 * Muestra lo que falta HOY por persona, no un ranking de producción histórica:
 * un ranking premia al que tiene más prospectos asignados, que es una decisión
 * del reparto y no un mérito. Lo accionable es quién quedó con la lista larga.
 */
export default function ProgresoEquipo({ prospectos, operadores }: Props) {
  const filas = useMemo(() => (
    operadores.map(op => {
      const suyos = prospectos.filter(
        p => p.responsable?.id === op.id && p.etapa !== 'descartado' && p.etapa !== 'confirmado',
      )
      const pendientes = suyos.filter(p => p.cadencia?.pendiente)
      return {
        id: op.id,
        nombre: op.nombre,
        pendientes: pendientes.length,
        respondieron: pendientes.filter(p => p.cadencia?.estado === 'respondio').length,
        atrasados: pendientes.filter(p => (p.cadencia?.diasAtraso ?? 0) > 0).length,
        cartera: suyos.length,
      }
    })
  ), [prospectos, operadores])

  const totalPend = filas.reduce((s, f) => s + f.pendientes, 0)
  if (filas.length === 0) return null

  return (
    <div className="border border-ch-border bg-ch-surface/20 mb-6">
      <div className="flex items-center justify-between gap-4 px-4 pt-3.5 pb-2">
        <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">
          El equipo hoy
        </p>
        <span className="font-body text-[10px] tracking-[0.15em] uppercase text-ch-subtle tabular-nums">
          {totalPend} pendiente{totalPend === 1 ? '' : 's'}
        </span>
      </div>

      <div className="divide-y divide-ch-border/60 border-t border-ch-border/60">
        {filas.map(f => (
          <div key={f.id} className="flex items-center gap-4 px-4 py-2">
            <span className="font-body text-xs text-ch-cream w-24 shrink-0 truncate">{f.nombre}</span>

            <span className={`font-body text-[11px] tabular-nums shrink-0 ${f.pendientes ? 'text-ch-cream' : 'text-ch-subtle'}`}>
              {f.pendientes === 0 ? 'al día' : `${f.pendientes} por contactar`}
            </span>

            {f.respondieron > 0 && (
              <span className="font-body text-[10px] tracking-[0.15em] uppercase text-ch-gold shrink-0">
                {f.respondieron} respondió
              </span>
            )}
            {f.atrasados > 0 && (
              <span className="font-body text-[10px] tracking-[0.15em] uppercase text-ch-subtle shrink-0">
                {f.atrasados} atrasado{f.atrasados === 1 ? '' : 's'}
              </span>
            )}

            <span className="font-body text-[10px] text-ch-subtle ml-auto shrink-0 tabular-nums">
              cartera {f.cartera}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
