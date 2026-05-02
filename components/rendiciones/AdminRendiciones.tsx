'use client'

import { useState, useTransition } from 'react'
import { aprobarRendicion, rechazarRendicion } from '@/app/actions/rendiciones'
import { calcularRetencion } from '@/types'
import type { Rendicion } from '@/types'
import FormularioRendicion from './FormularioRendicion'
import NotasGlosa from './NotasGlosa'

const TIPO_LABEL: Record<string, string> = {
  honorarios: 'Honorarios', transporte: 'Transporte', alimentacion: 'Alimentación',
  arte: 'Arte / Props', factura: 'Factura', otro: 'Otro',
}

interface Item {
  id: string
  nombre: string
  tipo: string
  precio_neto_proveedor: number
  cantidad: number
}

interface Subgrupo { id: string; nombre: string; orden: number; items?: Item[] }
interface Departamento { id: string; nombre: string; orden: number; subgrupos?: Subgrupo[]; items?: any[] }
interface Cotizacion {
  id: string
  nombre: string
  grupo?: { numero_base?: string }
  departamentos?: Departamento[]
}

interface Props {
  cotizaciones: Cotizacion[]
  rendicionesPorItem: Record<string, Rendicion[]>
  rendicionesSinItem: Record<string, Rendicion[]>
  cotizacionesForm: any[]
  rendicionesPorItemSumas: Record<string, number>
  colaboradores: { id: string; nombre: string }[]
}

