'use client'

import { useState } from 'react'
import { calcularRetencion } from '@/types'
import type { Rendicion } from '@/types'
import FormularioRendicion from './FormularioRendicion'

const TIPO_LABEL: Record<string, string> = {
  honorarios: 'Honorarios', transporte: 'Transporte', alimentacion: 'Alimentación',
  arte: 'Arte / Props', factura: 'Factura', otro: 'Otro',
}
const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'text-amber-400 border-amber-500/30',
  aprobada: 'text-ch-green border-ch-green/30',
  rechazada: 'text-red-400 border-red-500/30',
}

interface Props {
  token: string
  colaboradorId: string
  colaboradorNombre: string
  cotizaciones: any[]
  rendicionesPorItem: Record<string, number>
  rendiciones: Rendicion[]
}

export default function PortalRendicion({ colaboradorId, colaboradorNombre, cotizaciones, rendicionesPorItem, rendiciones: inicial }: Props) {
  const [rendiciones, setRendiciones] = useState(inicial)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const handleSuccess = (nueva: Rendicion) => {
    setRendiciones(prev => [nueva, ...prev])
    setMostrarForm(false)
    setEnviado(true)
    setTimeout(() => setEnviado(false), 4000)
  }

  return (
    <div className="min-h-screen bg-ch-black">
      <div className="max-w-lg mx-auto p-4 pt-10">
        <div className="mb-8">
          <p className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted mb-1">Casa Hiedra · Portal</p>
          <h1 className="font-display italic text-3xl text-ch-cream leading-tight">Hola, {colaboradorNombre}</h1>
        </div>

        {enviado && (
          <div className="border border-ch-green/30 bg-ch-green/10 p-4 mb-6">
            <p className="font-body text-xs text-ch-green">✓ Rendición enviada. Te avisaremos cuando sea revisada.</p>
          </div>
        )}

        {cotizaciones.length > 0 && (
          <button onClick={() => setMostrarForm(!mostrarForm)}
            className="w-full bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase py-3 mb-6 transition-colors">
            + Agregar gasto
          </button>
        )}

        {cotizaciones.length === 0 && (
          <div className="border border-dashed border-ch-border p-8 text-center mb-6">
            <p className="font-body text-sm text-ch-muted">No hay cotizaciones activas asociadas a este enlace.</p>
          </div>
        )}

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

        {rendiciones.length > 0 && (
          <div>
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Mis rendiciones</p>
            <div className="space-y-3">
              {rendiciones.map(r => {
                const retencion = r.tipo_documento ? calcularRetencion(r) : null
                const cotNombre = (r.cotizacion as any)?.nombre
                const itemNombre = (r.cotizacion_item as any)?.nombre
                return (
                  <div key={r.id} className="border border-ch-border p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-body text-sm text-ch-cream">{r.descripcion}</p>
                        <p className="font-body text-[10px] text-ch-muted mt-0.5">
                          {TIPO_LABEL[r.tipo] || r.tipo}
                          {cotNombre && ` · ${cotNombre}`}
                          {itemNombre && ` · ${itemNombre}`}
                        </p>
                      </div>
                      <span className={`font-body text-[9px] tracking-wider px-2 py-0.5 border whitespace-nowrap ${ESTADO_COLOR[r.estado]}`}>
                        {r.estado === 'pendiente' ? 'Pendiente' : r.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-body text-base text-ch-cream font-mono">${r.monto.toLocaleString('es-CL')}</span>
                        {retencion && retencion.retencion > 0 && (
                          <span className="font-body text-[10px] text-ch-muted ml-2">→ neto ${retencion.neto.toLocaleString('es-CL')}</span>
                        )}
                      </div>
                      {r.foto_url && (
                        <a href={r.foto_url} target="_blank" rel="noopener noreferrer"
                          className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors">
                          Ver doc →
                        </a>
                      )}
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
          </div>
        )}

        <p className="font-body text-[9px] text-ch-muted text-center mt-10 tracking-wider">Casa Hiedra · Hilván</p>
      </div>
    </div>
  )
}
