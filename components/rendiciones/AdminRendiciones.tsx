'use client'

import { useState, useTransition, useRef } from 'react'
import { toastOk, toastError } from '@/lib/toast'
import EstadoVacio from '@/components/ui/EstadoVacio'
import {
  aprobarGasto, rechazarGasto, aprobarPagoGasto,
  toggleItemCompletado, generarLinkTemporalExterno, crearRendicion, purgarYCrearRendicion, eliminarRendicion,
  eliminarLinkTemporal, reenviarEmailLink,
  toggleFacturaEmitida, agregarArchivoFactura, eliminarArchivoFactura, togglePagoRecibido,
  eliminarGasto,
} from '@/app/actions/rendiciones'
import { createClient } from '@/lib/supabase/client'
import { calcularRetencion } from '@/types'
import type { Rendicion, RendicionGasto } from '@/types'
import FormularioGasto from './FormularioGasto'
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
  rendicion_completada?: boolean
}
interface Subgrupo { id: string; nombre: string; orden: number; items?: Item[] }
interface Departamento { id: string; nombre: string; orden: number; subgrupos?: Subgrupo[]; items?: any[] }
interface CotizacionForm {
  id: string
  nombre: string
  grupo?: { numero_base?: string }
  departamentos?: Departamento[]
}

interface LinkTemporal {
  id: string
  token: string
  email: string | null
  expires_at: string
  created_at: string
  rendicion_id: string
  cotizacion_item_id: string
  colaborador_id: string | null
  cotizacion_item: { id: string; nombre: string } | null
  colaborador: { id: string; nombre: string; email: string } | null
  rendicion: {
    id: string
    cotizacion: { id: string; nombre: string; grupo: { numero_base?: string } | null } | null
  } | null
}

interface Props {
  rendiciones: Rendicion[]
  cotizacionesForm: CotizacionForm[]
  gastosSumasPorItem: Record<string, number>
  colaboradores: { id: string; nombre: string }[]
  linksTemporales?: LinkTemporal[]
  colaboradorId?: string
  puedeAprobarPago?: boolean
  puedeGenerarLink?: boolean
}

