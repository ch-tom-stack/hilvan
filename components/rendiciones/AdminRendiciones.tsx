'use client'

import { useState, useTransition } from 'react'
import { toastOk, toastError } from '@/lib/toast'
import EstadoVacio from '@/components/ui/EstadoVacio'
import {
  aprobarGasto, rechazarGasto, aprobarPagoGasto,
  generarLinkTemporalExterno, crearRendicion, purgarYCrearRendicion, eliminarRendicion,
  eliminarLinkTemporal, reenviarEmailLink,
  toggleFacturaEmitida, agregarArchivoFactura, eliminarArchivoFactura, togglePagoRecibido,
  eliminarGasto,
} from '@/app/actions/rendiciones'
import type { Rendicion, RendicionGasto } from '@/types'
import { DepSection, ItemGlosaSection, GastoRow, FacturaPagoBar, type Item } from './RendicionItems'

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
