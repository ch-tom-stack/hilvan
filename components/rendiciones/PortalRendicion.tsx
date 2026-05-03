'use client'

import { useState } from 'react'
import { calcularRetencion } from '@/types'
import type { RendicionGasto } from '@/types'
import FormularioGasto from './FormularioGasto'

const TIPO_LABEL: Record<string, string> = {
  honorarios: 'Honorarios', transporte: 'Transporte', alimentacion: 'Alimentación',
  arte: 'Arte / Props', insumos: 'Insumos', servicios: 'Servicios', viaticos: 'Viáticos', otro: 'Otro',
}
const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', enviada: 'Enviado', aprobada: 'Aprobado',
  rechazada: 'Rechazado', pago_aprobado: 'Pagado',
}
const ESTADO_COLOR: Record<string, string> = {
  borrador: 'text-ch-muted border-ch-border',
  enviada: 'text-amber-400 border-amber-500/30',
  aprobada: 'text-blue-400 border-blue-500/30',
  rechazada: 'text-red-400 border-red-500/30',
  pago_aprobado: 'text-ch-green border-ch-green/30',
}

interface Props {
  rendicionId: string
  cotizacionNombre?: string
  cotizacionItem: { id: string; nombre: string; tipo: string; precio_neto_proveedor: number; cantidad: number }
  colaboradorId: string | null
  email: string | null
  gastosIniciales: RendicionGasto[]
}

export default function PortalRendicion({
  rendicionId, cotizacionNombre, cotizacionItem, colaboradorId, email, gastosIniciales,
}: Props) {
  const [gastos, setGastos] = useState(gastosIniciales)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [flashOk, setFlashOk] = useState(false)

  const presupuesto = cotizacionItem.precio_neto_proveedor * cotizacionItem.cantidad
  const nombreVisible = colaboradorId ? undefined : (email?.split('@')[0] || 'Colaborador')

  const handleSuccess = (gasto: RendicionGasto, continuar?: boolean) => {
    setGastos(prev => [gasto, ...prev])
    if (!continuar) {
      setMostrarForm(false)
      setFlashOk(true)
      setTimeout(() => setFlashOk(false), 4000)
    }
  }

  return (
    <div className="min-h-screen bg-ch-black">
      <div className="max-w-lg mx-auto p-4 pt-10">

        {/* Header */}
        <div className="mb-8">
          <p className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted mb-1">Casa Hiedra · Portal</p>
          {cotizacionNombre && (
            <p className="font-body text-[10px] text-ch-muted mb-1">{cotizacionNombre}</p>
          )}
          <h1 className="font-display italic text-3xl text-ch-cream leading-tight">{cotizacionItem.nombre}</h1>
          <p className="font-body text-xs text-ch-muted mt-2">
            Presupuesto: <span className="font-mono text-ch-cream">${presupuesto.toLocaleString('es-CL')}</span>
          </p>
        </div>

        {flashOk && (
          <div className="border border-ch-green/30 bg-ch-green/10 p-4 mb-6">
            <p className="font-body text-xs text-ch-green">✓ Gasto enviado. Te avisaremos cuando sea revisado.</p>
          </div>
        )}

        {/* Botón agregar */}
        <button onClick={() => setMostrarForm(!mostrarForm)}
          className="w-full bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase py-3 mb-6 transition-colors">
          {mostrarForm ? '− Cancelar' : '+ Agregar gasto'}
        </button>

        {/* Formulario */}
        {mostrarForm && (
          <div className="border border-ch-border bg-ch-surface/20 p-5 mb-6">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-4">Nuevo gasto</p>
            <FormularioGasto
              rendicionId={rendicionId}
              cotizacionItemId={cotizacionItem.id}
              itemTipo={cotizacionItem.tipo}
              colaboradorId={colaboradorId}
              esExterno={true}
              onSuccess={handleSuccess}
              onCancel={() => setMostrarForm(false)}
            />
          </div>
        )}

        {/* Lista de gastos */}
        {gastos.length > 0 && (
          <div>
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Mis gastos</p>
            <div className="space-y-3">
              {gastos.map(g => {
                const retencion = g.tipo_documento ? calcularRetencion(g) : null
                return (
                  <div key={g.id} className="border border-ch-border p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm text-ch-cream">{g.descripcion}</p>
                        <p className="font-body text-[10px] text-ch-muted mt-0.5">
                          {TIPO_LABEL[g.tipo] || g.tipo}
                          {g.tipo_documento && g.tipo_documento !== 'sin_documento' && ` · ${g.tipo_documento}`}
                        </p>
                      </div>
                      <span className={`font-body text-[9px] tracking-wider px-2 py-0.5 border whitespace-nowrap ${ESTADO_COLOR[g.estado] || 'text-ch-muted border-ch-border'}`}>
                        {ESTADO_LABEL[g.estado] || g.estado}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-body text-base text-ch-cream font-mono">${g.monto.toLocaleString('es-CL')}</span>
                        {retencion && retencion.retencion > 0 && (
                          <span className="font-body text-[10px] text-ch-muted ml-2 font-mono">
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
                        Motivo de rechazo: {g.motivo_rechazo}
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
