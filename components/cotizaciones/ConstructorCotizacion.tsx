'use client'

import { useState, useTransition, useCallback } from 'react'
import { useConfirm, usePrompt } from '@/components/ui/useConfirm'
import { useRouter } from 'next/navigation'
import { toastOk, toastError } from '@/lib/toast'
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
  cambiarEstadoCotizacion,
} from '@/app/actions/cotizaciones'
import {
  numeroCotizacion,
  calcularTotales,
  type Cotizacion,
  type CotizacionDepartamento,
  type CotizacionSubgrupo,
  type CotizacionItem,
  type TarifaBase,
  type Equipo,
} from '@/types'
import Link from 'next/link'
import ItemModal from './ItemModal'
import PanelFacturacion from './PanelFacturacion'
import DepBlock from './BloquesDepartamento'
import PanelTotales from './PanelTotales'

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
      toastOk('Cotización enviada')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al enviar')
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
    try {
      const data = await agregarDepartamento(cot.id, nombre.trim(), orden)
      setCot(c => ({
        ...c,
        departamentos: [...(c.departamentos ?? []), { ...data, subgrupos: [], items: [] }],
      }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al agregar departamento')
    }
  }

  async function handleRenombrarDep(dep: CotizacionDepartamento) {
    const nombre = await prompt('Nuevo nombre:', dep.nombre)
    if (!nombre?.trim() || nombre === dep.nombre) return
    try {
      await actualizarDepartamento(dep.id, cot.id, { nombre: nombre.trim() })
      actualizarDepLocal(dep.id, d => ({ ...d, nombre: nombre.trim() }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al renombrar departamento')
    }
  }

  // Precio nativo del bundle a nivel de categoría: vacío = volver a sumar ítems.
  function parsearPrecioBundle(val: string | null): number | null | undefined {
    if (val === null) return undefined // cancelado
    const limpio = val.trim()
    if (limpio === '') return null // sin precio manual → suma de ítems
    const n = parseFloat(limpio.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) { toastError('Monto inválido'); return undefined }
    return Math.round(n)
  }

  async function handlePrecioDep(dep: CotizacionDepartamento) {
    const actual = dep.precio_manual != null ? String(dep.precio_manual) : ''
    const val = await prompt(`Precio del bundle para "${dep.nombre}" (vacío = sumar ítems):`, actual)
    const precio_manual = parsearPrecioBundle(val)
    if (precio_manual === undefined) return
    try {
      await actualizarDepartamento(dep.id, cot.id, { precio_manual })
      actualizarDepLocal(dep.id, d => ({ ...d, precio_manual }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al fijar el precio')
    }
  }

  async function handlePrecioSg(dep: CotizacionDepartamento, sg: CotizacionSubgrupo) {
    const actual = sg.precio_manual != null ? String(sg.precio_manual) : ''
    const val = await prompt(`Precio del bundle para "${sg.nombre}" (vacío = sumar ítems):`, actual)
    const precio_manual = parsearPrecioBundle(val)
    if (precio_manual === undefined) return
    try {
      await actualizarSubgrupo(sg.id, cot.id, { precio_manual })
      actualizarSgLocal(dep.id, sg.id, s => ({ ...s, precio_manual }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al fijar el precio')
    }
  }

  async function handleEliminarDep(dep: CotizacionDepartamento) {
    if (!await confirm(`¿Eliminar "${dep.nombre}" y todos sus ítems?`)) return
    try {
      await eliminarDepartamento(dep.id, cot.id)
      toastOk('Eliminado')
      setCot(c => ({
        ...c,
        departamentos: c.departamentos?.filter(d => d.id !== dep.id),
      }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al eliminar departamento')
    }
  }

  // ── SUB-GRUPOS ──────────────────────────────────────────────────────────────

  async function handleAgregarSg(dep: CotizacionDepartamento) {
    const nombre = await prompt('Nombre del sub-grupo:')
    if (!nombre?.trim()) return
    const orden = (dep.subgrupos?.length ?? 0)
    try {
      const data = await agregarSubgrupo(cot.id, dep.id, nombre.trim(), orden)
      actualizarDepLocal(dep.id, d => ({
        ...d,
        subgrupos: [...(d.subgrupos ?? []), { ...data, items: [] }],
      }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al agregar sub-grupo')
    }
  }

  async function handleRenombrarSg(dep: CotizacionDepartamento, sg: CotizacionSubgrupo) {
    const nombre = await prompt('Nuevo nombre:', sg.nombre)
    if (!nombre?.trim() || nombre === sg.nombre) return
    try {
      await actualizarSubgrupo(sg.id, cot.id, { nombre: nombre.trim() })
      actualizarSgLocal(dep.id, sg.id, s => ({ ...s, nombre: nombre.trim() }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al renombrar sub-grupo')
    }
  }

  async function handleEliminarSg(dep: CotizacionDepartamento, sg: CotizacionSubgrupo) {
    if (!await confirm(`¿Eliminar "${sg.nombre}" y todos sus ítems?`)) return
    try {
      await eliminarSubgrupo(sg.id, cot.id)
      toastOk('Eliminado')
      actualizarDepLocal(dep.id, d => ({
        ...d,
        subgrupos: d.subgrupos?.filter(s => s.id !== sg.id),
      }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al eliminar sub-grupo')
    }
  }

  // ── ÍTEMS ───────────────────────────────────────────────────────────────────

  async function handleGuardarItem(itemData: Omit<CotizacionItem, 'id' | 'created_at' | 'subtotal_cliente' | 'costo_real' | 'margen'>) {
    try {
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
        const itemId = itemModal.item.id
        const updatedItem = { ...itemModal.item, ...itemData }
        const oldDep = itemModal.depId
        const oldSg = itemModal.sgId ?? null
        const newDep = itemData.departamento_id
        const newSg = itemData.subgrupo_id ?? null
        const movido = oldDep !== newDep || oldSg !== newSg

        if (!movido) {
          // Edición en el mismo lugar: reemplazar en sitio.
          if (oldSg) {
            actualizarSgLocal(oldDep, oldSg, sg => ({ ...sg, items: sg.items?.map(i => i.id === itemId ? updatedItem : i) }))
          } else {
            actualizarDepLocal(oldDep, d => ({ ...d, items: d.items?.map(i => i.id === itemId ? updatedItem : i) }))
          }
        } else {
          // Movido de categoría/subgrupo: sacar del lugar viejo y agregar al nuevo.
          if (oldSg) {
            actualizarSgLocal(oldDep, oldSg, sg => ({ ...sg, items: sg.items?.filter(i => i.id !== itemId) }))
          } else {
            actualizarDepLocal(oldDep, d => ({ ...d, items: d.items?.filter(i => i.id !== itemId) }))
          }
          if (newSg) {
            actualizarSgLocal(newDep, newSg, sg => ({ ...sg, items: [...(sg.items ?? []), updatedItem] }))
          } else {
            actualizarDepLocal(newDep, d => ({ ...d, items: [...(d.items ?? []), updatedItem] }))
          }
        }
      }
      setItemModal(null)
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al guardar ítem')
    }
  }

  async function handleEliminarItem(item: CotizacionItem, depId: string, sgId?: string) {
    if (!await confirm(`¿Eliminar "${item.nombre}"?`)) return
    try {
      await eliminarItem(item.id, cot.id)
      toastOk('Eliminado')
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
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al eliminar ítem')
    }
  }

  // Drag-and-drop: mover un ítem a otra categoría / subgrupo (o sacarlo: toSg=null).
  async function moverItem(itemId: string, fromDep: string, fromSg: string | null, toDep: string, toSg: string | null) {
    if (fromDep === toDep && (fromSg ?? null) === (toSg ?? null)) return
    const depFrom = cot.departamentos?.find(d => d.id === fromDep)
    const item = fromSg
      ? depFrom?.subgrupos?.find(s => s.id === fromSg)?.items?.find(i => i.id === itemId)
      : depFrom?.items?.find(i => i.id === itemId)
    if (!item) return
    try {
      await actualizarItem(itemId, cot.id, { departamento_id: toDep, subgrupo_id: toSg })
      const movido = { ...item, departamento_id: toDep, subgrupo_id: toSg }
      if (fromSg) {
        actualizarSgLocal(fromDep, fromSg, sg => ({ ...sg, items: sg.items?.filter(i => i.id !== itemId) }))
      } else {
        actualizarDepLocal(fromDep, d => ({ ...d, items: d.items?.filter(i => i.id !== itemId) }))
      }
      if (toSg) {
        actualizarSgLocal(toDep, toSg, sg => ({ ...sg, items: [...(sg.items ?? []), movido] }))
      } else {
        actualizarDepLocal(toDep, d => ({ ...d, items: [...(d.items ?? []), movido] }))
      }
      toastOk('Ítem movido')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al mover el ítem')
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
          <Link href="/cotizaciones" className="text-ch-muted hover:text-ch-cream transition-colors text-sm font-body shrink-0">
            ← Cotizaciones
          </Link>
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
                    try {
                      await actualizarCotizacion(cot.id, { nombre: val })
                      setCot(c => ({ ...c, nombre: val }))
                    } catch (e) {
                      toastError(e instanceof Error ? e.message : 'Error al guardar nombre')
                    }
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
                            try {
                              const res = await cambiarEstadoCotizacion(cot.id, key)
                              if (res.error) toastError(res.error)
                              else setCot(c => ({ ...c, estado: key as typeof c.estado }))
                            } catch (e) {
                              toastError(e instanceof Error ? e.message : 'Error al cambiar estado')
                            }
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
              onClick={() => startTransition(async () => {
                try { await nuevaVersion(cot.id) } catch (e) { toastError(e instanceof Error ? e.message : 'Error al crear versión') }
              })}
              disabled={isPending}
              className="px-3 py-1.5 font-body text-xs text-ch-muted hover:text-ch-cream hover:bg-ch-border/20 transition-colors"
            >
              + versión
            </button>
            <span className="w-px h-4 bg-ch-border" />
            <button
              onClick={() => startTransition(async () => {
                try { await nuevaVariante(cot.id) } catch (e) { toastError(e instanceof Error ? e.message : 'Error al crear variante') }
              })}
              disabled={isPending}
              className="px-3 py-1.5 font-body text-xs text-ch-muted hover:text-ch-cream hover:bg-ch-border/20 transition-colors"
            >
              + variante
            </button>
            <span className="w-px h-4 bg-ch-border" />
            <button
              onClick={() => startTransition(async () => {
                try { await duplicarCotizacion(cot.id) } catch (e) { toastError(e instanceof Error ? e.message : 'Error al duplicar') }
              })}
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
          <PanelFacturacion cot={cot} setCot={setCot} />

          {/* Departamentos */}
          {(cot.departamentos ?? []).map(dep => (
            <DepBlock
              key={dep.id}
              dep={dep}
              editable={editable}
              showInterno={showInterno}
              onRenombrar={() => handleRenombrarDep(dep)}
              onPrecio={() => handlePrecioDep(dep)}
              onEliminar={() => handleEliminarDep(dep)}
              onAgregarSg={() => handleAgregarSg(dep)}
              onRenombrarSg={sg => handleRenombrarSg(dep, sg)}
              onPrecioSg={sg => handlePrecioSg(dep, sg)}
              onEliminarSg={sg => handleEliminarSg(dep, sg)}
              onAgregarItem={(sgId) => setItemModal({ mode: 'nuevo', depId: dep.id, sgId })}
              onEditarItem={(item, sgId) => setItemModal({ mode: 'editar', depId: dep.id, sgId, item })}
              onEliminarItem={(item, sgId) => handleEliminarItem(item, dep.id, sgId)}
              onMoverItem={moverItem}
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
        <PanelTotales
          cot={cot}
          setCot={setCot}
          totales={totales}
          showInterno={showInterno}
          setShowInterno={setShowInterno}
          editable={editable}
        />
      </div>

      {/* ── MODAL ÍTEM ── */}
      {itemModal && (
        <ItemModal
          mode={itemModal.mode}
          item={itemModal.item}
          cotizacionId={cot.id}
          departamentoId={itemModal.depId}
          subgrupoId={itemModal.sgId}
          departamentos={cot.departamentos ?? []}
          tarifas={tarifas}
          equipos={equipos}
          onGuardar={handleGuardarItem}
          onCerrar={() => setItemModal(null)}
        />
      )}
    </div>
  )
}
