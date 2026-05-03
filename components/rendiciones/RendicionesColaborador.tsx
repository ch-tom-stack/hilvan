'use client'

import { useState } from 'react'
import { calcularRetencion } from '@/types'
import type { RendicionGasto } from '@/types'

const TIPO_LABEL: Record<string, string> = {
  honorarios: 'Honorarios', transporte: 'Transporte', alimentacion: 'Alimentación',
  arte: 'Arte / Props', insumos: 'Insumos', servicios: 'Servicios', viaticos: 'Viáticos', otro: 'Otro',
}

const ESTADO_COLOR: Record<string, string> = {
  borrador: 'text-ch-muted border-ch-border',
  enviada: 'text-amber-400 border-amber-500/30',
  aprobada: 'text-blue-400 border-blue-500/30',
  rechazada: 'text-red-400 border-red-500/30',
  pago_aprobado: 'text-ch-green border-ch-green/30',
}

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', enviada: 'Enviada', aprobada: 'En revisión',
  rechazada: 'Rechazada', pago_aprobado: 'Pagada',
}

interface Props {
  gastos: RendicionGasto[]
}

export default function RendicionesColaborador({ gastos }: Props) {
  return (
    <div className="p-4 lg:p-10 max-w-lg mx-auto">
      <div className="mb-8">
        <h1 className="font-display italic text-3xl text-ch-cream">Mis gastos</h1>
      </div>

      {gastos.length === 0 ? (
        <div className="border border-dashed border-ch-border p-12 text-center">
          <p className="text-ch-muted font-body text-sm">No hay gastos registrados aún.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gastos.map(g => {
            const cfg = ESTADO_COLOR[g.estado]
            const retencion = g.tipo_documento ? calcularRetencion(g) : null
            const itemNombre = (g.cotizacion_item as any)?.nombre

            return (
              <div key={g.id} className="border border-ch-border bg-ch-surface/10 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-body text-sm text-ch-cream">{g.descripcion}</p>
                    <p className="font-body text-[10px] text-ch-muted mt-0.5">
                      {TIPO_LABEL[g.tipo] || g.tipo}
                      {itemNombre && ` · ${itemNombre}`}
                    </p>
                  </div>
                  <span className={`font-body text-[9px] tracking-wider px-2 py-0.5 border whitespace-nowrap ${cfg}`}>
                    {ESTADO_LABEL[g.estado]}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-body text-base text-ch-cream font-mono">${g.monto.toLocaleString('es-CL')}</span>
                    {retencion && retencion.retencion > 0 && (
                      <span className="font-body text-[10px] text-ch-muted ml-2">
                        → neto ${retencion.neto.toLocaleString('es-CL')}
                      </span>
                    )}
                  </div>
                  {g.foto_url && (
                    <a href={g.foto_url} target="_blank" rel="noopener noreferrer"
                      className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors">
                      Ver doc →
                    </a>
                  )}
                </div>

                {g.estado === 'rechazada' && g.motivo_rechazo && (
                  <p className="font-body text-[10px] text-red-400 mt-2 border-t border-ch-border/50 pt-2">
                    Motivo: {g.motivo_rechazo}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
