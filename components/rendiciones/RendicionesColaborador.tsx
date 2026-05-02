'use client'

import { useState, useTransition } from 'react'
import { eliminarRendicion } from '@/app/actions/rendiciones'
import { calcularRetencion } from '@/types'
import type { Rendicion } from '@/types'
import FormularioRendicion from './FormularioRendicion'

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
  colaboradorId?: string
  rendiciones: Rendicion[]
  cotizaciones: any[]
  rendicionesPorItem: Record<string, number>
}

export default function RendicionesColaborador({ colaboradorId, rendiciones: inicial, cotizaciones, rendicionesPorItem }: Props) {
  const [rendiciones, setRendiciones] = useState(inicial)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSuccess = (nueva: Rendicion) => {
    setRendiciones(prev => [nueva, ...prev])
    setMostrarForm(false)
  }

  return (
    <div className="p-4 lg:p-10 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display italic text-3xl text-ch-cream">Mis rendiciones</h1>
        <button onClick={() => setMostrarForm(!mostrarForm)}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
          + Agregar gasto
        </button>
      </div>

      {mostrarForm && (
        <div className="border border-ch-border bg-ch-surface/20 p-5 mb-6">
          <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-4">Nuevo gasto</p>
          <FormularioRendicion
            cotizaciones={cotizaciones}
            colaboradorId={colaboradorId}
            rendicionesPorItem={rendicionesPorItem}
            onSuccess={handleSuccess}
            onCancel={() => setMostrarForm(false)}
          />
        </div>
      )}

      {rendiciones.length === 0 ? (
        <div className="border border-dashed border-ch-border p-12 text-center">
          <p className="text-ch-muted font-body text-sm">No hay rendiciones aún.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rendiciones.map(r => {
            const cfg = ESTADO_COLOR[r.estado]
            const retencion = r.tipo_documento ? calcularRetencion(r) : null
            const cotNombre = (r.cotizacion as any)?.nombre
            const itemNombre = (r.cotizacion_item as any)?.nombre

            return (
              <div key={r.id} className="border border-ch-border bg-ch-surface/10 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-body text-sm text-ch-cream">{r.descripcion}</span>
                      {r.tipo_documento === 'sin_documento' && (
                        <span className="font-body text-[9px] tracking-wider px-1.5 py-0.5 border border-red-500/40 text-red-400">⚠ SIN DOC</span>
                      )}
                    </div>
                    <p className="font-body text-[10px] text-ch-muted mt-0.5">
                      {TIPO_LABEL[r.tipo] || r.tipo}
                      {cotNombre && ` · ${cotNombre}`}
                      {itemNombre && ` · ${itemNombre}`}
                      {!r.cotizacion_item_id && r.cotizacion_id && ' · Gasto no presupuestado'}
                    </p>
                  </div>
                  <span className={`font-body text-[9px] tracking-wider px-2 py-0.5 border whitespace-nowrap ${cfg}`}>
                    {ESTADO_LABEL[r.estado]}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-body text-base text-ch-cream font-mono">${r.monto.toLocaleString('es-CL')}</span>
                    {retencion && retencion.retencion > 0 && (
                      <span className="font-body text-[10px] text-ch-muted ml-2">
                        → neto ${retencion.neto.toLocaleString('es-CL')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {r.foto_url && (
                      <a href={r.foto_url} target="_blank" rel="noopener noreferrer"
                        className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors">
                        Ver doc →
                      </a>
                    )}
                    {(r.estado === 'enviada' || r.estado === 'borrador') && (
                      <button onClick={() => startTransition(async () => {
                        await eliminarRendicion(r.id)
                        setRendiciones(prev => prev.filter(x => x.id !== r.id))
                      })} className="font-body text-[10px] text-ch-muted hover:text-red-400 transition-colors">
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>

                {r.estado === 'rechazada' && r.motivo_rechazo && (
                  <p className="font-body text-[10px] text-red-400 mt-2 border-t border-ch-border/50 pt-2">
                    Motivo: {r.motivo_rechazo}
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
