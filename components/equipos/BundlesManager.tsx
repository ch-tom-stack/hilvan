'use client'

import { useState, useTransition } from 'react'
import { toastOk, toastError } from '@/lib/toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { formatCLP } from '@/types'
import { useCambiado } from '@/components/ui/useCambiado'
import type { Bundle, BundleItem } from '@/app/actions/bundles'
import {
  crearBundle,
  actualizarBundle,
  eliminarBundle,
  agregarEquipoABundle,
  agregarBundleABundle,
  eliminarItemBundle,
} from '@/app/actions/bundles'

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface EquipoSimple {
  id: string
  codigo: string
  nombre: string
  precio_jornada: number | null
}

interface Props {
  bundles: Bundle[]
  equipos: EquipoSimple[]
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function Badge({ label, tipo }: { label: string; tipo: 'fisico' | 'rental' }) {
  if (tipo === 'fisico') {
    return (
      <span className="font-body text-[9px] tracking-[0.4em] uppercase px-2 py-0.5 bg-ch-gold/10 border border-ch-gold text-ch-gold">
        {label}
      </span>
    )
  }
  return (
    <span className="font-body text-[9px] tracking-[0.4em] uppercase px-2 py-0.5 border border-ch-green text-ch-green">
      {label}
    </span>
  )
}

// ─── Formulario de nuevo / edición de bundle ──────────────────────────────────

interface FormData {
  codigo: string
  nombre: string
  descripcion: string
  fisico: boolean
  precio_jornada: string
}

const emptyForm: FormData = {
  codigo: '',
  nombre: '',
  descripcion: '',
  fisico: true,
  precio_jornada: '',
}

function BundleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: FormData
  onSave: (data: FormData) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormData>(initial ?? emptyForm)

