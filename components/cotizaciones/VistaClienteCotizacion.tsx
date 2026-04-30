'use client'


import { useState, useTransition } from 'react'
import { responderCotizacion } from '@/app/actions/cotizaciones'
import {
  numeroCotizacion,
  calcularTotales,
  subtotalDepartamento,
  subtotalSubgrupo,
  subtotalItem,
  formatCLP,
  type Cotizacion,
} from '@/types'

interface Props {
  cotizacion: Cotizacion
  token: string | null
  preview?: boolean
}

export default function VistaClienteCotizacion({ cotizacion, token, preview = false }: Props) {
  const [isPending, startTransition] = useTransition()
  const [comentario, setComentario] = useState('')
  const [respondido, setRespondido] = useState(
    cotizacion.estado === 'aprobada' || cotizacion.estado === 'rechazada'
  )
  const [estadoLocal, setEstadoLocal] = useState(cotizacion.estado)

  const totales = calcularTotales(cotizacion)
  const numVisible = numeroCotizacion({
    grupo: cotizacion.grupo,
    version: cotizacion.version,
    variante: cotizacion.variante,
  })

  async function handleRespuesta(respuesta: 'aprobada' | 'rechazada') {
    startTransition(async () => {
      await responderCotizacion(token, respuesta, comentario || undefined)
      setEstadoLocal(respuesta)
      setRespondido(true)
    })
  }

  const nombreCliente =
    cotizacion.cliente?.nombre ||
    cotizacion.cliente_nombre_libre ||
    'Cliente'

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <div className="bg-[#0D0D0D] px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-end justify-between">
          <div>
            <img
              src="/logos/logo-horizontal-negro.png"
              alt="Casa Hiedra"
              className="mb-3 h-7 w-auto"
            />
            <h1
              className="font-serif italic text-2xl text-white leading-none"
              style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}
            >
              Cotización {numVisible}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-sm text-white/70 font-sans">Para {nombreCliente}</p>
            {cotizacion.fecha_envio && (
              <p className="text-xs text-white/50 font-sans mt-0.5">
                {new Date(cotizacion.fecha_envio).toLocaleDateString('es-CL', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Nombre del proyecto */}
        <div>
          <h2
            className="text-xl text-gray-800 font-serif"
            style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}
          >
            {cotizacion.nombre}
          </h2>
          {cotizacion.descripcion && (
            <p className="text-sm text-gray-500 font-sans mt-2 leading-relaxed">
              {cotizacion.descripcion}
            </p>
          )}
        </div>

        {/* Departamentos */}
        <div className="space-y-6">
          {(cotizacion.departamentos ?? []).map(dep => {
            const subDep = subtotalDepartamento(dep)
            if (subDep === 0 && !(dep.subgrupos?.length) && !(dep.items?.length)) return null

            return (
              <div key={dep.id}>
                {/* Header departamento */}
                <div className="flex items-center justify-between py-2 border-b-2 border-gray-800 mb-3">
                  <span className="text-xs font-sans font-semibold tracking-widest uppercase text-gray-700">
                    {dep.nombre}
                  </span>
                  <span className="text-sm font-sans font-semibold text-gray-800">
                    {formatCLP(subDep)}
                  </span>
                </div>

                {/* Sub-grupos */}
                {(dep.subgrupos ?? []).map(sg => {
                  const subSg = subtotalSubgrupo(sg)
                  return (
                    <div key={sg.id} className="mb-4">
                      <div className="flex items-center justify-between py-1.5 border-b border-gray-200 mb-2">
                        <span className="text-xs font-sans font-semibold text-gray-600">
                          {sg.nombre}
                        </span>
                        <span className="text-xs font-sans text-gray-600">
                          {formatCLP(subSg)}
                        </span>
                      </div>
                      {(sg.items ?? []).map(item => (
                        <ItemFila key={item.id} item={item} />
                      ))}
                    </div>
                  )
                })}

                {/* Ítems directos */}
                {(dep.items ?? []).map(item => (
                  <ItemFila key={item.id} item={item} />
                ))}
              </div>
            )
          })}
        </div>

        {/* Totales */}
        <div className="border-t-2 border-gray-800 pt-5 space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-sans text-gray-500">Subtotal neto</span>
            <span className="text-sm font-sans text-gray-800">{formatCLP(totales.neto)}</span>
          </div>
          {totales.descuento_global_monto > 0 && (
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-sans text-gray-500">Descuento</span>
              <span className="text-sm font-sans text-red-500">
                -{formatCLP(totales.descuento_global_monto)}
              </span>
            </div>
          )}
          {cotizacion.con_iva && (
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-sans text-gray-500">IVA 19%</span>
              <span className="text-sm font-sans text-gray-800">{formatCLP(totales.iva)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline pt-2 border-t border-gray-200">
            <span className="text-base font-sans font-semibold text-gray-800">Total</span>
            <span
              className="text-2xl font-serif text-gray-900"
              style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}
            >
              {formatCLP(totales.total)}
            </span>
          </div>
        </div>

        {/* Notas al cliente */}
        {cotizacion.notas_cliente && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Notas
            </p>
            <p className="text-sm font-sans text-gray-600 leading-relaxed whitespace-pre-wrap">
              {cotizacion.notas_cliente}
            </p>
          </div>
        )}

        {/* Respuesta del cliente */}
        {!preview && respondido ? (
          <div className={`rounded-lg p-5 border text-center ${
            estadoLocal === 'aprobada'
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <p className={`font-sans font-semibold text-sm ${
              estadoLocal === 'aprobada' ? 'text-green-700' : 'text-red-600'
            }`}>
              {estadoLocal === 'aprobada'
                ? '✓ Cotización aprobada — gracias por tu respuesta.'
                : '✕ Cotización rechazada.'}
            </p>
          </div>
        ) : !preview && cotizacion.estado === 'enviada' ? (
          <div className="border border-gray-200 rounded-lg p-5 space-y-4 bg-white">
            <p className="text-sm font-sans font-semibold text-gray-700">
              ¿Deseas aprobar esta cotización?
            </p>
            <textarea
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              placeholder="Comentario opcional (correcciones, consultas...)"
              rows={3}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-sans text-gray-700 placeholder-gray-300 focus:outline-none focus:border-gray-400 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => handleRespuesta('aprobada')}
                disabled={isPending}
                className="flex-1 py-2.5 bg-gray-900 text-white font-sans text-sm font-medium rounded hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Enviando...' : 'Aprobar cotización'}
              </button>
              <button
                onClick={() => handleRespuesta('rechazada')}
                disabled={isPending}
                className="px-5 py-2.5 border border-gray-300 text-gray-500 font-sans text-sm rounded hover:border-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                Rechazar
              </button>
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="pt-4 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-300 font-sans">
            Casa Hiedra · Producción audiovisual
          </p>
        </div>
      </div>
    </div>
  )
}

function ItemFila({ item }: { item: any }) {
  const subtotal = subtotalItem(item)
  return (
    <div className="flex items-start justify-between py-2 pl-2">
      <div className="flex-1 pr-4">
        <span className="text-sm font-sans text-gray-700">{item.nombre}</span>
        {item.descripcion && (
          <p className="text-xs font-sans text-gray-400 mt-0.5 leading-relaxed whitespace-pre-line">
            {item.descripcion}
          </p>
        )}
      </div>
      <span className="text-sm font-sans text-gray-700 shrink-0">
        {item.incluido ? 'Incluida' : formatCLP(subtotal)}
      </span>
    </div>
  )
}
