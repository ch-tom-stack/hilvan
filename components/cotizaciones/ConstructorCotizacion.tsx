'use client'

import { useState, useTransition, useCallback } from 'react'
import { useConfirm, usePrompt } from '@/components/ui/useConfirm'
import { useRouter } from 'next/navigation'
import {
  actualizarCotizacion,
  enviarCotizacion,
  nuevaVersion,
  nuevaVariante,
  duplicarCotizacion,
  agregarDepartamento,
  actualizarDepartamento,
  eliminarDepartamento,
  agregarSubgrupo,
  actualizarSubgrupo,
  eliminarSubgrupo,
  agregarItem,
  actualizarItem,
  eliminarItem,
  registrarFacturaCotizacion,
  registrarPagoCotizacion,
  cambiarEstadoCotizacion,
} from '@/app/actions/cotizaciones'
import {
  numeroCotizacion,
  calcularTotales,
  subtotalDepartamento,
  subtotalSubgrupo,
  subtotalItem,
  formatCLP,
  calcularBruto,
  type Cotizacion,
  type CotizacionDepartamento,
  type CotizacionSubgrupo,
  type CotizacionItem,
  type TarifaBase,
  type Equipo,
  type TipoItem,
  type UnidadItem,
} from '@/types'

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface Props {
  cotizacion: Cotizacion
  tarifas: TarifaBase[]
  equipos: Equipo[]
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  borrador:      { label: 'Borrador',      color: 'text-ch-muted' },
  enviada:       { label: 'Enviada',       color: 'text-blue-300' },
  aprobada:      { label: 'Aprobada',      color: 'text-ch-green' },
  rechazada:     { label: 'Rechazada',     color: 'text-red-400' },
  en_produccion: { label: 'En producción', color: 'text-amber-300' },
  cerrada:       { label: 'Cerrada',       color: 'text-ch-muted/60' },
}

const TIPO_LABELS: Record<TipoItem, string> = {
  rol:            'Rol',
  equipo_ch:      'Equipo CH',
  equipo_externo: 'Equipo externo',
  servicio:       'Servicio',
  consumible:     'Consumible',
  post_produccion:'Post-producción',
  locacion:       'Locación',
  cast:           'Cast',
  otro:           'Otro',
}