  function set(key: keyof FormData, val: string | boolean) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  return (
    <div className="border border-ch-border bg-ch-surface/30 p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted block mb-1">
            Código
          </label>
          <input
            type="text"
            value={form.codigo}
            onChange={e => set('codigo', e.target.value)}
            className="w-full bg-ch-dark border border-ch-border px-3 py-2 font-mono text-xs text-ch-cream focus:outline-none focus:border-ch-green"
            placeholder="BND-001"
          />
        </div>
        <div>
          <label className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted block mb-1">
            Precio jornada (opcional)
          </label>
          <input
            type="number"
            value={form.precio_jornada}
            onChange={e => set('precio_jornada', e.target.value)}
            className="w-full bg-ch-dark border border-ch-border px-3 py-2 font-mono text-xs text-ch-cream focus:outline-none focus:border-ch-green"
            placeholder="0"
          />
        </div>
      </div>

      <div>
        <label className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted block mb-1">
          Nombre
        </label>
        <input
          type="text"
          value={form.nombre}
          onChange={e => set('nombre', e.target.value)}
          className="w-full bg-ch-dark border border-ch-border px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-green"
          placeholder="Nombre del bundle"
        />
      </div>

      <div>
        <label className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted block mb-1">
          Descripción
        </label>
        <textarea
          value={form.descripcion}
          onChange={e => set('descripcion', e.target.value)}
          rows={2}
          className="w-full bg-ch-dark border border-ch-border px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-green resize-none"
          placeholder="Descripción opcional"
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">
          Tipo
        </label>
        <button
          type="button"
          onClick={() => set('fisico', true)}
          className={`font-body text-[9px] tracking-[0.35em] uppercase px-3 py-1.5 border transition-colors ${
            form.fisico
              ? 'border-ch-gold text-ch-gold bg-ch-gold/10'
              : 'border-ch-border text-ch-muted hover:text-ch-cream'
          } ch-press`}
        >
          Físico
        </button>
        <button
          type="button"
          onClick={() => set('fisico', false)}
          className={`font-body text-[9px] tracking-[0.35em] uppercase px-3 py-1.5 border transition-colors ${
            !form.fisico
              ? 'border-ch-green text-ch-green'
              : 'border-ch-border text-ch-muted hover:text-ch-cream'
          } ch-press`}
        >
          Rental
        </button>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={() => onSave(form)}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2.5 transition-colors ch-press"
        >
          Guardar
        </button>
        <button
          onClick={onCancel}
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2.5 transition-colors ch-press"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── Formulario para agregar item a bundle ────────────────────────────────────

function AgregarItemForm({
  tipo,
  bundleId,
  equipos,
  bundles,
  onDone,
  onCancel,
}: {
  tipo: 'equipo' | 'bundle'
  bundleId: string
  equipos: EquipoSimple[]
  bundles: Bundle[]
  onDone: () => void
  onCancel: () => void
}) {
  const [selectedId, setSelectedId] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [pending, startTransition] = useTransition()

  function handleSave() {
    if (!selectedId) return
    const cant = parseInt(cantidad) || 1
    startTransition(async () => {
      let result
      if (tipo === 'equipo') {
        result = await agregarEquipoABundle(bundleId, selectedId, cant)
      } else {
        result = await agregarBundleABundle(bundleId, selectedId, cant)
      }
      if (result.error) {
        toastError(result.error)
      } else {
        toastOk(tipo === 'equipo' ? 'Equipo agregado' : 'Sub-bundle agregado')
        onDone()
      }
    })
  }

  const opciones = tipo === 'equipo'
    ? equipos
    : bundles.filter(b => b.id !== bundleId)

  return (
    <div className="flex items-center gap-2 mt-2 p-3 bg-ch-surface/50 border border-ch-border">
      <select
        value={selectedId}
        onChange={e => setSelectedId(e.target.value)}
        className="flex-1 bg-ch-dark border border-ch-border px-2 py-1.5 font-body text-xs text-ch-cream focus:outline-none focus:border-ch-green"
      >
        <option value="">— Seleccionar {tipo === 'equipo' ? 'equipo' : 'bundle'} —</option>
        {opciones.map(o => (
          <option key={o.id} value={o.id}>
            {o.codigo} · {o.nombre}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={cantidad}
        onChange={e => setCantidad(e.target.value)}
        min={1}
        className="w-16 bg-ch-dark border border-ch-border px-2 py-1.5 font-mono text-xs text-ch-cream text-center focus:outline-none focus:border-ch-green"
      />
      <button
        onClick={handleSave}
        disabled={pending || !selectedId}
        className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[9px] tracking-[0.3em] uppercase px-3 py-1.5 transition-colors disabled:opacity-50 ch-press"
      >
        {pending ? '…' : 'Agregar'}
      </button>
      <button
        onClick={onCancel}
        className="text-ch-muted hover:text-ch-cream font-body text-xs px-2 transition-colors ch-press"
      >
        ✕
      </button>
    </div>
  )
}

// ─── Card de bundle individual ────────────────────────────────────────────────

function BundleCard({
  bundle,
  equipos,
  bundles,
  onEliminar,
}: {
  bundle: Bundle
  equipos: EquipoSimple[]
  bundles: Bundle[]
  onEliminar: () => void
}) {
  const cam = useCambiado<HTMLDivElement>()
  const [editando, setEditando] = useState(false)
  const [mostrarAgregarEquipo, setMostrarAgregarEquipo] = useState(false)
  const [mostrarAgregarBundle, setMostrarAgregarBundle] = useState(false)
  const [pending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()

  function handleGuardar(form: FormData) {
    startTransition(async () => {
      const result = await actualizarBundle(bundle.id, {
        codigo: form.codigo,
        nombre: form.nombre,
        descripcion: form.descripcion,
        fisico: form.fisico,
        precio_jornada: form.precio_jornada ? parseInt(form.precio_jornada) : undefined,
      })
      if (result.error) {
        toastError(result.error)
      } else {
        toastOk('Bundle actualizado')
        cam.marcar()
        setEditando(false)
      }
    })
  }

  async function handleEliminarItem(itemId: string) {
    const ok = await confirm('¿Eliminar este item del bundle?')
    if (!ok) return
    startTransition(async () => {
      const result = await eliminarItemBundle(itemId)
      if (result.error) toastError(result.error)
      else toastOk('Item eliminado')
    })
  }

  if (editando) {
    return (
      <div>
        <BundleForm
          initial={{
            codigo: bundle.codigo,
            nombre: bundle.nombre,
            descripcion: bundle.descripcion ?? '',
            fisico: bundle.fisico,
            precio_jornada: bundle.precio_jornada ? String(bundle.precio_jornada) : '',
          }}
          onSave={handleGuardar}
          onCancel={() => setEditando(false)}
        />
        {ConfirmDialog}
      </div>
    )
  }

  return (
    <div ref={cam.ref} className="border border-ch-border bg-ch-surface/10 p-5">
      {ConfirmDialog}

      {/* Encabezado del bundle */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="font-mono text-[10px] text-ch-muted">{bundle.codigo}</span>
            <Badge
              label={bundle.fisico ? 'Físico' : 'Rental'}
              tipo={bundle.fisico ? 'fisico' : 'rental'}
            />
          </div>
          <h3 className="font-display italic text-xl text-ch-cream leading-tight">
            {bundle.nombre}
          </h3>
          {bundle.descripcion && (
            <p className="font-body text-xs text-ch-muted mt-1">{bundle.descripcion}</p>
          )}
          {bundle.precio_jornada != null && (
            <p className="font-body text-xs text-ch-subtle mt-1">
              {formatCLP(bundle.precio_jornada)} / jornada
            </p>
          )}
        </div>

        {/* Acciones del bundle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setEditando(true)}
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-[0.3em] uppercase px-3 py-1.5 transition-colors ch-press"
          >
            Editar
          </button>
          <button
            onClick={onEliminar}
            className="border border-ch-border text-ch-muted hover:text-red-400 font-body text-[9px] tracking-[0.3em] uppercase px-3 py-1.5 transition-colors ch-press"
          >
            Eliminar
          </button>
        </div>
      </div>

      {/* Items del bundle */}
      <div className="border-t border-ch-border/40 pt-4">
        <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">
          Contenido
        </p>

        {bundle.items.length === 0 ? (
          <p className="font-body text-xs text-ch-subtle border border-dashed border-ch-border/40 px-4 py-3 text-center mb-3">
            Sin items todavía
          </p>
        ) : (
          <div className="space-y-1 mb-3">
            {bundle.items.map(item => {
              const nombre = item.equipo
                ? `${item.equipo.codigo} · ${item.equipo.nombre}`
                : item.bundle_hijo
                  ? `${item.bundle_hijo.codigo} · ${item.bundle_hijo.nombre}`
                  : '—'
              const precio = item.equipo?.precio_jornada ?? item.bundle_hijo?.precio_jornada ?? null
              const esSub = item.bundle_hijo_id != null

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-1.5 border-b border-ch-border/20 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-body text-[9px] tracking-widest text-ch-subtle bg-ch-surface px-1.5 py-0.5">
                      ×{item.cantidad}
                    </span>
                    <div>
                      <span className="font-body text-xs text-ch-cream">{nombre}</span>
                      {esSub && (
                        <span className="ml-2 font-body text-[9px] text-ch-subtle">
                          (sub-bundle)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {precio != null && (
                      <span className="font-mono text-[10px] text-ch-subtle">
                        {formatCLP(precio * item.cantidad)}
                      </span>
                    )}
                    <button
                      onClick={() => handleEliminarItem(item.id)}
                      disabled={pending}
                      className="text-ch-subtle hover:text-red-400 font-body text-[9px] transition-colors disabled:opacity-50 ch-press"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Botones agregar item */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setMostrarAgregarEquipo(v => !v)
              setMostrarAgregarBundle(false)
            }}
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-[0.3em] uppercase px-3 py-1.5 transition-colors ch-press"
          >
            + Equipo
          </button>
          <button
            onClick={() => {
              setMostrarAgregarBundle(v => !v)
              setMostrarAgregarEquipo(false)
            }}
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-[0.3em] uppercase px-3 py-1.5 transition-colors ch-press"
          >
            + Bundle
          </button>
        </div>

        {mostrarAgregarEquipo && (
          <AgregarItemForm
            tipo="equipo"
            bundleId={bundle.id}
            equipos={equipos}
            bundles={bundles}
            onDone={() => setMostrarAgregarEquipo(false)}
            onCancel={() => setMostrarAgregarEquipo(false)}
          />
        )}
        {mostrarAgregarBundle && (
          <AgregarItemForm
            tipo="bundle"
            bundleId={bundle.id}
            equipos={equipos}
            bundles={bundles}
            onDone={() => setMostrarAgregarBundle(false)}
            onCancel={() => setMostrarAgregarBundle(false)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function BundlesManager({ bundles: initialBundles, equipos }: Props) {
  const [bundles, setBundles] = useState<Bundle[]>(initialBundles)
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false)
  const [pending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()

  // Sincronizar cuando cambian los datos del server (por revalidatePath)
  // En Next.js App Router los Server Components re-renderizan automáticamente,
  // pero como somos Client Component, usamos la prop inicial y confiamos en
  // el revalidatePath + router.refresh implícito.

  function handleCrear(form: FormData) {
    startTransition(async () => {
      const result = await crearBundle({
        codigo: form.codigo,
        nombre: form.nombre,
        descripcion: form.descripcion,
        fisico: form.fisico,
        precio_jornada: form.precio_jornada ? parseInt(form.precio_jornada) : undefined,
      })
      if (result.error) {
        toastError(result.error)
      } else {
        toastOk('Bundle creado')
        setMostrarFormNuevo(false)
        // El server revalida la ruta; el componente padre se re-renderiza
        window.location.reload()
      }
    })
  }

  async function handleEliminarBundle(id: string) {
    const ok = await confirm('¿Eliminar este bundle? Esta acción no se puede deshacer.')
    if (!ok) return
    startTransition(async () => {
      const result = await eliminarBundle(id)
      if (result.error) {
        toastError(result.error)
      } else {
        toastOk('Bundle eliminado')
        window.location.reload()
      }
    })
  }

  return (
    <div className="space-y-6">
      {ConfirmDialog}

      {/* Barra de acciones */}
      <div className="flex items-center justify-between">
        <p className="font-body text-xs text-ch-muted">
          {bundles.length} {bundles.length === 1 ? 'bundle' : 'bundles'}
        </p>
        <button
          onClick={() => setMostrarFormNuevo(v => !v)}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium
                     text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors duration-200 ch-press"
        >
          + Nuevo Bundle
        </button>
      </div>

      {/* Formulario de creación */}
      {mostrarFormNuevo && (
        <BundleForm
          onSave={handleCrear}
          onCancel={() => setMostrarFormNuevo(false)}
        />
      )}

      {/* Lista de bundles */}
      {bundles.length === 0 && !mostrarFormNuevo ? (
        <div className="border border-dashed border-ch-border p-16 text-center">
          <p className="text-ch-muted font-body text-sm">No hay bundles registrados aún.</p>
          <button
            onClick={() => setMostrarFormNuevo(true)}
            className="text-ch-green font-body text-sm mt-2 inline-block hover:text-ch-green-light ch-press"
          >
            Crear el primero →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {bundles.map(bundle => (
            <BundleCard
              key={bundle.id}
              bundle={bundle}
              equipos={equipos}
              bundles={bundles}
              onEliminar={() => handleEliminarBundle(bundle.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