export default function AdminRendiciones({
  rendiciones: initialRendiciones,
  cotizacionesForm,
  gastosSumasPorItem,
  colaboradores,
  linksTemporales: initialLinks = [],
  colaboradorId,
  puedeAprobarPago = false,
  puedeGenerarLink = true,
}: Props) {
  const [rendiciones, setRendiciones] = useState(initialRendiciones)
  const [links, setLinks] = useState<LinkTemporal[]>(initialLinks)
  const [pestana, setPestana] = useState<'rendiciones' | 'links'>('rendiciones')
  const [isPending, startTransition] = useTransition()
  const [modalRechazo, setModalRechazo] = useState<{ gastoId: string; rendicionId: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [modalLink, setModalLink] = useState<{ rendicionId: string; itemId: string; itemNombre: string } | null>(null)
  const [linkForm, setLinkForm] = useState({ email: '', colaboradorId: '', dias: 7 })
  const [linkGenerado, setLinkGenerado] = useState<string | null>(null)
  const [generandoLink, setGenerandoLink] = useState(false)
  const [modalNuevaRendicion, setModalNuevaRendicion] = useState(false)
  const [cotizacionSeleccionada, setCotizacionSeleccionada] = useState('')
  const [creandoRendicion, setCreandoRendicion] = useState(false)
  const [conflictoExistente, setConflictoExistente] = useState(false)
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})
  const [confirmarEliminarRendicion, setConfirmarEliminarRendicion] = useState<string | null>(null)
  const [confirmarEliminarLink, setConfirmarEliminarLink] = useState<string | null>(null)

  const toggleExpand = (key: string) => setExpandidos(p => ({ ...p, [key]: !p[key] }))

  const actualizarRendicion = (rendicionId: string, cambios: Partial<Rendicion>) => {
    setRendiciones(prev => prev.map(r => r.id !== rendicionId ? r : { ...r, ...cambios }))
  }

  const actualizarGasto = (rendicionId: string, gastoId: string, cambios: Partial<RendicionGasto>) => {
    setRendiciones(prev => prev.map(r => r.id !== rendicionId ? r : {
      ...r,
      gastos: (r.gastos || []).map(g => g.id === gastoId ? { ...g, ...cambios } : g),
    }))
  }

  const agregarGasto = (rendicionId: string, gasto: RendicionGasto) => {
    setRendiciones(prev => prev.map(r => r.id !== rendicionId ? r : {
      ...r,
      gastos: [gasto, ...(r.gastos || [])],
    }))
  }

  const eliminarGastoLocal = (rendicionId: string, gastoId: string) => {
    startTransition(async () => {
      try {
        setRendiciones(prev => prev.map(r => r.id !== rendicionId ? r : {
          ...r, gastos: (r.gastos || []).filter(g => g.id !== gastoId),
        }))
        await eliminarGasto(gastoId)
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al eliminar gasto')
      }
    })
  }

  const aprobarContenido = (rendicionId: string, gastoId: string) => {
    startTransition(async () => {
      try {
        actualizarGasto(rendicionId, gastoId, { estado: 'aprobada' })
        await aprobarGasto(gastoId)
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al aprobar gasto')
      }
    })
  }

  const rechazar = (rendicionId: string, gastoId: string) => {
    if (!motivo.trim()) return
    startTransition(async () => {
      try {
        actualizarGasto(rendicionId, gastoId, { estado: 'rechazada', motivo_rechazo: motivo })
        await rechazarGasto(gastoId, motivo)
        setModalRechazo(null)
        setMotivo('')
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al rechazar gasto')
      }
    })
  }

  const aprobarPago = (rendicionId: string, gastoId: string, comprobante?: string) => {
    startTransition(async () => {
      try {
        actualizarGasto(rendicionId, gastoId, { estado: 'pago_aprobado', comprobante_pago_url: comprobante })
        await aprobarPagoGasto(gastoId, comprobante)
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al aprobar pago')
      }
    })
  }

  const handleCrearRendicion = async (forzar = false) => {
    if (!cotizacionSeleccionada) return
    setCreandoRendicion(true)
    setConflictoExistente(false)
    try {
      const nueva = forzar
        ? await purgarYCrearRendicion(cotizacionSeleccionada)
        : await crearRendicion(cotizacionSeleccionada)
      setRendiciones(prev => [nueva, ...prev])
      setExpandidos(p => ({ ...p, [nueva.id]: true }))
      setModalNuevaRendicion(false)
      setCotizacionSeleccionada('')
    } catch (e: any) {
      if (e?.message?.includes('Ya existe')) {
        setConflictoExistente(true)
      } else {
        console.error('Error al crear rendición:', e)
      }
    } finally {
      setCreandoRendicion(false)
    }
  }

  const handleGenerarLink = async () => {
    if (!modalLink) return
    setGenerandoLink(true)
    try {
      const result = await generarLinkTemporalExterno({
        rendicion_id: modalLink.rendicionId,
        cotizacion_item_id: modalLink.itemId,
        email: linkForm.email.trim() || undefined,
        colaborador_id: linkForm.colaboradorId || null,
        dias_expiracion: linkForm.dias,
      })
      setLinkGenerado(result.url)
    } catch (e: any) {
      console.error('Error generando link:', e)
    } finally {
      setGenerandoLink(false)
    }
  }

  const cerrarModalLink = () => {
    setModalLink(null)
    setLinkGenerado(null)
    setLinkForm({ email: '', colaboradorId: '', dias: 7 })
  }

  const cotizacionIdsConRendicion = new Set(rendiciones.map(r => r.cotizacion_id))
  const cotizacionesDisponibles = cotizacionesForm.filter(c => !cotizacionIdsConRendicion.has(c.id))
  const todosGastos = rendiciones.flatMap(r => r.gastos || [])

  const handleEliminarLink = async (id: string) => {
    setConfirmarEliminarLink(null)
    try {
      await eliminarLinkTemporal(id)
      setLinks(prev => prev.filter(l => l.id !== id))
    } catch (e: any) {
      console.error('Error al eliminar link:', e)
    }
  }

  const handleReenviarLink = async (id: string) => {
    try {
      await reenviarEmailLink(id)
      // success — el link sigue vigente, sin modal necesario
    } catch (e: any) {
      console.error('Error al reenviar email:', e)
    }
  }

  const handleToggleFactura = (rendicionId: string, valor: boolean) => {
    actualizarRendicion(rendicionId, { factura_emitida: valor })
    startTransition(async () => {
      try { await toggleFacturaEmitida(rendicionId, valor) } catch (e) { toastError(e instanceof Error ? e.message : 'Error al actualizar') }
    })
  }

  const handleTogglePago = (rendicionId: string, valor: boolean) => {
    actualizarRendicion(rendicionId, { pago_recibido: valor })
    startTransition(async () => {
      try { await togglePagoRecibido(rendicionId, valor) } catch (e) { toastError(e instanceof Error ? e.message : 'Error al actualizar') }
    })
  }

  const handleAgregarArchivoFactura = async (rendicionId: string, file: File) => {
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('carpeta', 'facturas')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) { toastError('Error al subir archivo'); return }
      const { url } = await res.json()
      toastOk('Archivo subido')
      const archivos = await agregarArchivoFactura(rendicionId, url)
      actualizarRendicion(rendicionId, { factura_archivos: archivos })
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al subir archivo')
    }
  }

  const handleEliminarArchivoFactura = async (rendicionId: string, url: string) => {
    try {
      const archivos = await eliminarArchivoFactura(rendicionId, url)
      actualizarRendicion(rendicionId, { factura_archivos: archivos })
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al eliminar archivo')
    }
  }

  return (
    <div className="space-y-8">

      {/* Tabs */}
      <div className="flex gap-0 border-b border-ch-border">
        <button onClick={() => setPestana('rendiciones')}
          className={`font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2.5 border-b-2 transition-colors ${pestana === 'rendiciones' ? 'border-ch-green text-ch-cream' : 'border-transparent text-ch-muted hover:text-ch-cream'}`}>
          Rendiciones
        </button>
        <button onClick={() => setPestana('links')}
          className={`font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2.5 border-b-2 transition-colors ${pestana === 'links' ? 'border-ch-green text-ch-cream' : 'border-transparent text-ch-muted hover:text-ch-cream'}`}>
          Links{links.length > 0 && <span className="ml-1.5 font-mono text-[9px] text-ch-muted">({links.length})</span>}
        </button>
      </div>

      {/* ── PESTAÑA LINKS ─────────────────────────────────────────────────────── */}
      {pestana === 'links' && (
        <div className="space-y-3">
          {links.length === 0 ? (
            <EstadoVacio mensaje="No hay links generados aún." />
          ) : links.map(link => {
            const vencido = new Date(link.expires_at) < new Date()
            const diasRestantes = Math.ceil((new Date(link.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            const cotNombre = link.rendicion?.cotizacion?.nombre || '—'
            const numBase = link.rendicion?.cotizacion?.grupo?.numero_base
            const itemNombre = link.cotizacion_item?.nombre || '—'
            const destEmail = link.email || link.colaborador?.email || null
            const destNombre = link.colaborador?.nombre || link.email || 'Sin destinatario'

            return (
              <div key={link.id} className={`border p-4 ${vencido ? 'border-ch-border/30 opacity-60' : 'border-ch-border/60'}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-body text-xs text-ch-cream">{destNombre}</span>
                      {destEmail && destEmail !== destNombre && (
                        <span className="font-body text-[10px] text-ch-muted">{destEmail}</span>
                      )}
                      {vencido
                        ? <span className="font-body text-[9px] px-1.5 border border-red-500/40 text-red-400">Vencido</span>
                        : <span className="font-body text-[9px] px-1.5 border border-ch-green/30 text-ch-green">Vigente</span>
                      }
                    </div>
                    <p className="font-body text-[10px] text-ch-muted">
                      {numBase && <span className="mr-1">{numBase}</span>}
                      {cotNombre} · <span className="text-ch-cream/70">{itemNombre}</span>
                    </p>
                    <p className="font-body text-[10px] text-ch-muted font-mono break-all">/r/{link.token}</p>
                    <p className="font-body text-[10px] text-ch-muted">
                      {vencido
                        ? `Venció ${new Date(link.expires_at).toLocaleDateString('es-CL')}`
                        : `Vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''} · ${new Date(link.expires_at).toLocaleDateString('es-CL')}`
                      }
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}/r/${link.token}`)}
                      className="font-body text-[10px] tracking-wider uppercase px-3 py-1.5 border border-ch-border text-ch-muted hover:text-ch-cream transition-colors">
                      Copiar link
                    </button>
                    {!vencido && destEmail && (
                      <button onClick={() => handleReenviarLink(link.id)}
                        className="font-body text-[10px] tracking-wider uppercase px-3 py-1.5 border border-ch-border text-ch-muted hover:text-ch-cream transition-colors">
                        Reenviar email
                      </button>
                    )}
                    {confirmarEliminarLink === link.id ? (
                      <span className="flex items-center gap-1">
                        <span className="font-body text-[10px] text-ch-muted">¿Eliminar?</span>
                        <button onClick={() => handleEliminarLink(link.id)}
                          className="font-body text-[10px] text-red-400 hover:text-red-300 px-1 transition-colors">
                          Sí
                        </button>
                        <button onClick={() => setConfirmarEliminarLink(null)}
                          className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1 transition-colors">
                          No
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmarEliminarLink(link.id)}
                        className="font-body text-[10px] tracking-wider uppercase px-3 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── PESTAÑA RENDICIONES ───────────────────────────────────────────────── */}
      {pestana === 'rendiciones' && <>

      {/* Barra superior */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-4 text-ch-muted font-body text-[10px] tracking-wider">
          <span>{todosGastos.filter(g => g.estado === 'enviada').length} enviados</span>
          <span>{todosGastos.filter(g => g.estado === 'aprobada').length} por pagar</span>
          <span>{todosGastos.filter(g => g.estado === 'pago_aprobado').length} pagados</span>
        </div>
        <button onClick={() => setModalNuevaRendicion(true)}
          disabled={cotizacionesDisponibles.length === 0}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-5 py-2.5 transition-colors disabled:opacity-40">
          + Nueva rendición
        </button>
      </div>

      {/* Lista vacía */}
      {rendiciones.length === 0 && (
        <EstadoVacio mensaje="No hay rendiciones." submensaje="Crea una con el botón de arriba." />
      )}

      {/* Lista de rendiciones */}
      {rendiciones.map(rendicion => {
        const cotizacion = cotizacionesForm.find(c => c.id === rendicion.cotizacion_id)
        const gastos = rendicion.gastos || []
        const numBase = rendicion.cotizacion?.grupo?.numero_base || cotizacion?.grupo?.numero_base
        const nombreCot = rendicion.cotizacion?.nombre || cotizacion?.nombre || '—'
        const isExpandida = expandidos[rendicion.id] !== false
        const gastosLibres = gastos.filter(g => !g.cotizacion_item_id)
        const pendientes = gastos.filter(g => g.estado === 'enviada').length
        const porPagar = gastos.filter(g => g.estado === 'aprobada').length

        return (
          <div key={rendicion.id} className="border border-ch-border/50">
            {/* Header cotización */}
            <div className="flex items-center gap-3 p-4 hover:bg-ch-surface/10">
              <span className="font-body text-[10px] text-ch-muted cursor-pointer" onClick={() => toggleExpand(rendicion.id)}>{isExpandida ? '▾' : '▸'}</span>
              <h2 className="font-display italic text-xl text-ch-cream flex-1 cursor-pointer" onClick={() => toggleExpand(rendicion.id)}>
                {numBase && <span className="font-body text-sm not-italic text-ch-muted mr-2">{numBase}</span>}
                {nombreCot}
              </h2>
              <div className="flex items-center gap-3 font-body text-[10px]">
                {pendientes > 0 && <span className="text-amber-400">{pendientes} pendiente{pendientes > 1 ? 's' : ''}</span>}
                {porPagar > 0 && <span className="text-blue-400">{porPagar} por pagar</span>}
                <span className="text-ch-muted">{gastos.length} gasto{gastos.length !== 1 ? 's' : ''}</span>
                {confirmarEliminarRendicion === rendicion.id ? (
                  <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <span className="font-body text-[10px] text-ch-muted">¿Eliminar?</span>
                    <button
                      onClick={() => {
                        setConfirmarEliminarRendicion(null)
                        eliminarRendicion(rendicion.id).then(() =>
                          setRendiciones(prev => prev.filter(r => r.id !== rendicion.id))
                        )
                      }}
                      className="font-body text-[10px] text-red-400 hover:text-red-300 px-1 transition-colors">
                      Sí
                    </button>
                    <button onClick={() => setConfirmarEliminarRendicion(null)}
                      className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1 transition-colors">
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmarEliminarRendicion(rendicion.id) }}
                    className="text-ch-muted hover:text-red-400 transition-colors px-1"
                    title="Eliminar rendición">
                    ✕
                  </button>
                )}
              </div>
            </div>

            <FacturaPagoBar
              rendicion={rendicion}
              onToggleFactura={v => handleToggleFactura(rendicion.id, v)}
              onTogglePago={v => handleTogglePago(rendicion.id, v)}
              onAgregarArchivo={f => handleAgregarArchivoFactura(rendicion.id, f)}
              onEliminarArchivo={url => handleEliminarArchivoFactura(rendicion.id, url)}
            />

            {isExpandida && (
              <div className="p-4 lg:p-6 pt-2 space-y-6">
                {cotizacion?.departamentos ? (
                  cotizacion.departamentos
                    .slice().sort((a, b) => a.orden - b.orden)
                    .map(dep => {
                      const itemsDirectos = (dep.items ?? []).filter((i: any) => !i.subgrupo_id)
                      const subgrupos = dep.subgrupos ?? []
                      const todosItems: Item[] = [...itemsDirectos, ...subgrupos.flatMap(sg => sg.items ?? [])]
                      if (!todosItems.length) return null

                      return (
                        <DepSection key={dep.id} nombre={dep.nombre}>
                          <div className="space-y-1">
                            {subgrupos.slice().sort((a, b) => a.orden - b.orden).map(sg => (
                              <div key={sg.id} className="mb-3">
                                {sg.nombre && <p className="font-body text-[10px] text-ch-muted italic mb-1.5">{sg.nombre}</p>}
                                <div className="space-y-1 pl-2">
                                  {(sg.items ?? []).map((item: Item) => (
                                    <ItemGlosaSection
                                      key={item.id}
                                      rendicionId={rendicion.id}
                                      item={item}
                                      gastos={gastos.filter(g => g.cotizacion_item_id === item.id)}
                                      onAgregarGasto={g => agregarGasto(rendicion.id, g)}
                                      onAprobarContenido={gastoId => aprobarContenido(rendicion.id, gastoId)}
                                      onRechazar={gastoId => { setModalRechazo({ gastoId, rendicionId: rendicion.id }); setMotivo('') }}
                                      onAprobarPago={(gastoId, comp) => aprobarPago(rendicion.id, gastoId, comp)}
                                      onGenerarLink={() => { setModalLink({ rendicionId: rendicion.id, itemId: item.id, itemNombre: item.nombre }); setLinkGenerado(null) }}
                                      onEliminarGasto={gastoId => eliminarGastoLocal(rendicion.id, gastoId)}
                                      puedeAprobarPago={puedeAprobarPago}
                                      puedeGenerarLink={puedeGenerarLink}
                                      colaboradorId={colaboradorId}
                                      isPending={isPending}
                                    />
                                  ))}
                                </div>
                              </div>
                            ))}
                            {itemsDirectos.map((item: Item) => (
                              <ItemGlosaSection
                                key={item.id}
                                rendicionId={rendicion.id}
                                item={item}
                                gastos={gastos.filter(g => g.cotizacion_item_id === item.id)}
                                onAgregarGasto={g => agregarGasto(rendicion.id, g)}
                                onAprobarContenido={gastoId => aprobarContenido(rendicion.id, gastoId)}
                                onRechazar={gastoId => { setModalRechazo({ gastoId, rendicionId: rendicion.id }); setMotivo('') }}
                                onAprobarPago={(gastoId, comp) => aprobarPago(rendicion.id, gastoId, comp)}
                                onGenerarLink={() => { setModalLink({ rendicionId: rendicion.id, itemId: item.id, itemNombre: item.nombre }); setLinkGenerado(null) }}
                                onEliminarGasto={gastoId => eliminarGastoLocal(rendicion.id, gastoId)}
                                puedeAprobarPago={puedeAprobarPago}
                                puedeGenerarLink={puedeGenerarLink}
                                colaboradorId={colaboradorId}
                                isPending={isPending}
                              />
                            ))}
                          </div>
                        </DepSection>
                      )
                    })
                ) : (
                  <div className="space-y-2">
                    {gastos.map(g => (
                      <GastoRow key={g.id} gasto={g}
                        onAprobarContenido={() => aprobarContenido(rendicion.id, g.id)}
                        onAprobarPago={comp => aprobarPago(rendicion.id, g.id, comp)}
                        onRechazar={() => { setModalRechazo({ gastoId: g.id, rendicionId: rendicion.id }); setMotivo('') }}
                        onEliminar={() => eliminarGastoLocal(rendicion.id, g.id)}
                        puedeAprobarPago={puedeAprobarPago}
                        isPending={isPending}
                      />
                    ))}
                  </div>
                )}

                {/* Gastos sin glosa */}
                {gastosLibres.length > 0 && (
                  <div>
                    <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-3 pb-1 border-b border-ch-border/40">
                      Gastos no presupuestados
                    </p>
                    <div className="space-y-2">
                      {gastosLibres.map(g => (
                        <GastoRow key={g.id} gasto={g}
                          onAprobarContenido={() => aprobarContenido(rendicion.id, g.id)}
                          onAprobarPago={comp => aprobarPago(rendicion.id, g.id, comp)}
                          onRechazar={() => { setModalRechazo({ gastoId: g.id, rendicionId: rendicion.id }); setMotivo('') }}
                          onEliminar={() => eliminarGastoLocal(rendicion.id, g.id)}
                          puedeAprobarPago={puedeAprobarPago}
                          isPending={isPending}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      </>}

      {/* Modal nueva rendición */}
      {modalNuevaRendicion && (
        <div className="fixed inset-0 bg-ch-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-ch-dark border border-ch-border p-6 w-full max-w-md">
            <h3 className="font-display italic text-2xl text-ch-cream mb-5">Nueva rendición</h3>
            {cotizacionesDisponibles.length === 0 ? (
              <>
                <p className="font-body text-sm text-ch-muted mb-5">Todas las cotizaciones ya tienen rendición activa.</p>
                <button onClick={() => setModalNuevaRendicion(false)}
                  className="w-full border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs py-2.5 transition-colors">
                  Cerrar
                </button>
              </>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Cotización</label>
                  <select value={cotizacionSeleccionada} onChange={e => { setCotizacionSeleccionada(e.target.value); setConflictoExistente(false) }} className="input-ch w-full">
                    <option value="">— Seleccionar —</option>
                    {cotizacionesDisponibles.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.grupo?.numero_base ? `${c.grupo.numero_base} · ` : ''}{c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                {conflictoExistente && (
                  <div className="border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                    <p className="font-body text-[10px] text-amber-400">
                      Ya existe una rendición para esta cotización que no está visible en la lista. Puede purgarla y crear una nueva.
                    </p>
                    <button onClick={() => handleCrearRendicion(true)} disabled={creandoRendicion}
                      className="w-full border border-red-500/40 text-red-400 hover:bg-red-500/10 font-body text-[10px] tracking-[0.35em] uppercase py-2 transition-colors disabled:opacity-50">
                      {creandoRendicion ? 'Purgando...' : 'Purgar y crear nueva'}
                    </button>
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => handleCrearRendicion(false)} disabled={!cotizacionSeleccionada || creandoRendicion}
                    className="flex-1 bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[10px] tracking-[0.35em] uppercase py-3 transition-colors disabled:opacity-50">
                    {creandoRendicion ? 'Creando...' : 'Crear rendición'}
                  </button>
                  <button onClick={() => { setModalNuevaRendicion(false); setCotizacionSeleccionada(''); setConflictoExistente(false) }}
                    className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-4 transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal generar link externo */}
      {modalLink && (
        <div className="fixed inset-0 bg-ch-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-ch-dark border border-ch-border p-6 w-full max-w-md">
            <h3 className="font-display italic text-2xl text-ch-cream mb-1">Generar link externo</h3>
            <p className="font-body text-[10px] text-ch-muted mb-5 truncate">{modalLink.itemNombre}</p>

            {linkGenerado ? (
              <div className="space-y-4">
                <div className="border border-ch-green/30 bg-ch-green/5 p-3">
                  <p className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-green mb-2">
                    Link generado{linkForm.email.trim() ? ' · email enviado' : ''}
                  </p>
                  <p className="font-mono text-xs text-ch-cream break-all select-all">{linkGenerado}</p>
                </div>
                <button onClick={() => navigator.clipboard.writeText(linkGenerado)}
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
                  <input type="email" value={linkForm.email}
                    onChange={e => setLinkForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="nombre@email.com" autoFocus className="input-ch w-full" />
                </div>
                <div>
                  <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Colaborador en directorio (opcional)</label>
                  <select value={linkForm.colaboradorId}
                    onChange={e => setLinkForm(p => ({ ...p, colaboradorId: e.target.value }))}
                    className="input-ch w-full">
                    <option value="">— Sin ficha en directorio —</option>
                    {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Días de vigencia</label>
                  <select value={linkForm.dias}
                    onChange={e => setLinkForm(p => ({ ...p, dias: Number(e.target.value) }))}
                    className="input-ch w-full">
                    <option value={3}>3 días</option>
                    <option value={7}>7 días (default)</option>
                    <option value={14}>14 días</option>
                    <option value={30}>30 días</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={handleGenerarLink} disabled={generandoLink}
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
              <button onClick={() => rechazar(modalRechazo.rendicionId, modalRechazo.gastoId)}
                disabled={isPending || !motivo.trim()}
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

// ─── DepSection ───────────────────────────────────────────────────────────────

function DepSection({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(true)
  return (
    <div>
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center gap-2 mb-3 pb-1 border-b border-ch-border/40 group">
        <span className="font-body text-[9px] text-ch-muted group-hover:text-ch-cream transition-colors">{abierto ? '▾' : '▸'}</span>
        <span className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted group-hover:text-ch-cream transition-colors flex-1 text-left">{nombre}</span>
      </button>
      {abierto && children}
    </div>
  )
}

// ─── ItemGlosaSection ─────────────────────────────────────────────────────────

function ItemGlosaSection({
  rendicionId, item, gastos,
  onAgregarGasto,
  onAprobarContenido, onRechazar, onAprobarPago, onGenerarLink, onEliminarGasto,
  puedeAprobarPago, puedeGenerarLink, colaboradorId, isPending,
}: {
  rendicionId: string
  item: Item
  gastos: RendicionGasto[]
  onAgregarGasto: (g: RendicionGasto) => void
  onAprobarContenido: (gastoId: string) => void
  onRechazar: (gastoId: string) => void
  onAprobarPago: (gastoId: string, comprobante?: string) => void
  onGenerarLink: () => void
  onEliminarGasto: (gastoId: string) => void
  puedeAprobarPago: boolean
  puedeGenerarLink: boolean
  colaboradorId?: string
  isPending: boolean
}) {
  const [isPendingLocal, startTransitionLocal] = useTransition()
  const [completado, setCompletado] = useState(item.rendicion_completada ?? false)
  const [formAbierto, setFormAbierto] = useState(false)
  const [notasAbiertas, setNotasAbiertas] = useState(false)

  const presupuesto = item.precio_neto_proveedor * item.cantidad
  const rendido = gastos
    .filter(g => ['enviada', 'aprobada', 'pago_aprobado'].includes(g.estado))
    .reduce((s, g) => s + g.monto, 0)
  const diferencia = presupuesto - rendido
  const esPerdida = diferencia < 0

  const handleToggleCompletado = (v: boolean) => {
    setCompletado(v)
    startTransitionLocal(async () => {
      try { await toggleItemCompletado(item.id, v) } catch (e) { toastError(e instanceof Error ? e.message : 'Error al actualizar') }
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5">
        <span className="font-body text-xs text-ch-cream flex-1">{item.nombre}</span>
        <span className="font-body text-[10px] text-ch-muted font-mono whitespace-nowrap hidden sm:block">
          ${presupuesto.toLocaleString('es-CL')}
          {rendido > 0 && <> · rend ${rendido.toLocaleString('es-CL')}</>}
          {' · '}
          <span className={esPerdida ? 'text-red-400' : ''}>
            {esPerdida ? `−$${Math.abs(diferencia).toLocaleString('es-CL')}` : `disp $${diferencia.toLocaleString('es-CL')}`}
          </span>
        </span>
        <button onClick={() => setNotasAbiertas(v => !v)}
          className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1"
          title="Notas">📝</button>
        {puedeGenerarLink && (
          <button onClick={onGenerarLink}
            className="font-body text-[9px] text-ch-muted hover:text-blue-300 transition-colors px-2 py-0.5 border border-ch-border/40 hover:border-blue-500/40 whitespace-nowrap">
            Link →
          </button>
        )}
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={completado} disabled={isPendingLocal}
            onChange={e => handleToggleCompletado(e.target.checked)}
            className="accent-ch-green w-3 h-3" />
          <span className="font-body text-[9px] text-ch-muted">Rendido</span>
        </label>
        <button onClick={() => setFormAbierto(v => !v)}
          className={`font-body text-[9px] tracking-wider uppercase px-2.5 py-1 border transition-colors whitespace-nowrap ${
            formAbierto
              ? 'border-ch-green/50 text-ch-green bg-ch-green/5'
              : 'border-ch-border/50 text-ch-muted hover:text-ch-cream hover:border-ch-border'
          }`}>
          {formAbierto ? '− Cancelar' : '+ Gasto'}
        </button>
      </div>

      {notasAbiertas && <NotasGlosa cotizacionItemId={item.id} />}

      {formAbierto && (
        <div className="ml-2 mb-2">
          <FormularioGasto
            rendicionId={rendicionId}
            cotizacionItemId={item.id}
            itemTipo={item.tipo}
            colaboradorId={colaboradorId}
            esExterno={false}
            onSuccess={(gasto, continuar) => {
              onAgregarGasto(gasto)
              if (!continuar) setFormAbierto(false)
            }}
            onCancel={() => setFormAbierto(false)}
          />
        </div>
      )}

      {gastos.length > 0 && (
        <div className="ml-4 space-y-2 mt-1 mb-2">
          {gastos.map(g => (
            <GastoRow key={g.id} gasto={g}
              onAprobarContenido={() => onAprobarContenido(g.id)}
              onAprobarPago={comp => onAprobarPago(g.id, comp)}
              onRechazar={() => onRechazar(g.id)}
              onEliminar={() => onEliminarGasto(g.id)}
              puedeAprobarPago={puedeAprobarPago}
              isPending={isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── GastoRow ─────────────────────────────────────────────────────────────────

function GastoRow({ gasto: g, onAprobarContenido, onAprobarPago, onRechazar, onEliminar, puedeAprobarPago: puedeAprobarPagoProp, isPending }: {
  gasto: RendicionGasto
  onAprobarContenido: () => void
  onAprobarPago: (comprobante?: string) => void
  onRechazar: () => void
  onEliminar?: () => void
  puedeAprobarPago: boolean
  isPending: boolean
}) {
  const [mostrarFormPago, setMostrarFormPago] = useState(false)
  const [subiendoPago, setSubiendoPago] = useState(false)
  const [comprobantePago, setComprobantePago] = useState<{ url: string; nombre: string } | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState(false)
  const fileRefPago = useRef<HTMLInputElement>(null)

  const retencion = g.tipo_documento ? calcularRetencion(g) : null
  const colNombre = (g.colaborador as any)?.nombre || g.nombre_libre || '—'
  const esExterno = g.origen === 'externo'
  const puedeAprobarPago = puedeAprobarPagoProp && ((g.estado === 'enviada' && !esExterno) || g.estado === 'aprobada')

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
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al subir comprobante')
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
    <div className={`border p-3 ${ESTADO_BORDER[g.estado] || 'border-ch-border/40'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-body text-xs text-ch-cream">{colNombre}</span>
            <span className="font-body text-[9px] text-ch-muted">{TIPO_LABEL[g.tipo] || g.tipo}</span>
            {esExterno && <span className="font-body text-[9px] px-1.5 border border-blue-500/40 text-blue-400">Externo</span>}
            {g.tipo_documento === 'sin_documento' && (
              <span className="font-body text-[9px] px-1.5 border border-red-500/40 text-red-400">⚠ SIN DOC</span>
            )}
            {g.tipo_documento === 'boleta' && <span className="font-body text-[9px] text-ch-muted">Boleta</span>}
            {g.tipo_documento === 'factura' && <span className="font-body text-[9px] text-ch-muted">Factura</span>}
            {g.tipo_documento === 'exenta' && (
              <span className="font-body text-[9px] px-1.5 border border-ch-border/40 text-ch-muted">Exenta</span>
            )}
          </div>
          <p className="font-body text-[10px] text-ch-muted truncate">{g.descripcion}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="font-body text-sm text-ch-cream font-mono">${g.monto.toLocaleString('es-CL')}</span>
            {retencion && retencion.retencion > 0 && (
              <span className="font-body text-[10px] text-ch-muted font-mono">
                ret. ${retencion.retencion.toLocaleString('es-CL')} · neto ${retencion.neto.toLocaleString('es-CL')}
              </span>
            )}
          </div>
          {g.estado === 'rechazada' && g.motivo_rechazo && (
            <p className="font-body text-[10px] text-red-400 mt-1">Motivo: {g.motivo_rechazo}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {g.foto_url && (
            <a href={g.foto_url} target="_blank" rel="noopener noreferrer"
              className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors">
              Ver comprobante →
            </a>
          )}
          {g.comprobante_pago_url && (
            <a href={g.comprobante_pago_url} target="_blank" rel="noopener noreferrer"
              className="font-body text-[10px] text-ch-green hover:text-ch-green-light transition-colors">
              Ver comprobante pago →
            </a>
          )}

          {g.estado === 'enviada' && esExterno && (
            <div className="flex gap-1.5">
              <button onClick={onAprobarContenido} disabled={isPending}
                className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 transition-colors disabled:opacity-50">
                Aprobar
              </button>
              <button onClick={onRechazar} disabled={isPending}
                className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                Rechazar
              </button>
            </div>
          )}

          {g.estado === 'aprobada' && (
            <button onClick={onRechazar} disabled={isPending}
              className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 border border-red-500/30 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
              Rechazar
            </button>
          )}

          {puedeAprobarPago && !mostrarFormPago && (
            <button onClick={() => setMostrarFormPago(true)} disabled={isPending}
              className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 bg-ch-green hover:bg-ch-green-light text-ch-black transition-colors disabled:opacity-50">
              ✓ Pago
            </button>
          )}

          {g.estado === 'pago_aprobado' && (
            <span className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-ch-green/30 text-ch-green">Pagado</span>
          )}
          {g.estado === 'rechazada' && (
            <span className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-red-500/30 text-red-400">Rechazada</span>
          )}
          {g.estado === 'borrador' && (
            <span className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-ch-border text-ch-muted">Borrador</span>
          )}
          {g.estado === 'aprobada' && !puedeAprobarPago && (
            <span className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-blue-500/30 text-blue-400">Aprobado</span>
          )}

          {onEliminar && !confirmEliminar && (
            <button onClick={() => setConfirmEliminar(true)} disabled={isPending}
              title="Eliminar gasto"
              className="font-body text-[10px] text-ch-muted/40 hover:text-red-400 transition-colors px-1 disabled:opacity-30">
              ✕
            </button>
          )}
          {onEliminar && confirmEliminar && (
            <span className="flex items-center gap-1">
              <span className="font-body text-[10px] text-ch-muted">¿Eliminar?</span>
              <button onClick={() => { setConfirmEliminar(false); onEliminar() }}
                className="font-body text-[10px] text-red-400 hover:text-red-300 px-1 transition-colors">
                Sí
              </button>
              <button onClick={() => setConfirmEliminar(false)}
                className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1 transition-colors">
                No
              </button>
            </span>
          )}
        </div>
      </div>

      {mostrarFormPago && (
        <div className="mt-3 pt-3 border-t border-ch-border/40 space-y-2">
          <p className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Comprobante de pago (opcional)</p>
          <input ref={fileRefPago} type="file" accept="image/*,application/pdf"
            onChange={e => { if (e.target.files?.[0]) subirComprobantePago(e.target.files[0]) }}
            className="hidden" />
          {comprobantePago ? (
            <div className="flex items-center gap-2 p-2 border border-ch-border/50">
              <span className="font-body text-[10px] text-ch-cream truncate flex-1">{comprobantePago.nombre}</span>
              <button onClick={() => setComprobantePago(null)} className="text-ch-muted hover:text-red-400 text-xs">✕</button>
            </div>
          ) : (
            <button onClick={() => fileRefPago.current?.click()} disabled={subiendoPago}
              className="w-full border border-dashed border-ch-border/50 text-ch-muted hover:text-ch-cream font-body text-[10px] py-2 transition-colors disabled:opacity-50">
              {subiendoPago ? 'Subiendo...' : '📎 Adjuntar comprobante'}
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

// ─── FACTURA / PAGO BAR ───────────────────────────────────────────────────────

function FacturaPagoBar({
  rendicion,
  onToggleFactura,
  onTogglePago,
  onAgregarArchivo,
  onEliminarArchivo,
}: {
  rendicion: Rendicion
  onToggleFactura: (v: boolean) => void
  onTogglePago: (v: boolean) => void
  onAgregarArchivo: (f: File) => Promise<void>
  onEliminarArchivo: (url: string) => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const archivos = rendicion.factura_archivos ?? []

  function nombreCorto(url: string) {
    const partes = url.split('/')
    return partes[partes.length - 1].slice(0, 28)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    try { await onAgregarArchivo(file) } finally { setSubiendo(false) }
    e.target.value = ''
  }

  return (
    <div className="border-t border-ch-border/30 px-4 py-3 flex items-start gap-6 flex-wrap bg-zinc-950/40">
      <label className="flex items-center gap-2 cursor-pointer select-none group">
        <button
          type="button"
          role="checkbox"
          aria-checked={rendicion.factura_emitida}
          onClick={() => onToggleFactura(!rendicion.factura_emitida)}
          className={`w-8 h-4 rounded-full transition-colors relative ${rendicion.factura_emitida ? 'bg-ch-green' : 'bg-zinc-700'}`}
        >
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${rendicion.factura_emitida ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
        <span className={`font-body text-[10px] tracking-[0.3em] uppercase transition-colors ${rendicion.factura_emitida ? 'text-ch-cream' : 'text-ch-muted group-hover:text-ch-cream'}`}>
          Factura emitida
        </span>
      </label>

      <div className="flex items-center gap-2 flex-wrap">
        {archivos.map(url => (
          <div key={url} className="flex items-center gap-1 border border-ch-border/50 px-2 py-1">
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="font-body text-[9px] text-blue-400 hover:underline truncate max-w-[140px]">
              {nombreCorto(url)}
            </a>
            <button onClick={() => onEliminarArchivo(url)}
              className="text-zinc-700 hover:text-red-400 transition-colors text-xs leading-none ml-0.5">×</button>
          </div>
        ))}
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleFile} className="hidden" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={subiendo}
          className="font-body text-[9px] tracking-widest uppercase px-2.5 py-1 border border-ch-border/50 text-ch-muted hover:text-ch-cream transition-colors disabled:opacity-50">
          {subiendo ? '...' : '+ Adjuntar'}
        </button>
      </div>

      <div className="hidden sm:block h-4 w-px bg-ch-border/30 self-center" />

      <label className="flex items-center gap-2 cursor-pointer select-none group">
        <button
          type="button"
          role="checkbox"
          aria-checked={rendicion.pago_recibido}
          onClick={() => onTogglePago(!rendicion.pago_recibido)}
          className={`w-8 h-4 rounded-full transition-colors relative ${rendicion.pago_recibido ? 'bg-ch-green' : 'bg-zinc-700'}`}
        >
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${rendicion.pago_recibido ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
        <span className={`font-body text-[10px] tracking-[0.3em] uppercase transition-colors ${rendicion.pago_recibido ? 'text-ch-cream' : 'text-ch-muted group-hover:text-ch-cream'}`}>
          Pago recibido
        </span>
      </label>
    </div>
  )
}
