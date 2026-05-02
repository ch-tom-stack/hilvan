'use client'

import { useState, useTransition, useRef } from 'react'
import { aprobarRendicion, rechazarRendicion, aprobarPago, toggleRendicionCompletada, generarLinkTemporalExterno } from '@/app/actions/rendiciones'
import { createClient } from '@/lib/supabase/client'
import { calcularRetencion } from '@/types'
import type { Rendicion } from '@/types'
import FormularioRendicion from './FormularioRendicion'
import NotasGlosa from './NotasGlosa'

const TIPO_LABEL: Record<string, string> = {
  honorarios: 'Honorarios', transporte: 'Transporte', alimentacion: 'Alimentación',
  arte: 'Arte / Props', insumos: 'Insumos', servicios: 'Servicios', viaticos: 'Viáticos', otro: 'Otro',
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
  colaboradorId?: string
  puedeAprobarPago?: boolean
  puedeGenerarLink?: boolean
}

export default function AdminRendiciones({
  cotizaciones,
  rendicionesPorItem: initialPorItem,
  rendicionesSinItem: initialSinItem,
  cotizacionesForm,
  rendicionesPorItemSumas,
  colaboradores,
  colaboradorId,
  puedeAprobarPago = false,
  puedeGenerarLink = true,
}: Props) {
  const [porItem, setPorItem] = useState(initialPorItem)
  const [sinItem, setSinItem] = useState(initialSinItem)
  const [isPending, startTransition] = useTransition()
  const [modalRechazo, setModalRechazo] = useState<{ id: string; tipo: 'item' | 'libre'; key: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [notasAbiertas, setNotasAbiertas] = useState<Record<string, boolean>>({})
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})
  const [modalLink, setModalLink] = useState<{ itemId: string; itemNombre: string } | null>(null)
  const [linkForm, setLinkForm] = useState({ email: '', colaboradorId: '', dias: 7 })
  const [linkGenerado, setLinkGenerado] = useState<string | null>(null)
  const [generandoLink, setGenerandoLink] = useState(false)

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

  const aprobarContenido = (r: Rendicion, tipo: 'item' | 'libre', key: string) => {
    startTransition(async () => {
      if (tipo === 'item') actualizarEnItem(key, r.id, { estado: 'aprobada' })
      else actualizarEnSinItem(key, r.id, { estado: 'aprobada' })
      await aprobarRendicion(r.id)
    })
  }

  const aprobarPagoRendicion = (r: Rendicion, tipo: 'item' | 'libre', key: string, comprobante?: string) => {
    startTransition(async () => {
      if (tipo === 'item') actualizarEnItem(key, r.id, { estado: 'pago_aprobado', comprobante_pago_url: comprobante })
      else actualizarEnSinItem(key, r.id, { estado: 'pago_aprobado', comprobante_pago_url: comprobante })
      await aprobarPago(r.id, comprobante)
    })
  }

  const toggleCompletado = (tipo: 'item' | 'departamento', id: string, valor: boolean) => {
    startTransition(async () => {
      await toggleRendicionCompletada(tipo, id, valor)
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

  const handleGenerarLink = async () => {
    if (!modalLink) return
    setGenerandoLink(true)
    try {
      const result = await generarLinkTemporalExterno({
        cotizacion_item_id: modalLink.itemId,
        email: linkForm.email.trim(),
        colaborador_id: linkForm.colaboradorId || null,
        dias_expiracion: linkForm.dias,
      })
      setLinkGenerado(result.url)
    } catch (e: any) {
      alert(e?.message || 'Error generando link')
    } finally {
      setGenerandoLink(false)
    }
  }

  const cerrarModalLink = () => {
    setModalLink(null)
    setLinkGenerado(null)
    setLinkForm({ email: '', colaboradorId: '', dias: 7 })
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
          <span>{todasLasRendiciones.filter(r => r.estado === 'enviada').length} enviadas</span>
          <span>{todasLasRendiciones.filter(r => r.estado === 'aprobada').length} por pagar</span>
          <span>{todasLasRendiciones.filter(r => r.estado === 'pago_aprobado').length} pagadas</span>
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
            colaboradorId={colaboradorId}
            rendicionesPorItem={rendicionesPorItemSumas}
            onGenerarLink={puedeGenerarLink ? (id, nombre) => { setMostrarForm(false); setModalLink({ itemId: id, itemNombre: nombre }); setLinkGenerado(null) } : undefined}
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
                                    completado={!!(item as any).rendicion_completada}
                                    onToggle={() => toggleExpand(item.id)} onToggleNotas={() => toggleNotas(item.id)}
                                    onToggleCompletado={v => toggleCompletado('item', item.id, v)}
                                    onAprobarContenido={r => aprobarContenido(r, 'item', item.id)}
                                    onAprobarPago={(r, comp) => aprobarPagoRendicion(r, 'item', item.id, comp)}
                                    onRechazar={r => { setModalRechazo({ id: r.id, tipo: 'item', key: item.id }); setMotivo('') }}
                                    onGenerarLink={() => { setModalLink({ itemId: item.id, itemNombre: item.nombre }); setLinkGenerado(null) }}
                                    puedeAprobarPago={puedeAprobarPago}
                                    puedeGenerarLink={puedeGenerarLink}
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
                            completado={!!(item as any).rendicion_completada}
                            onToggle={() => toggleExpand(item.id)} onToggleNotas={() => toggleNotas(item.id)}
                            onToggleCompletado={v => toggleCompletado('item', item.id, v)}
                            onAprobarContenido={r => aprobarContenido(r, 'item', item.id)}
                            onAprobarPago={r => aprobarPagoRendicion(r, 'item', item.id)}
                            onRechazar={r => { setModalRechazo({ id: r.id, tipo: 'item', key: item.id }); setMotivo('') }}
                            onGenerarLink={() => { setModalLink({ itemId: item.id, itemNombre: item.nombre }); setLinkGenerado(null) }}
                            puedeAprobarPago={puedeAprobarPago}
                            puedeGenerarLink={puedeGenerarLink}
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
                      onAprobarContenido={() => aprobarContenido(r, 'libre', cot.id)}
                      onAprobarPago={comp => aprobarPagoRendicion(r, 'libre', cot.id, comp)}
                      onRechazar={() => { setModalRechazo({ id: r.id, tipo: 'libre', key: cot.id }); setMotivo('') }}
                      puedeAprobarPago={puedeAprobarPago}
                      isPending={isPending}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Modal generar link externo */}
      {modalLink && (
        <div className="fixed inset-0 bg-ch-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-ch-dark border border-ch-border p-6 w-full max-w-md">
            <h3 className="font-display italic text-2xl text-ch-cream mb-1">Generar link externo</h3>
            <p className="font-body text-[10px] text-ch-muted mb-5 truncate">{modalLink.itemNombre}</p>

            {linkGenerado ? (
              <div className="space-y-4">
                <div className="border border-ch-green/30 bg-ch-green/5 p-3">
                  <p className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-green mb-2">Link generado{linkForm.email.trim() ? ' · email enviado' : ''}</p>
                  <p className="font-mono text-xs text-ch-cream break-all select-all">{linkGenerado}</p>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(linkGenerado)}
                  className="w-full border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase py-2.5 transition-colors">
                  Copiar link
                </button>
                <button onClick={cerrarModalLink}
                  className="w-full bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[10px] tracking-[0.35em] uppercase py-2.5 transition-colors">
                  Listo
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Email del externo (opcional)</label>
                  <input
                    type="email"
                    value={linkForm.email}
                    onChange={e => setLinkForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="nombre@email.com — se enviará el link por email"
                    autoFocus
                    className="input-ch w-full"
                  />
                </div>
                <div>
                  <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Colaborador en directorio (opcional)</label>
                  <select
                    value={linkForm.colaboradorId}
                    onChange={e => setLinkForm(p => ({ ...p, colaboradorId: e.target.value }))}
                    className="input-ch w-full">
                    <option value="">— Sin ficha en directorio —</option>
                    {colaboradores.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Días de vigencia</label>
                  <select
                    value={linkForm.dias}
                    onChange={e => setLinkForm(p => ({ ...p, dias: Number(e.target.value) }))}
                    className="input-ch w-full">
                    <option value={3}>3 días</option>
                    <option value={7}>7 días (default)</option>
                    <option value={14}>14 días</option>
                    <option value={30}>30 días</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleGenerarLink}
                    disabled={generandoLink}
                    className="flex-1 bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[10px] tracking-[0.35em] uppercase py-3 transition-colors disabled:opacity-50">
                    {generandoLink ? 'Generando...' : linkForm.email.trim() ? 'Generar y enviar link' : 'Generar link'}
                  </button>
                  <button onClick={cerrarModalLink}
                    className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-4 transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

function ItemRow({ item, rendiciones, expandido, notasAbiertas, completado, onToggle, onToggleNotas, onToggleCompletado, onAprobarContenido, onAprobarPago, onRechazar, onGenerarLink, puedeAprobarPago, puedeGenerarLink, isPending }: {
  item: Item & { rendicion_completada?: boolean }
  rendiciones: Rendicion[]
  expandido: boolean
  notasAbiertas: boolean
  completado: boolean
  onToggle: () => void
  onToggleNotas: () => void
  onToggleCompletado: (v: boolean) => void
  onAprobarContenido: (r: Rendicion) => void
  onAprobarPago: (r: Rendicion, comp?: string) => void
  onRechazar: (r: Rendicion) => void
  onGenerarLink: () => void
  puedeAprobarPago: boolean
  puedeGenerarLink: boolean
  isPending: boolean
}) {
  const presupuesto = item.precio_neto_proveedor * item.cantidad
  const rendido = rendiciones.filter(r => ['aprobada', 'pago_aprobado', 'enviada'].includes(r.estado)).reduce((s, r) => s + r.monto, 0)
  const diferencia = presupuesto - rendido
  const esPerdida = diferencia < 0
  if (rendiciones.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5 group">
        <span className="font-body text-[10px] text-ch-muted cursor-pointer group-hover:text-ch-cream transition-colors"
          onClick={onToggle}>
          {expandido ? '▾' : '▸'}
        </span>
        <span className="font-body text-xs text-ch-cream flex-1 cursor-pointer" onClick={onToggle}>{item.nombre}</span>
        <span className="font-body text-[10px] text-ch-muted font-mono whitespace-nowrap">
          Presupuesto: ${presupuesto.toLocaleString('es-CL')} · Rendido: ${rendido.toLocaleString('es-CL')} · {esPerdida ? `Pérdida: $${Math.abs(diferencia).toLocaleString('es-CL')}` : `Disponible: $${diferencia.toLocaleString('es-CL')}`}
        </span>
        <button onClick={e => { e.stopPropagation(); onToggleNotas() }}
          className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1"
          title="Notas de glosa">
          📝
        </button>
        {puedeGenerarLink && (
          <button onClick={e => { e.stopPropagation(); onGenerarLink() }}
            className="font-body text-[9px] text-ch-muted hover:text-blue-300 transition-colors px-2 py-0.5 border border-ch-border/40 hover:border-blue-500/40 whitespace-nowrap"
            title="Generar link para externo">
            Link externo
          </button>
        )}
        <label className="flex items-center gap-1 cursor-pointer" title="Marcar como rendido">
          <input type="checkbox" checked={completado} disabled={isPending}
            onChange={e => onToggleCompletado(e.target.checked)}
            className="accent-ch-green w-3 h-3" />
          <span className="font-body text-[9px] text-ch-muted">Rendido</span>
        </label>
      </div>

      {notasAbiertas && <NotasGlosa cotizacionItemId={item.id} />}

      {expandido && (
        <div className="ml-4 space-y-2 mt-1 mb-2">
          {rendiciones.map(r => (
            <RendicionRow key={r.id} rendicion={r}
              onAprobarContenido={() => onAprobarContenido(r)}
              onAprobarPago={comp => onAprobarPago(r, comp)}
              onRechazar={() => onRechazar(r)}
              puedeAprobarPago={puedeAprobarPago}
              isPending={isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RendicionRow({ rendicion: r, onAprobarContenido, onAprobarPago, onRechazar, puedeAprobarPago: puedeAprobarPagoProp, isPending }: {
  rendicion: Rendicion
  onAprobarContenido: () => void
  onAprobarPago: (comprobante?: string) => void
  onRechazar: () => void
  puedeAprobarPago: boolean
  isPending: boolean
}) {
  const [mostrarFormPago, setMostrarFormPago] = useState(false)
  const [subiendoPago, setSubiendoPago] = useState(false)
  const [comprobantePago, setComprobantePago] = useState<{ url: string; nombre: string } | null>(null)
  const fileRefPago = useRef<HTMLInputElement>(null)

  const retencion = r.tipo_documento ? calcularRetencion(r) : null
  const colNombre = (r.colaborador as any)?.nombre || r.nombre_libre || '—'
  const esExterno = r.origen === 'externo'
  const puedeAprobarPago = puedeAprobarPagoProp && ((r.estado === 'enviada' && !esExterno) || r.estado === 'aprobada')

  const subirComprobantePago = async (file: File) => {
    setSubiendoPago(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `rendiciones/pagos/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('rendiciones').upload(path, file)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('rendiciones').getPublicUrl(path)
      setComprobantePago({ url: publicUrl, nombre: file.name })
    } finally {
      setSubiendoPago(false)
    }
  }

  const ESTADO_BORDER: Record<string, string> = {
    borrador: 'border-ch-border/40',
    enviada: 'border-amber-500/20 bg-amber-500/5',
    aprobada: 'border-blue-500/20 bg-blue-500/5',
    rechazada: 'border-red-500/20 bg-red-500/5',
    pago_aprobado: 'border-ch-green/20 bg-ch-green/5',
  }

  return (
    <div className={`border p-3 ${ESTADO_BORDER[r.estado] || 'border-ch-border/40'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-body text-xs text-ch-cream">{colNombre}</span>
            <span className="font-body text-[9px] text-ch-muted">{TIPO_LABEL[r.tipo] || r.tipo}</span>
            {esExterno && <span className="font-body text-[9px] px-1.5 border border-blue-500/40 text-blue-400">Externo</span>}
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
              Ver comprobante →
            </a>
          )}
          {r.comprobante_pago_url && (
            <a href={r.comprobante_pago_url} target="_blank" rel="noopener noreferrer"
              className="font-body text-[10px] text-ch-green hover:text-ch-green-light transition-colors">
              Ver comprobante pago →
            </a>
          )}

          {/* Externo enviada → aprobar contenido o rechazar */}
          {r.estado === 'enviada' && esExterno && (
            <div className="flex gap-1.5">
              <button onClick={onAprobarContenido} disabled={isPending}
                className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 transition-colors disabled:opacity-50">
                Aprobar contenido
              </button>
              <button onClick={onRechazar} disabled={isPending}
                className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                Rechazar
              </button>
            </div>
          )}

          {/* Aprobar pago */}
          {puedeAprobarPago && !mostrarFormPago && (
            <button onClick={() => setMostrarFormPago(true)} disabled={isPending}
              className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 bg-ch-green hover:bg-ch-green-light text-ch-black transition-colors disabled:opacity-50">
              ✓ Aprobar pago
            </button>
          )}

          {/* Badge de estado final */}
          {r.estado === 'pago_aprobado' && (
            <span className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-ch-green/30 text-ch-green">
              Pagado
            </span>
          )}
          {r.estado === 'rechazada' && (
            <span className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-red-500/30 text-red-400">
              Rechazada
            </span>
          )}
          {r.estado === 'borrador' && (
            <span className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-ch-border text-ch-muted">
              Borrador
            </span>
          )}
        </div>
      </div>

      {/* Mini-form aprobación de pago */}
      {mostrarFormPago && (
        <div className="mt-3 pt-3 border-t border-ch-border/40 space-y-2">
          <p className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Comprobante de pago</p>
          <input ref={fileRefPago} type="file" accept="image/*,application/pdf"
            onChange={e => { if (e.target.files?.[0]) subirComprobantePago(e.target.files[0]) }}
            className="hidden" />
          {comprobantePago ? (
            <div className="flex items-center gap-2 p-2 border border-ch-border/50">
              <span className="font-body text-[10px] text-ch-cream truncate">{comprobantePago.nombre}</span>
              <button onClick={() => setComprobantePago(null)} className="text-ch-muted hover:text-red-400 text-xs">✕</button>
            </div>
          ) : (
            <button onClick={() => fileRefPago.current?.click()} disabled={subiendoPago}
              className="w-full border border-dashed border-ch-border/50 text-ch-muted hover:text-ch-cream font-body text-[10px] py-2 transition-colors disabled:opacity-50">
              {subiendoPago ? 'Subiendo...' : '📎 Adjuntar comprobante (opcional)'}
            </button>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { onAprobarPago(comprobantePago?.url); setMostrarFormPago(false); setComprobantePago(null) }}
              disabled={isPending || subiendoPago}
              className="flex-1 bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[10px] tracking-[0.35em] uppercase py-2 transition-colors disabled:opacity-50">
              {isPending ? 'Aprobando...' : 'Confirmar pago'}
            </button>
            <button onClick={() => { setMostrarFormPago(false); setComprobantePago(null) }}
              className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] px-3 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