const UNIDADES: UnidadItem[] = ['día', 'hora', 'jornada', 'unidad', 'proyecto']

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function ConstructorCotizacion({ cotizacion: initial, tarifas, equipos }: Props) {
  const [cot, setCot] = useState<Cotizacion>(initial)
  const [isPending, startTransition] = useTransition()
  const [linkCopiado, setLinkCopiado] = useState(false)
  const [estadoOpen, setEstadoOpen] = useState(false)
  const [itemModal, setItemModal] = useState<{
    mode: 'nuevo' | 'editar'
    depId: string
    sgId?: string
    item?: CotizacionItem
  } | null>(null)
  const [showInterno, setShowInterno] = useState(false)
  const [editandoNombre, setEditandoNombre] = useState(false)
  const router = useRouter()
  const { confirm, ConfirmDialog } = useConfirm()
  const { prompt, PromptDialog } = usePrompt()

  const numVisible = numeroCotizacion({ grupo: cot.grupo, version: cot.version, variante: cot.variante })
  const totales = calcularTotales(cot)
  const editable = cot.estado === 'borrador'

  // ── FACTURACIÓN ─────────────────────────────────────────────────────────────
  const [facturaForm, setFacturaForm] = useState({
    fecha_factura_emitida: cot.fecha_factura_emitida?.slice(0, 10) ?? '',
    numero_factura: cot.numero_factura ?? '',
    fecha_pago_recibido: cot.fecha_pago_recibido?.slice(0, 10) ?? '',
  })
  const [guardandoFactura, setGuardandoFactura] = useState(false)
  const mostrarFacturacion = ['aprobada', 'en_produccion', 'cerrada'].includes(cot.estado)

  async function handleRegistrarFactura() {
    if (!facturaForm.fecha_factura_emitida) return
    setGuardandoFactura(true)
    try {
      await registrarFacturaCotizacion(cot.id, {
        fecha_factura_emitida: facturaForm.fecha_factura_emitida,
        numero_factura: facturaForm.numero_factura,
      })
      setCot(c => ({ ...c, fecha_factura_emitida: facturaForm.fecha_factura_emitida, numero_factura: facturaForm.numero_factura }))
    } finally {
      setGuardandoFactura(false)
    }
  }

  async function handleRegistrarPago() {
    if (!facturaForm.fecha_pago_recibido) return
    setGuardandoFactura(true)
    try {
      await registrarPagoCotizacion(cot.id, facturaForm.fecha_pago_recibido)
      setCot(c => ({ ...c, fecha_pago_recibido: facturaForm.fecha_pago_recibido }))
    } finally {
      setGuardandoFactura(false)
    }
  }

  // ── HELPERS DE ESTADO LOCAL ─────────────────────────────────────────────────

  function actualizarDepLocal(depId: string, fn: (d: CotizacionDepartamento) => CotizacionDepartamento) {
    setCot(c => ({
      ...c,
      departamentos: c.departamentos?.map(d => d.id === depId ? fn(d) : d),
    }))
  }

  function actualizarSgLocal(depId: string, sgId: string, fn: (sg: CotizacionSubgrupo) => CotizacionSubgrupo) {
    actualizarDepLocal(depId, d => ({
      ...d,
      subgrupos: d.subgrupos?.map(sg => sg.id === sgId ? fn(sg) : sg),
    }))
  }

  // ── ACCIONES COTIZACIÓN ─────────────────────────────────────────────────────

  async function handleEnviar() {
    try {
      const token = await enviarCotizacion(cot.id)
      const link = `${window.location.origin}/cotizacion/${token}`
      await navigator.clipboard.writeText(link)
      setLinkCopiado(true)
      setCot(c => ({ ...c, estado: 'enviada', token }))
      setTimeout(() => setLinkCopiado(false), 3000)
    } catch (e: any) {
      alert('Error al enviar: ' + e.message)
    }
  }

  async function handleCopiarLink() {
    if (!cot.token) return
    const link = `${window.location.origin}/cotizacion/${cot.token}`
    await navigator.clipboard.writeText(link)
    setLinkCopiado(true)
    setTimeout(() => setLinkCopiado(false), 3000)
  }

  // ── DEPARTAMENTOS ───────────────────────────────────────────────────────────

  async function handleAgregarDep() {
    const nombre = await prompt('Nombre del departamento:')
    if (!nombre?.trim()) return
    const orden = (cot.departamentos?.length ?? 0)
    const data = await agregarDepartamento(cot.id, nombre.trim(), orden)
    setCot(c => ({
      ...c,
      departamentos: [...(c.departamentos ?? []), { ...data, subgrupos: [], items: [] }],
    }))
  }

  async function handleRenombrarDep(dep: CotizacionDepartamento) {
    const nombre = await prompt('Nuevo nombre:', dep.nombre)
    if (!nombre?.trim() || nombre === dep.nombre) return
    await actualizarDepartamento(dep.id, cot.id, { nombre: nombre.trim() })
    actualizarDepLocal(dep.id, d => ({ ...d, nombre: nombre.trim() }))
  }

  async function handleEliminarDep(dep: CotizacionDepartamento) {
    if (!await confirm(`¿Eliminar "${dep.nombre}" y todos sus ítems?`)) return
    await eliminarDepartamento(dep.id, cot.id)
    setCot(c => ({
      ...c,
      departamentos: c.departamentos?.filter(d => d.id !== dep.id),
    }))
  }

  // ── SUB-GRUPOS ──────────────────────────────────────────────────────────────

  async function handleAgregarSg(dep: CotizacionDepartamento) {
    const nombre = await prompt('Nombre del sub-grupo:')
    if (!nombre?.trim()) return
    const orden = (dep.subgrupos?.length ?? 0)
    const data = await agregarSubgrupo(cot.id, dep.id, nombre.trim(), orden)
    actualizarDepLocal(dep.id, d => ({
      ...d,
      subgrupos: [...(d.subgrupos ?? []), { ...data, items: [] }],
    }))
  }

  async function handleRenombrarSg(dep: CotizacionDepartamento, sg: CotizacionSubgrupo) {
    const nombre = await prompt('Nuevo nombre:', sg.nombre)
    if (!nombre?.trim() || nombre === sg.nombre) return
    await actualizarSubgrupo(sg.id, cot.id, { nombre: nombre.trim() })
    actualizarSgLocal(dep.id, sg.id, s => ({ ...s, nombre: nombre.trim() }))
  }

  async function handleEliminarSg(dep: CotizacionDepartamento, sg: CotizacionSubgrupo) {
    if (!await confirm(`¿Eliminar "${sg.nombre}" y todos sus ítems?`)) return
    await eliminarSubgrupo(sg.id, cot.id)
    actualizarDepLocal(dep.id, d => ({
      ...d,
      subgrupos: d.subgrupos?.filter(s => s.id !== sg.id),
    }))
  }

  // ── ÍTEMS ───────────────────────────────────────────────────────────────────

  async function handleGuardarItem(itemData: Omit<CotizacionItem, 'id' | 'created_at' | 'subtotal_cliente' | 'costo_real' | 'margen'>) {
    if (itemModal?.mode === 'nuevo') {
      const data = await agregarItem(itemData)
      if (itemModal.sgId) {
        actualizarSgLocal(itemModal.depId, itemModal.sgId, sg => ({
          ...sg,
          items: [...(sg.items ?? []), data],
        }))
      } else {
        actualizarDepLocal(itemModal.depId, d => ({
          ...d,
          items: [...(d.items ?? []), data],
        }))
      }
    } else if (itemModal?.mode === 'editar' && itemModal.item) {
      await actualizarItem(itemModal.item.id, cot.id, itemData)
      const updatedItem = { ...itemModal.item, ...itemData }
      if (itemModal.sgId) {
        actualizarSgLocal(itemModal.depId, itemModal.sgId, sg => ({
          ...sg,
          items: sg.items?.map(i => i.id === itemModal.item!.id ? updatedItem : i),
        }))
      } else {
        actualizarDepLocal(itemModal.depId, d => ({
          ...d,
          items: d.items?.map(i => i.id === itemModal.item!.id ? updatedItem : i),
        }))
      }
    }
    setItemModal(null)
  }

  async function handleEliminarItem(item: CotizacionItem, depId: string, sgId?: string) {
    if (!await confirm(`¿Eliminar "${item.nombre}"?`)) return
    await eliminarItem(item.id, cot.id)
    if (sgId) {
      actualizarSgLocal(depId, sgId, sg => ({
        ...sg,
        items: sg.items?.filter(i => i.id !== item.id),
      }))
    } else {
      actualizarDepLocal(depId, d => ({
        ...d,
        items: d.items?.filter(i => i.id !== item.id),
      }))
    }
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      {ConfirmDialog}
      {PromptDialog}

      {/* ── HEADER ── */}
      <div className="border-b border-ch-border px-6 py-4 flex items-center justify-between gap-4 bg-ch-dark sticky top-0 z-20">
        <div className="flex items-center gap-4 min-w-0">
          <a href="/cotizaciones" className="text-ch-muted hover:text-ch-cream transition-colors text-sm font-body shrink-0">
            ← Cotizaciones
          </a>
          <span className="text-ch-subtle">|</span>
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-body text-xs text-ch-muted shrink-0">{numVisible}</span>
            {editandoNombre ? (
              <input
                autoFocus
                defaultValue={cot.nombre}
                onBlur={async e => {
                  const val = e.target.value.trim()
                  if (val && val !== cot.nombre) {
                    await actualizarCotizacion(cot.id, { nombre: val })
                    setCot(c => ({ ...c, nombre: val }))
                  }
                  setEditandoNombre(false)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditandoNombre(false)
                }}
                className="bg-transparent border-b border-ch-cream/40 text-ch-cream font-body text-sm focus:outline-none min-w-0"
              />
            ) : (
              <button
                onClick={() => setEditandoNombre(true)}
                className="font-body text-sm text-ch-cream truncate hover:text-white"
              >
                {cot.nombre}
              </button>
            )}
            {/* Estado — dropdown admin */}
            <div className="relative">
              <button
                onClick={() => setEstadoOpen(o => !o)}
                className={`font-body text-xs ${ESTADO_CONFIG[cot.estado]?.color} flex items-center gap-1 hover:opacity-80 transition-opacity`}
              >
                {ESTADO_CONFIG[cot.estado]?.label}
                <span className="text-[8px] opacity-50">▾</span>
              </button>
              {estadoOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setEstadoOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-50 bg-ch-surface border border-ch-border min-w-[140px]">
                    {Object.entries(ESTADO_CONFIG).map(([key, { label, color }]) => (
                      <button
                        key={key}
                        disabled={isPending}
                        onClick={async () => {
                          setEstadoOpen(false)
                          startTransition(async () => {
                            const res = await cambiarEstadoCotizacion(cot.id, key)
                            if (!res.error) setCot(c => ({ ...c, estado: key as typeof c.estado }))
                          })
                        }}
                        className={`w-full text-left px-3 py-2 font-body text-xs ${color} hover:bg-ch-border/20 transition-colors disabled:opacity-50 ${
                          key === cot.estado ? 'bg-ch-border/10' : ''
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Versiones */}
          <div className="flex items-center gap-1 border border-ch-border rounded overflow-hidden">
            <button
              onClick={() => startTransition(() => nuevaVersion(cot.id))}
              disabled={isPending}
              className="px-3 py-1.5 font-body text-xs text-ch-muted hover:text-ch-cream hover:bg-ch-border/20 transition-colors"
            >
              + versión
            </button>
            <span className="w-px h-4 bg-ch-border" />
            <button
              onClick={() => startTransition(() => nuevaVariante(cot.id))}
              disabled={isPending}
              className="px-3 py-1.5 font-body text-xs text-ch-muted hover:text-ch-cream hover:bg-ch-border/20 transition-colors"
            >
              + variante
            </button>
            <span className="w-px h-4 bg-ch-border" />
            <button
              onClick={() => startTransition(() => duplicarCotizacion(cot.id))}
              disabled={isPending}
              className="px-3 py-1.5 font-body text-xs text-ch-muted hover:text-ch-cream hover:bg-ch-border/20 transition-colors"
            >
              duplicar
            </button>
          </div>

          {/* Vista previa */}
          <a
            href={`/preview/${cot.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 border border-ch-border text-ch-muted font-body text-xs rounded hover:text-ch-cream hover:border-ch-cream/40 transition-colors"
          >
            Vista previa
          </a>

          {/* Descargar PDF */}
          <a
            href={`/api/cotizaciones/${cot.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 border border-ch-border text-ch-muted font-body text-xs rounded hover:text-ch-cream hover:border-ch-cream/40 transition-colors"
          >
            ↓ PDF
          </a>

          {/* Enviar / link */}
          {cot.estado === 'borrador' ? (
            <button
              onClick={handleEnviar}
              className="px-4 py-1.5 bg-ch-cream text-ch-dark font-body text-xs font-medium rounded hover:bg-ch-cream/90 transition-colors"
            >
              Enviar al cliente
            </button>
          ) : cot.token ? (
            <button
              onClick={handleCopiarLink}
              className={`px-4 py-1.5 border font-body text-xs rounded transition-colors ${
                linkCopiado
                  ? 'border-ch-green/40 text-ch-green'
                  : 'border-ch-border text-ch-muted hover:text-ch-cream'
              }`}
            >
              {linkCopiado ? '✓ Link copiado' : 'Copiar link'}
            </button>
          ) : null}
        </div>
      </div>

      {/* ── CUERPO ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── COLUMNA IZQUIERDA: constructor ── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">

          {/* Comentario del cliente si rechazó */}
          {cot.estado === 'rechazada' && cot.comentario_cliente && (
            <div className="border border-red-500/30 bg-red-500/5 rounded p-4">
              <p className="font-body text-xs text-red-400 uppercase tracking-wider mb-1">Comentario del cliente</p>
              <p className="font-body text-sm text-ch-cream">{cot.comentario_cliente}</p>
            </div>
          )}

          {cot.estado === 'aprobada' && (
            <div className="border border-ch-green/30 bg-ch-green/5 rounded p-3">
              <p className="font-body text-xs text-ch-green">
                ✓ Cotización aprobada por el cliente
                {cot.comentario_cliente && ` · "${cot.comentario_cliente}"`}
              </p>
            </div>
          )}

          {/* ── FACTURACIÓN ── */}
          {mostrarFacturacion && (
            <div className="border border-ch-border rounded p-4 space-y-4">
              <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Facturación</p>

              {/* Factura emitida */}
              {cot.fecha_factura_emitida ? (
                <div className="space-y-1">
                  <p className="font-body text-xs text-ch-green">✓ Factura emitida</p>
                  <p className="font-body text-xs text-ch-muted">
                    {new Date(cot.fecha_factura_emitida + 'T12:00:00').toLocaleDateString('es-CL')}
                    {cot.numero_factura && ` · Folio ${cot.numero_factura}`}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="font-body text-xs text-ch-muted">Registrar factura emitida al cliente</p>
                  <div className="flex gap-3 flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                      <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Fecha factura *</label>
                      <input type="date" value={facturaForm.fecha_factura_emitida}
                        onChange={e => setFacturaForm(f => ({ ...f, fecha_factura_emitida: e.target.value }))}
                        className="input-ch w-full text-sm" />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Nº folio SII</label>
                      <input type="text" value={facturaForm.numero_factura} placeholder="Ej: 123456"
                        onChange={e => setFacturaForm(f => ({ ...f, numero_factura: e.target.value }))}
                        className="input-ch w-full text-sm" />
                    </div>
                  </div>
                  <button onClick={handleRegistrarFactura} disabled={!facturaForm.fecha_factura_emitida || guardandoFactura}
                    className="border border-ch-green/60 text-ch-green hover:bg-ch-green/10 font-body text-[9px] tracking-[0.35em] uppercase px-4 py-2 transition-colors disabled:opacity-40">
                    {guardandoFactura ? 'Guardando...' : 'Registrar factura'}
                  </button>
                </div>
              )}

              {/* Pago recibido — solo aparece si ya hay factura */}
              {cot.fecha_factura_emitida && (
                cot.fecha_pago_recibido ? (
                  <div className="space-y-1 border-t border-ch-border/40 pt-3">
                    <p className="font-body text-xs text-ch-green">✓ Pago recibido</p>
                    <p className="font-body text-xs text-ch-muted">
                      {new Date(cot.fecha_pago_recibido + 'T12:00:00').toLocaleDateString('es-CL')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 border-t border-ch-border/40 pt-3">
                    <div className="flex-1 min-w-[140px]">
                      <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Fecha de pago recibido</label>
                      <input type="date" value={facturaForm.fecha_pago_recibido}
                        onChange={e => setFacturaForm(f => ({ ...f, fecha_pago_recibido: e.target.value }))}
                        className="input-ch w-full text-sm" />
                    </div>
                    <button onClick={handleRegistrarPago} disabled={!facturaForm.fecha_pago_recibido || guardandoFactura}
                      className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-[0.35em] uppercase px-4 py-2 transition-colors disabled:opacity-40">
                      {guardandoFactura ? 'Guardando...' : 'Registrar pago'}
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {/* Departamentos */}
          {(cot.departamentos ?? []).map(dep => (
            <DepBlock
              key={dep.id}
              dep={dep}
              editable={editable}
              showInterno={showInterno}
              onRenombrar={() => handleRenombrarDep(dep)}
              onEliminar={() => handleEliminarDep(dep)}
              onAgregarSg={() => handleAgregarSg(dep)}
              onRenombrarSg={sg => handleRenombrarSg(dep, sg)}
              onEliminarSg={sg => handleEliminarSg(dep, sg)}
              onAgregarItem={(sgId) => setItemModal({ mode: 'nuevo', depId: dep.id, sgId })}
              onEditarItem={(item, sgId) => setItemModal({ mode: 'editar', depId: dep.id, sgId, item })}
              onEliminarItem={(item, sgId) => handleEliminarItem(item, dep.id, sgId)}
            />
          ))}

          {editable && (
            <button
              onClick={handleAgregarDep}
              className="w-full py-3 border border-dashed border-ch-border/40 rounded text-ch-muted font-body text-xs hover:text-ch-cream hover:border-ch-border transition-colors"
            >
              + Agregar departamento
            </button>
          )}
        </div>

        {/* ── COLUMNA DERECHA: totales ── */}
        <div className="w-72 shrink-0 border-l border-ch-border overflow-y-auto p-5 space-y-5">

          {/* ── ENCARGO ── */}
          <EncargoPanel cot={cot} setCot={setCot} />

          <div className="border-t border-ch-border" />

          {/* Toggle interno */}
          <div className="flex items-center justify-between">
            <span className="font-body text-xs uppercase tracking-wider text-ch-muted">Resumen</span>
            <button
              onClick={() => setShowInterno(v => !v)}
              className={`font-body text-xs px-2 py-0.5 rounded transition-colors ${
                showInterno ? 'bg-ch-cream/10 text-ch-cream' : 'text-ch-muted hover:text-ch-cream'
              }`}
            >
              {showInterno ? 'Vista interna' : 'Ver márgenes'}
            </button>
          </div>

          {/* Subtotales por departamento */}
          <div className="space-y-2">
            {(cot.departamentos ?? []).map(dep => {
              const sub = subtotalDepartamento(dep)
              if (sub === 0) return null
              return (
                <div key={dep.id} className="flex justify-between items-baseline">
                  <span className="font-body text-xs text-ch-muted truncate pr-2">{dep.nombre}</span>
                  <span className="font-body text-xs text-ch-cream shrink-0">{formatCLP(sub)}</span>
                </div>
              )
            })}
          </div>

          <div className="border-t border-ch-border" />

          {/* Totales */}
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="font-body text-xs text-ch-muted">Subtotal neto</span>
              <span className="font-body text-sm text-ch-cream">{formatCLP(totales.neto)}</span>
            </div>

            {totales.descuento_global_monto > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="font-body text-xs text-ch-muted">
                  Descuento ({cot.descuento_global_tipo === 'porcentaje' ? `${cot.descuento_global}%` : 'monto'})
                </span>
                <span className="font-body text-sm text-red-400">
                  -{formatCLP(totales.descuento_global_monto)}
                </span>
              </div>
            )}

            {cot.con_iva && (
              <div className="flex justify-between items-baseline">
                <span className="font-body text-xs text-ch-muted">IVA 19%</span>
                <span className="font-body text-sm text-ch-cream">{formatCLP(totales.iva)}</span>
              </div>
            )}

            <div className="flex justify-between items-baseline pt-1 border-t border-ch-border">
              <span className="font-body text-xs font-medium text-ch-cream">Total</span>
              <span className="font-display text-xl text-ch-cream">{formatCLP(totales.total)}</span>
            </div>
          </div>

          {/* Márgenes internos */}
          {showInterno && (
            <>
              <div className="border-t border-ch-border" />
              <div className="space-y-2">
                <p className="font-body text-[10px] uppercase tracking-wider text-ch-muted">Interno</p>
                <div className="flex justify-between items-baseline">
                  <span className="font-body text-xs text-ch-muted">Costo real</span>
                  <span className="font-body text-sm text-ch-cream">{formatCLP(totales.costo_real)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="font-body text-xs text-ch-muted">Margen</span>
                  <span className={`font-body text-sm font-medium ${totales.margen >= 0 ? 'text-ch-green' : 'text-red-400'}`}>
                    {formatCLP(totales.margen)}
                  </span>
                </div>
                {totales.total > 0 && (
                  <div className="flex justify-between items-baseline">
                    <span className="font-body text-xs text-ch-muted">% margen</span>
                    <span className={`font-body text-sm font-medium ${totales.margen >= 0 ? 'text-ch-green' : 'text-red-400'}`}>
                      {Math.round((totales.margen / totales.total) * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── NOTAS AL CLIENTE ── */}
          <NotasPanel cot={cot} setCot={setCot} />

          {/* Config fiscal */}
          {editable && (
            <>
              <div className="border-t border-ch-border" />
              <div className="space-y-3">
                <p className="font-body text-[10px] uppercase tracking-wider text-ch-muted">Configuración</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cot.con_iva}
                    onChange={async e => {
                      const v = e.target.checked
                      await actualizarCotizacion(cot.id, { con_iva: v })
                      setCot(c => ({ ...c, con_iva: v }))
                    }}
                    className="accent-ch-cream"
                  />
                  <span className="font-body text-xs text-ch-muted">Incluir IVA 19%</span>
                </label>

                {/* Descuento global */}
                <div>
                  <p className="font-body text-xs text-ch-muted mb-1">Descuento global</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={cot.descuento_global || ''}
                      onChange={async e => {
                        const v = Number(e.target.value) || 0
                        await actualizarCotizacion(cot.id, { descuento_global: v })
                        setCot(c => ({ ...c, descuento_global: v }))
                      }}
                      placeholder="0"
                      className="w-24 bg-ch-dark border border-ch-border rounded px-2 py-1 font-body text-xs text-ch-cream focus:outline-none focus:border-ch-cream/40"
                    />
                    <select
                      value={cot.descuento_global_tipo}
                      onChange={async e => {
                        const v = e.target.value as 'porcentaje' | 'monto'
                        await actualizarCotizacion(cot.id, { descuento_global_tipo: v })
                        setCot(c => ({ ...c, descuento_global_tipo: v }))
                      }}
                      className="flex-1 bg-ch-dark border border-ch-border rounded px-2 py-1 font-body text-xs text-ch-cream focus:outline-none"
                    >
                      <option value="porcentaje">%</option>
                      <option value="monto">$</option>
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── MODAL ÍTEM ── */}
      {itemModal && (
        <ItemModal
          mode={itemModal.mode}
          item={itemModal.item}
          cotizacionId={cot.id}
          departamentoId={itemModal.depId}
          subgrupoId={itemModal.sgId}
          tarifas={tarifas}
          equipos={equipos}
          onGuardar={handleGuardarItem}
          onCerrar={() => setItemModal(null)}
        />
      )}
    </div>
  )
}

// ─── ENCARGO PANEL ───────────────────────────────────────────────────────────

const NOTAS_SUGERIDAS = [
  'Se solicita orden de facturación con pago a 30 días para la entrega del material en alta calidad.',
  'Se entregará todo el material en baja calidad para las correcciones de montaje y postproducción (se considera una corrección por etapa).',
  'Se solicita una reunión de pre-producción para definir criterios y revisar referencias.',
  'Los precios no incluyen IVA.',
  'Cotización válida por 30 días desde la fecha de emisión.',
  'Los tiempos de entrega se acordarán en reunión de pre-producción.',
]

function EncargoPanel({ cot, setCot }: { cot: Cotizacion; setCot: React.Dispatch<React.SetStateAction<Cotizacion>> }) {
  const [open, setOpen] = useState(true)
  const iCls = 'w-full bg-transparent border-b border-ch-border/40 text-ch-cream font-body text-xs px-0 py-1 focus:outline-none focus:border-ch-cream/60 transition-colors placeholder:text-ch-muted/40'
  const lCls = 'font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mt-2 mb-0.5'

  async function save(field: string, value: string) {
    await actualizarCotizacion(cot.id, { [field]: value || null } as any)
  }

  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between mb-2">
        <span className="font-body text-[10px] uppercase tracking-wider text-ch-muted">Encargo</span>
        <span className="text-ch-muted/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div>
          <label className={lCls}>Solicita</label>
          <input defaultValue={cot.solicita ?? ''} onBlur={e => save('solicita', e.target.value)}
            placeholder="Nombre o contacto" className={iCls} />

          <label className={lCls}>Agencia / Cliente</label>
          <input defaultValue={cot.cliente_nombre_libre ?? cot.cliente?.nombre ?? ''} readOnly
            className={`${iCls} text-ch-muted cursor-default`} />

          <label className={lCls}>Cliente final</label>
          <input defaultValue={cot.cliente_final ?? ''} onBlur={e => save('cliente_final', e.target.value)}
            placeholder="Marca o cliente final" className={iCls} />

          <label className={lCls}>Medios</label>
          <input defaultValue={cot.medios ?? ''} onBlur={e => save('medios', e.target.value)}
            placeholder="Digitales, TV, Cine…" className={iCls} />

          <label className={lCls}>Referencia</label>
          <input defaultValue={cot.referencia ?? ''} onBlur={e => save('referencia', e.target.value)}
            placeholder="Briefing, link, documento…" className={iCls} />

          <label className={lCls}>Descripción</label>
          <textarea defaultValue={cot.descripcion ?? ''} onBlur={e => save('descripcion', e.target.value)}
            rows={2} placeholder="Descripción del proyecto…"
            className={`${iCls} resize-none`} />
        </div>
      )}
    </div>
  )
}

// ─── NOTAS PANEL ─────────────────────────────────────────────────────────────

function NotasPanel({ cot, setCot }: { cot: Cotizacion; setCot: React.Dispatch<React.SetStateAction<Cotizacion>> }) {
  const [open, setOpen] = useState(false)
  const [texto, setTexto] = useState(cot.notas_cliente ?? '')

  async function guardar(val: string) {
    setTexto(val)
    await actualizarCotizacion(cot.id, { notas_cliente: val || null } as any)
    setCot(c => ({ ...c, notas_cliente: val || undefined }))
  }

  function agregarSugerida(nota: string) {
    const nuevo = texto ? `${texto.trimEnd()}\n${nota}` : nota
    guardar(nuevo)
  }

  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between mb-2">
        <span className="font-body text-[10px] uppercase tracking-wider text-ch-muted">
          Notas al cliente {texto && <span className="text-ch-cream/40 normal-case tracking-normal">·</span>}
        </span>
        <span className="text-ch-muted/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-2">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onBlur={e => guardar(e.target.value)}
            rows={4}
            placeholder="Condiciones, aclaraciones…"
            className="w-full bg-transparent border border-ch-border/40 text-ch-cream font-body text-xs px-2 py-1.5 focus:outline-none focus:border-ch-cream/60 transition-colors placeholder:text-ch-muted/40 resize-none"
          />
          <div>
            <p className="font-body text-[9px] text-ch-muted/60 uppercase tracking-[0.3em] mb-1.5">Agregar sugerida</p>
            <div className="space-y-1">
              {NOTAS_SUGERIDAS.map((n, i) => (
                <button key={i} onClick={() => agregarSugerida(n)}
                  className="w-full text-left font-body text-[10px] text-ch-muted/60 hover:text-ch-muted leading-snug px-1 py-0.5 hover:bg-white/5 transition-colors rounded">
                  + {n.slice(0, 55)}…
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── DEP BLOCK ───────────────────────────────────────────────────────────────

interface DepBlockProps {
  dep: CotizacionDepartamento
  editable: boolean
  showInterno: boolean
  onRenombrar: () => void
  onEliminar: () => void
  onAgregarSg: () => void
  onRenombrarSg: (sg: CotizacionSubgrupo) => void
  onEliminarSg: (sg: CotizacionSubgrupo) => void
  onAgregarItem: (sgId?: string) => void
  onEditarItem: (item: CotizacionItem, sgId?: string) => void
  onEliminarItem: (item: CotizacionItem, sgId?: string) => void
}

function DepBlock({
  dep, editable, showInterno,
  onRenombrar, onEliminar, onAgregarSg,
  onRenombrarSg, onEliminarSg,
  onAgregarItem, onEditarItem, onEliminarItem,
}: DepBlockProps) {
  const [collapsed, setCollapsed] = useState(false)
  const subtotal = subtotalDepartamento(dep)

  return (
    <div className="border border-ch-border overflow-hidden">
      {/* Header departamento */}
      <div className="flex items-center justify-between px-4 py-3 bg-ch-dark/40">
        <div className="flex items-center gap-3">
          <button onClick={() => setCollapsed(v => !v)} className="text-ch-muted hover:text-ch-cream transition-colors text-xs">
            {collapsed ? '▶' : '▼'}
          </button>
          <span className="font-body text-sm font-medium text-ch-cream uppercase tracking-wider">
            {dep.nombre}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-body text-sm text-ch-cream">{formatCLP(subtotal)}</span>
          {editable && (
            <div className="flex items-center gap-1">
              <button onClick={onAgregarSg} className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1.5 py-0.5 rounded hover:bg-ch-border/20">
                + sub-grupo
              </button>
              <button onClick={() => onAgregarItem(undefined)} className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1.5 py-0.5 rounded hover:bg-ch-border/20">
                + ítem
              </button>
              <button onClick={onRenombrar} className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1">✎</button>
              <button onClick={onEliminar} className="font-body text-[10px] text-ch-muted hover:text-red-400 transition-colors px-1">✕</button>
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="divide-y divide-ch-border/30">
          {/* Sub-grupos */}
          {(dep.subgrupos ?? []).map(sg => (
            <SgBlock
              key={sg.id}
              sg={sg}
              editable={editable}
              showInterno={showInterno}
              onRenombrar={() => onRenombrarSg(sg)}
              onEliminar={() => onEliminarSg(sg)}
              onAgregarItem={() => onAgregarItem(sg.id)}
              onEditarItem={item => onEditarItem(item, sg.id)}
              onEliminarItem={item => onEliminarItem(item, sg.id)}
            />
          ))}

          {/* Ítems directos */}
          {(dep.items ?? []).map(item => (
            <ItemRow
              key={item.id}
              item={item}
              editable={editable}
              showInterno={showInterno}
              indent={false}
              onEditar={() => onEditarItem(item)}
              onEliminar={() => onEliminarItem(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SG BLOCK ────────────────────────────────────────────────────────────────

interface SgBlockProps {
  sg: CotizacionSubgrupo
  editable: boolean
  showInterno: boolean
  onRenombrar: () => void
  onEliminar: () => void
  onAgregarItem: () => void
  onEditarItem: (item: CotizacionItem) => void
  onEliminarItem: (item: CotizacionItem) => void
}

function SgBlock({
  sg, editable, showInterno,
  onRenombrar, onEliminar, onAgregarItem,
  onEditarItem, onEliminarItem,
}: SgBlockProps) {
  const subtotal = subtotalSubgrupo(sg)

  return (
    <div>
      {/* Header sub-grupo */}
      <div className="flex items-center justify-between px-4 py-2 bg-ch-dark/20">
        <span className="font-body text-xs font-semibold text-ch-cream/80">{sg.nombre}</span>
        <div className="flex items-center gap-3">
          <span className="font-body text-xs text-ch-cream">{formatCLP(subtotal)}</span>
          {editable && (
            <div className="flex items-center gap-1">
              <button onClick={onAgregarItem} className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1.5 py-0.5 rounded hover:bg-ch-border/20">
                + ítem
              </button>
              <button onClick={onRenombrar} className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1">✎</button>
              <button onClick={onEliminar} className="font-body text-[10px] text-ch-muted hover:text-red-400 px-1">✕</button>
            </div>
          )}
        </div>
      </div>
      {/* Ítems del sub-grupo */}
      {(sg.items ?? []).map(item => (
        <ItemRow
          key={item.id}
          item={item}
          editable={editable}
          showInterno={showInterno}
          indent={true}
          onEditar={() => onEditarItem(item)}
          onEliminar={() => onEliminarItem(item)}
        />
      ))}
    </div>
  )
}

// ─── ITEM ROW ────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: CotizacionItem
  editable: boolean
  showInterno: boolean
  indent: boolean
  onEditar: () => void
  onEliminar: () => void
}

function ItemRow({ item, editable, showInterno, indent, onEditar, onEliminar }: ItemRowProps) {
  const subtotal = subtotalItem(item)
  const costo = Math.round(item.precio_bruto * item.cantidad * item.dias)
  const margen = subtotal - costo

  return (
    <div className={`flex items-start justify-between py-2 pr-4 hover:bg-ch-border/5 group ${indent ? 'pl-8' : 'pl-4'}`}>
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2">
          <span className="font-body text-xs text-ch-cream truncate">
            {item.nombre}
          </span>
          {item.incluido && (
            <span className="font-body text-[10px] text-ch-muted bg-ch-border/20 px-1.5 py-0.5 rounded">incluido</span>
          )}
          {item.con_boleta && (
            <span className="font-body text-[10px] text-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 rounded">boleta</span>
          )}
        </div>
        {item.descripcion && (
          <p className="font-body text-[10px] text-ch-muted mt-0.5 leading-relaxed">{item.descripcion}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-body text-[10px] text-ch-muted/60">
            {TIPO_LABELS[item.tipo]}
          </span>
          {!item.incluido && (item.cantidad > 1 || item.dias > 1) && (
            <span className="font-body text-[10px] text-ch-muted/60">
              · {formatCLP(item.precio_cliente)} × {item.cantidad} × {item.dias} {item.unidad}
            </span>
          )}
        </div>
        {showInterno && !item.incluido && (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-body text-[10px] text-ch-muted/40">
              costo {formatCLP(costo)}
            </span>
            <span className={`font-body text-[10px] ${margen >= 0 ? 'text-ch-green/60' : 'text-red-400/60'}`}>
              margen {formatCLP(margen)}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-body text-xs text-ch-cream">
          {item.incluido ? 'Incluida' : formatCLP(subtotal)}
        </span>
        {editable && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEditar} className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1">✎</button>
            <button onClick={onEliminar} className="font-body text-[10px] text-ch-muted hover:text-red-400 px-1">✕</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MODAL ÍTEM ──────────────────────────────────────────────────────────────

interface ItemModalProps {
  mode: 'nuevo' | 'editar'
  item?: CotizacionItem
  cotizacionId: string
  departamentoId: string
  subgrupoId?: string
  tarifas: TarifaBase[]
  equipos: Equipo[]
  onGuardar: (item: Omit<CotizacionItem, 'id' | 'created_at' | 'subtotal_cliente' | 'costo_real' | 'margen'>) => Promise<void>
  onCerrar: () => void
}

function ItemModal({
  mode, item, cotizacionId, departamentoId, subgrupoId,
  tarifas, equipos, onGuardar, onCerrar,
}: ItemModalProps) {
  const [isPending, startTransition] = useTransition()

  const [tipo, setTipo] = useState<TipoItem>(item?.tipo ?? 'rol')
  const [nombre, setNombre] = useState(item?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? '')
  const [unidad, setUnidad] = useState<UnidadItem>(item?.unidad ?? 'día')
  const [cantidad, setCantidad] = useState(item?.cantidad ?? 1)
  const [dias, setDias] = useState(item?.dias ?? 1)
  const [incluido, setIncluido] = useState(item?.incluido ?? false)

  // Fiscal
  const [conBoleta, setConBoleta] = useState(item?.con_boleta ?? false)
  const tasaBoleta = item?.tasa_boleta ?? 0.153
  const [netoProveedor, setNetoProveedor] = useState(item?.precio_neto_proveedor ?? 0)
  const [precioPersonalizado, setPrecioPersonalizado] = useState(item?.precio_cliente_personalizado ?? false)
  const [precioCliente, setPrecioCliente] = useState(item?.precio_cliente ?? 0)

  // Calcular bruto y actualizar precio cliente si no es personalizado
  const bruto = conBoleta ? calcularBruto(netoProveedor, tasaBoleta) : netoProveedor
  const precioClienteEfectivo = precioPersonalizado ? precioCliente : bruto

  // Descuento ítem
  const [descItem, setDescItem] = useState(item?.descuento_item ?? 0)
  const [descItemTipo, setDescItemTipo] = useState<'porcentaje' | 'monto'>(item?.descuento_item_tipo ?? 'porcentaje')

  // Tarifa preseleccionada
  function aplicarTarifa(t: TarifaBase) {
    setNombre(t.nombre)
    setTipo(t.tipo as TipoItem)
    setUnidad(t.unidad as UnidadItem)
    setNetoProveedor(t.precio_referencial)
    setPrecioCliente(t.precio_referencial)
  }

  function aplicarEquipo(e: Equipo) {
    setNombre(e.nombre)
    setTipo('equipo_ch')
    setNetoProveedor(e.precio_jornada ?? 0)
    setPrecioCliente(e.precio_jornada ?? 0)
  }

  const subtotalPreview = incluido ? 0 : (() => {
    const base = precioClienteEfectivo * cantidad * dias
    if (descItemTipo === 'porcentaje') return Math.round(base * (1 - descItem / 100))
    return Math.round(base - descItem)
  })()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return

    startTransition(async () => {
      await onGuardar({
        cotizacion_id: cotizacionId,
        departamento_id: departamentoId,
        subgrupo_id: subgrupoId ?? null,
        tipo,
        equipo_id: null,
        tarifa_id: null,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        con_boleta: conBoleta,
        tasa_boleta: tasaBoleta,
        precio_neto_proveedor: netoProveedor,
        precio_bruto: bruto,
        precio_cliente_personalizado: precioPersonalizado,
        precio_cliente: precioClienteEfectivo,
        cantidad,
        dias,
        unidad,
        incluido,
        descuento_item: descItem,
        descuento_item_tipo: descItemTipo,
        orden: item?.orden ?? 99,
      })
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onCerrar} />

      {/* Panel */}
      <div className="relative w-full max-w-md h-full bg-ch-dark border-l border-ch-border overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Header modal */}
          <div className="flex items-center justify-between">
            <h2 className="font-body text-sm font-medium text-ch-cream">
              {mode === 'nuevo' ? 'Nuevo ítem' : 'Editar ítem'}
            </h2>
            <button type="button" onClick={onCerrar} className="text-ch-muted hover:text-ch-cream text-lg">✕</button>
          </div>

          {/* Biblioteca de tarifas */}
          {mode === 'nuevo' && (
            <details className="group">
              <summary className="font-body text-xs text-ch-muted cursor-pointer hover:text-ch-cream list-none flex items-center gap-1">
                <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                Cargar desde biblioteca
              </summary>
              <div className="mt-2 max-h-48 overflow-y-auto border border-ch-border rounded divide-y divide-ch-border/30">
                {tarifas.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => aplicarTarifa(t)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-ch-border/10 transition-colors text-left"
                  >
                    <span className="font-body text-xs text-ch-cream truncate">{t.nombre}</span>
                    <span className="font-body text-xs text-ch-muted shrink-0 ml-2">{formatCLP(t.precio_referencial)}</span>
                  </button>
                ))}
              </div>
            </details>
          )}

          {mode === 'nuevo' && tipo === 'equipo_ch' && equipos.length > 0 && (
            <details>
              <summary className="font-body text-xs text-ch-muted cursor-pointer hover:text-ch-cream list-none">
                ▶ Cargar equipo CH
              </summary>
              <div className="mt-2 max-h-40 overflow-y-auto border border-ch-border rounded divide-y divide-ch-border/30">
                {equipos.map(e => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => aplicarEquipo(e)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-ch-border/10 transition-colors text-left"
                  >
                    <span className="font-body text-xs text-ch-cream truncate">{e.nombre}</span>
                    <span className="font-body text-xs text-ch-muted shrink-0 ml-2">{e.precio_jornada ? formatCLP(e.precio_jornada) : '—'}</span>
                  </button>
                ))}
              </div>
            </details>
          )}

          {/* Tipo */}
          <div>
            <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-1.5">Tipo</label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value as TipoItem)}
              className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
            >
              {(Object.entries(TIPO_LABELS) as [TipoItem, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Nombre */}
          <div>
            <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-1.5">Nombre *</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="ej: Director de Fotografía"
              required
              className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream placeholder-ch-muted/40 focus:outline-none focus:border-ch-cream/40"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-1.5">
              Descripción <span className="normal-case text-ch-muted/60">(bullets visibles al cliente)</span>
            </label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={3}
              placeholder="- Ítem 1&#10;- Ítem 2"
              className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream placeholder-ch-muted/40 focus:outline-none focus:border-ch-cream/40 resize-none"
            />
          </div>

          {/* Fiscal */}
          <div className="space-y-3 border border-ch-border rounded p-4">
            <p className="font-body text-[10px] uppercase tracking-wider text-ch-muted">Precio</p>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={conBoleta}
                onChange={e => setConBoleta(e.target.checked)}
                className="accent-amber-400"
              />
              <span className="font-body text-xs text-ch-muted">Proveedor con boleta de honorarios (15.3%)</span>
            </label>

            <div>
              <label className="block font-body text-xs text-ch-muted mb-1">
                {conBoleta ? 'Neto proveedor (lo que recibe)' : 'Precio'}
              </label>
              <input
                type="number"
                min="0"
                value={netoProveedor || ''}
                onChange={e => setNetoProveedor(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
              />
            </div>

            {conBoleta && (
              <div className="flex items-center justify-between bg-amber-400/5 border border-amber-400/20 rounded px-3 py-2">
                <span className="font-body text-xs text-amber-400/80">Bruto real (costo Casa Hiedra)</span>
                <span className="font-body text-sm font-medium text-amber-300">{formatCLP(bruto)}</span>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={precioPersonalizado}
                onChange={e => {
                  setPrecioPersonalizado(e.target.checked)
                  if (e.target.checked) setPrecioCliente(bruto)
                }}
                className="accent-ch-cream"
              />
              <span className="font-body text-xs text-ch-muted">Precio al cliente personalizado</span>
            </label>

            {precioPersonalizado && (
              <div>
                <label className="block font-body text-xs text-ch-muted mb-1">Precio al cliente</label>
                <input
                  type="number"
                  min="0"
                  value={precioCliente || ''}
                  onChange={e => setPrecioCliente(Number(e.target.value) || 0)}
                  className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
                />
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={incluido}
                onChange={e => setIncluido(e.target.checked)}
                className="accent-ch-cream"
              />
              <span className="font-body text-xs text-ch-muted">Marcar como "Incluida"</span>
            </label>
          </div>

          {/* Cantidad / días */}
          {!incluido && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-body text-xs text-ch-muted mb-1">Cantidad</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={cantidad}
                  onChange={e => setCantidad(Number(e.target.value) || 1)}
                  className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
                />
              </div>
              <div>
                <label className="block font-body text-xs text-ch-muted mb-1">Días/unid</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={dias}
                  onChange={e => setDias(Number(e.target.value) || 1)}
                  className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
                />
              </div>
              <div>
                <label className="block font-body text-xs text-ch-muted mb-1">Unidad</label>
                <select
                  value={unidad}
                  onChange={e => setUnidad(e.target.value as UnidadItem)}
                  className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none"
                >
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Descuento ítem */}
          {!incluido && (
            <div>
              <label className="block font-body text-xs text-ch-muted mb-1">Descuento ítem</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={descItem || ''}
                  onChange={e => setDescItem(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="flex-1 bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none"
                />
                <select
                  value={descItemTipo}
                  onChange={e => setDescItemTipo(e.target.value as 'porcentaje' | 'monto')}
                  className="w-20 bg-ch-dark border border-ch-border rounded px-2 py-2 font-body text-xs text-ch-cream focus:outline-none"
                >
                  <option value="porcentaje">%</option>
                  <option value="monto">$</option>
                </select>
              </div>
            </div>
          )}

          {/* Preview subtotal */}
          {!incluido && (
            <div className="flex items-center justify-between bg-ch-border/10 rounded px-4 py-3">
              <span className="font-body text-xs text-ch-muted">Subtotal al cliente</span>
              <span className="font-display text-lg text-ch-cream">{formatCLP(subtotalPreview)}</span>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending || !nombre.trim()}
              className="flex-1 py-2.5 bg-ch-cream text-ch-dark font-body text-sm font-medium rounded hover:bg-ch-cream/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Guardando...' : mode === 'nuevo' ? 'Agregar ítem' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={onCerrar}
              className="px-4 py-2.5 border border-ch-border text-ch-muted font-body text-sm rounded hover:text-ch-cream hover:border-ch-cream/40 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