export default function AdminRendiciones({
  cotizaciones,
  rendicionesPorItem: initialPorItem,
  rendicionesSinItem: initialSinItem,
  cotizacionesForm,
  rendicionesPorItemSumas,
  colaboradores,
}: Props) {
  const [porItem, setPorItem] = useState(initialPorItem)
  const [sinItem, setSinItem] = useState(initialSinItem)
  const [isPending, startTransition] = useTransition()
  const [modalRechazo, setModalRechazo] = useState<{ id: string; tipo: 'item' | 'libre'; key: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [notasAbiertas, setNotasAbiertas] = useState<Record<string, boolean>>({})
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})

  const toggleExpand = (key: string) => setExpandidos(p => ({ ...p, [key]: !p[key] }))
  const toggleNotas = (key: string) => setNotasAbiertas(p => ({ ...p, [key]: !p[key] }))

  const actualizarEnItem = (itemId: string, id: string, cambios: Partial<Rendicion>) => {
    setPorItem(prev => ({
      ...prev,
      [itemId]: (prev[itemId] || []).map(r => r.id === id ? { ...r, ...cambios } : r),
    }))
  }

  const actualizarEnSinItem = (cotId: string, id: string, cambios: Partial<Rendicion>) => {
    setSinItem(prev => ({
      ...prev,
      [cotId]: (prev[cotId] || []).map(r => r.id === id ? { ...r, ...cambios } : r),
    }))
  }

  const aprobar = (r: Rendicion, tipo: 'item' | 'libre', key: string) => {
    startTransition(async () => {
      if (tipo === 'item') actualizarEnItem(key, r.id, { estado: 'aprobada' })
      else actualizarEnSinItem(key, r.id, { estado: 'aprobada' })
      await aprobarRendicion(r.id)
    })
  }

  const confirmarRechazo = () => {
    if (!modalRechazo || !motivo.trim()) return
    const { id, tipo, key } = modalRechazo
    startTransition(async () => {
      if (tipo === 'item') actualizarEnItem(key, id, { estado: 'rechazada', motivo_rechazo: motivo })
      else actualizarEnSinItem(key, id, { estado: 'rechazada', motivo_rechazo: motivo })
      await rechazarRendicion(id, motivo)
      setModalRechazo(null)
      setMotivo('')
    })
  }

  const handleNuevaRendicion = (nueva: Rendicion) => {
    if (nueva.cotizacion_item_id) {
      setPorItem(prev => ({
        ...prev,
        [nueva.cotizacion_item_id!]: [nueva, ...(prev[nueva.cotizacion_item_id!] || [])],
      }))
    } else {
      setSinItem(prev => ({
        ...prev,
        [nueva.cotizacion_id]: [nueva, ...(prev[nueva.cotizacion_id] || [])],
      }))
    }
    setMostrarForm(false)
  }

  // Totales globales para stats
  const todasLasRendiciones = [
    ...Object.values(porItem).flat(),
    ...Object.values(sinItem).flat(),
  ]

  return (
    <div className="space-y-8">

      {/* Barra superior */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-4 text-ch-muted font-body text-[10px] tracking-wider">
          <span>{todasLasRendiciones.filter(r => r.estado === 'pendiente').length} pendientes</span>
          <span>{todasLasRendiciones.filter(r => r.estado === 'aprobada').length} aprobadas</span>
        </div>
        <button onClick={() => setMostrarForm(!mostrarForm)}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-5 py-2.5 transition-colors">
          + Nueva rendición
        </button>
      </div>

      {/* Formulario nueva rendición */}
      {mostrarForm && (
        <div className="border border-ch-border bg-ch-surface/20 p-5">
          <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-4">Nueva rendición</p>
          <FormularioRendicion
            cotizaciones={cotizacionesForm}
            rendicionesPorItem={rendicionesPorItemSumas}
            onSuccess={handleNuevaRendicion}
            onCancel={() => setMostrarForm(false)}
          />
        </div>
      )}

      {/* Por cotización */}
      {cotizaciones.length === 0 && (
        <div className="border border-dashed border-ch-border p-12 text-center">
          <p className="text-ch-muted font-body text-sm">No hay rendiciones aún.</p>
        </div>
      )}

      {cotizaciones.map(cot => {
        const sinEste = sinItem[cot.id] || []
        const tieneDatos = (cot.departamentos ?? []).some(dep => {
          const items = [...(dep.items ?? []).filter((i: any) => !i.subgrupo_id), ...(dep.subgrupos ?? []).flatMap((sg: any) => sg.items ?? [])]
          return items.some((i: any) => (porItem[i.id] || []).length > 0)
        }) || sinEste.length > 0
        if (!tieneDatos) return null

        const numBase = cot.grupo?.numero_base
        return (
          <div key={cot.id} className="border border-ch-border/50 p-4 lg:p-6">
            <h2 className="font-display italic text-2xl text-ch-cream mb-5">
              {numBase && <span className="font-body text-sm not-italic text-ch-muted mr-2">{numBase}</span>}
              {cot.nombre}
            </h2>

            {/* Por departamento */}
            {(cot.departamentos ?? [])
              .slice()
              .sort((a, b) => a.orden - b.orden)
              .map(dep => {
                const itemsDirectos = (dep.items ?? []).filter((i: any) => !i.subgrupo_id)
                const subgrupos = dep.subgrupos ?? []
                const todosItems = [...itemsDirectos, ...(subgrupos.flatMap(sg => sg.items ?? []))]
                const hayRendiciones = todosItems.some(i => (porItem[i.id] || []).length > 0)
                if (!hayRendiciones) return null

                return (
                  <div key={dep.id} className="mb-6">
                    <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-3 pb-1 border-b border-ch-border/40">
                      {dep.nombre}
                    </p>

                    <div className="space-y-1">
                      {/* Subgrupos */}
                      {subgrupos
                        .slice()
                        .sort((a, b) => a.orden - b.orden)
                        .map(sg => {
                          const haySg = (sg.items ?? []).some(i => (porItem[i.id] || []).length > 0)
                          if (!haySg) return null
                          return (
                            <div key={sg.id} className="mb-3">
                              <p className="font-body text-[10px] text-ch-muted italic mb-1.5">{sg.nombre}</p>
                              <div className="space-y-1 pl-2">
                                {(sg.items ?? []).map(item => (
                                  <ItemRow key={item.id} item={item} rendiciones={porItem[item.id] || []}
                                    expandido={!!expandidos[item.id]} notasAbiertas={!!notasAbiertas[item.id]}
                                    onToggle={() => toggleExpand(item.id)} onToggleNotas={() => toggleNotas(item.id)}
                                    onAprobar={r => aprobar(r, 'item', item.id)}
                                    onRechazar={r => { setModalRechazo({ id: r.id, tipo: 'item', key: item.id }); setMotivo('') }}
                                    isPending={isPending}
                                  />
                                ))}
                              </div>
                            </div>
                          )
                        })}

                      {/* Items directos del departamento */}
                      {itemsDirectos
                        .filter(i => (porItem[i.id] || []).length > 0)
                        .map(item => (
                          <ItemRow key={item.id} item={item} rendiciones={porItem[item.id] || []}
                            expandido={!!expandidos[item.id]} notasAbiertas={!!notasAbiertas[item.id]}
                            onToggle={() => toggleExpand(item.id)} onToggleNotas={() => toggleNotas(item.id)}
                            onAprobar={r => aprobar(r, 'item', item.id)}
                            onRechazar={r => { setModalRechazo({ id: r.id, tipo: 'item', key: item.id }); setMotivo('') }}
                            isPending={isPending}
                          />
                        ))}
                    </div>
                  </div>
                )
              })}

            {/* Gastos no presupuestados */}
            {sinEste.length > 0 && (
              <div className="mt-4 pt-4 border-t border-ch-border/40">
                <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Gastos no presupuestados</p>
                <div className="space-y-2">
                  {sinEste.map(r => (
                    <RendicionRow key={r.id} rendicion={r}
                      onAprobar={() => aprobar(r, 'libre', cot.id)}
                      onRechazar={() => { setModalRechazo({ id: r.id, tipo: 'libre', key: cot.id }); setMotivo('') }}
                      isPending={isPending}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Modal rechazo */}
      {modalRechazo && (
        <div className="fixed inset-0 bg-ch-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-ch-dark border border-ch-border p-6 w-full max-w-md">
            <h3 className="font-display italic text-2xl text-ch-cream mb-5">Motivo de rechazo</h3>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)}
              rows={3} autoFocus placeholder="Ej: Documento ilegible, falta comprobante..."
              className="input-ch w-full resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={confirmarRechazo} disabled={isPending || !motivo.trim()}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-body text-[10px] tracking-[0.35em] uppercase py-3 transition-colors disabled:opacity-50">
                {isPending ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
              <button onClick={() => setModalRechazo(null)}
                className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-4 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function ItemRow({ item, rendiciones, expandido, notasAbiertas, onToggle, onToggleNotas, onAprobar, onRechazar, isPending }: {
  item: Item
  rendiciones: Rendicion[]
  expandido: boolean
  notasAbiertas: boolean
  onToggle: () => void
  onToggleNotas: () => void
  onAprobar: (r: Rendicion) => void
  onRechazar: (r: Rendicion) => void
  isPending: boolean
}) {
  const presupuesto = item.precio_neto_proveedor * item.cantidad
  const rendido = rendiciones.filter(r => r.estado === 'aprobada').reduce((s, r) => s + r.monto, 0)
  const diferencia = presupuesto - rendido
  const esPerdida = diferencia < 0
  if (rendiciones.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5 cursor-pointer hover:text-ch-cream transition-colors group"
        onClick={onToggle}>
        <span className="font-body text-[10px] text-ch-muted group-hover:text-ch-cream transition-colors">
          {expandido ? '▾' : '▸'}
        </span>
        <span className="font-body text-xs text-ch-cream flex-1">{item.nombre}</span>
        <span className="font-body text-[10px] text-ch-muted font-mono whitespace-nowrap">
          Presupuesto: ${presupuesto.toLocaleString('es-CL')} · Rendido: ${rendido.toLocaleString('es-CL')} · {esPerdida ? `Pérdida: $${Math.abs(diferencia).toLocaleString('es-CL')}` : `Disponible: $${diferencia.toLocaleString('es-CL')}`}
        </span>
        <button onClick={e => { e.stopPropagation(); onToggleNotas() }}
          className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1"
          title="Notas">
          📝
        </button>
      </div>

      {notasAbiertas && <NotasGlosa cotizacionItemId={item.id} />}

      {expandido && (
        <div className="ml-4 space-y-2 mt-1 mb-2">
          {rendiciones.map(r => (
            <RendicionRow key={r.id} rendicion={r}
              onAprobar={() => onAprobar(r)}
              onRechazar={() => onRechazar(r)}
              isPending={isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RendicionRow({ rendicion: r, onAprobar, onRechazar, isPending }: {
  rendicion: Rendicion
  onAprobar: () => void
  onRechazar: () => void
  isPending: boolean
}) {
  const retencion = r.tipo_documento ? calcularRetencion(r) : null
  const colNombre = (r.colaborador as any)?.nombre || r.nombre_libre || '—'

  return (
    <div className={`border p-3 ${r.estado === 'pendiente' ? 'border-amber-500/20 bg-amber-500/5' : r.estado === 'aprobada' ? 'border-ch-green/20 bg-ch-green/5' : 'border-red-500/20 bg-red-500/5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-body text-xs text-ch-cream">{colNombre}</span>
            <span className="font-body text-[9px] text-ch-muted">{TIPO_LABEL[r.tipo] || r.tipo}</span>
            {r.tipo_documento === 'sin_documento' && (
              <span className="font-body text-[9px] px-1.5 border border-red-500/40 text-red-400">SIN DOC</span>
            )}
          </div>
          <p className="font-body text-[10px] text-ch-muted truncate">{r.descripcion}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="font-body text-sm text-ch-cream font-mono">${r.monto.toLocaleString('es-CL')}</span>
            {retencion && retencion.retencion > 0 && (
              <span className="font-body text-[10px] text-ch-muted font-mono">
                ret. ${retencion.retencion.toLocaleString('es-CL')} · neto ${retencion.neto.toLocaleString('es-CL')}
              </span>
            )}
          </div>
          {r.estado === 'rechazada' && r.motivo_rechazo && (
            <p className="font-body text-[10px] text-red-400 mt-1">Motivo: {r.motivo_rechazo}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {r.foto_url && (
            <a href={r.foto_url} target="_blank" rel="noopener noreferrer"
              className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors">
              Ver doc →
            </a>
          )}
          {r.estado === 'pendiente' && (
            <div className="flex gap-1.5">
              <button onClick={onAprobar} disabled={isPending}
                className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 bg-ch-green hover:bg-ch-green-light text-ch-black transition-colors disabled:opacity-50">
                Aprobar
              </button>
              <button onClick={onRechazar} disabled={isPending}
                className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                Rechazar
              </button>
            </div>
          )}
          {r.estado !== 'pendiente' && (
            <span className={`font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border ${r.estado === 'aprobada' ? 'border-ch-green/30 text-ch-green' : 'border-red-500/30 text-red-400'}`}>
              {r.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
