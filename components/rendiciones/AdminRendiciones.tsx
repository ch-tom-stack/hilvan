'use client'

import { useState, useTransition } from 'react'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
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
import { ModalNuevaRendicion, ModalLinkExterno, ModalRechazo } from './ModalesRendicion'
import PestanaLinks, { type LinkTemporal } from './PestanaLinks'

interface Subgrupo { id: string; nombre: string; orden: number; items?: Item[] }
interface Departamento { id: string; nombre: string; orden: number; subgrupos?: Subgrupo[]; items?: any[] }
interface CotizacionForm {
  id: string
  nombre: string
  grupo?: { numero_base?: string }
  departamentos?: Departamento[]
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
  const [filtroQ, setFiltroQ] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string | null>(null)

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

  // Búsqueda/filtro: todo en memoria (los datos ya están cargados completos).
  // El estado vive por GASTO, no por rendición — filtrar por estado muestra la
  // rendición completa si ALGÚN gasto calza (no oculta el resto de sus gastos).
  const rendicionesFiltradas = rendiciones.filter(r => {
    const cotizacion = cotizacionesForm.find(c => c.id === r.cotizacion_id)
    const numBase = r.cotizacion?.grupo?.numero_base || cotizacion?.grupo?.numero_base || ''
    const nombreCot = r.cotizacion?.nombre || cotizacion?.nombre || ''
    if (filtroQ.trim()) {
      const needle = filtroQ.trim().toLowerCase()
      if (!numBase.toLowerCase().includes(needle) && !nombreCot.toLowerCase().includes(needle)) return false
    }
    if (filtroEstado) {
      if (!(r.gastos || []).some(g => g.estado === filtroEstado)) return false
    }
    return true
  })
  const hayFiltro = Boolean(filtroQ.trim() || filtroEstado)

  const handleEliminarLink = async (id: string) => {
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
      momento('subido', { mensaje: 'Archivo subido' })
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
        <PestanaLinks
          links={links}
          onEliminar={handleEliminarLink}
          onReenviar={handleReenviarLink}
        />
      )}

      {/* ── PESTAÑA RENDICIONES ───────────────────────────────────────────────── */}
      {pestana === 'rendiciones' && <>

      {/* Barra superior */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-4 text-ch-muted font-body text-[10px] tracking-wider">
          <span>{todosGastos.filter(g => g.estado === 'enviada').length} enviados</span>
          <span>{todosGastos.filter(g => (g.estado === 'aprobada' || g.estado === 'pago_aprobado') && !g.pagado).length} por pagar</span>
          <span>{todosGastos.filter(g => g.pagado).length} pagados</span>
        </div>
        <button onClick={() => setModalNuevaRendicion(true)}
          disabled={cotizacionesDisponibles.length === 0}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-5 py-2.5 transition-colors disabled:opacity-40">
          + Nueva rendición
        </button>
      </div>

      {/* Búsqueda + filtro por estado de gasto */}
      {rendiciones.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={filtroQ}
              onChange={e => setFiltroQ(e.target.value)}
              placeholder="Buscar por número o nombre de cotización…"
              className="flex-1 bg-ch-surface border border-ch-border px-3 py-2 font-body text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-cream/40"
            />
            {hayFiltro && (
              <button
                onClick={() => { setFiltroQ(''); setFiltroEstado(null) }}
                className="px-3 py-2 font-body text-xs text-ch-muted hover:text-ch-cream transition-colors whitespace-nowrap"
              >
                ✕ limpiar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'enviada', label: 'Enviados' },
              { key: 'aprobada', label: 'Por pagar' },
              { key: 'pago_aprobado', label: 'Pago aprobado' },
              { key: 'rechazada', label: 'Rechazados' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFiltroEstado(filtroEstado === key ? null : key)}
                className={`px-2.5 py-1 font-body text-[11px] tracking-wide uppercase border transition-colors ${
                  filtroEstado === key ? 'border-ch-green text-ch-green' : 'border-ch-border text-ch-muted hover:text-ch-cream'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lista vacía */}
      {rendiciones.length === 0 && (
        <EstadoVacio mensaje="No hay rendiciones." submensaje="Crea una con el botón de arriba." />
      )}
      {rendiciones.length > 0 && rendicionesFiltradas.length === 0 && (
        <EstadoVacio mensaje="Sin resultados." submensaje="Prueba con otro término o quita el filtro." />
      )}

      {/* Lista de rendiciones */}
      {rendicionesFiltradas.map(rendicion => {
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
        <ModalNuevaRendicion
          cotizacionesDisponibles={cotizacionesDisponibles}
          cotizacionSeleccionada={cotizacionSeleccionada}
          setCotizacionSeleccionada={setCotizacionSeleccionada}
          conflictoExistente={conflictoExistente}
          setConflictoExistente={setConflictoExistente}
          creandoRendicion={creandoRendicion}
          onCrear={handleCrearRendicion}
          onCerrar={() => { setModalNuevaRendicion(false); setCotizacionSeleccionada(''); setConflictoExistente(false) }}
        />
      )}

      {/* Modal generar link externo */}
      {modalLink && (
        <ModalLinkExterno
          itemNombre={modalLink.itemNombre}
          linkGenerado={linkGenerado}
          linkForm={linkForm}
          setLinkForm={setLinkForm}
          colaboradores={colaboradores}
          generandoLink={generandoLink}
          onGenerar={handleGenerarLink}
          onCerrar={cerrarModalLink}
        />
      )}

      {/* Modal rechazo */}
      {modalRechazo && (
        <ModalRechazo
          motivo={motivo}
          setMotivo={setMotivo}
          isPending={isPending}
          onConfirmar={() => rechazar(modalRechazo.rendicionId, modalRechazo.gastoId)}
          onCerrar={() => setModalRechazo(null)}
        />
      )}
    </div>
  )
}
