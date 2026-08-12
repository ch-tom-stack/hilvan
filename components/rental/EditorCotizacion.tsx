'use client'

import { useState, useTransition } from 'react'
import {
  actualizarRentalCotizacion,
  agregarItemRentalCotizacion,
  eliminarItemRentalCotizacion,
  agregarSeccionRentalCotizacion,
} from '@/app/actions/rental'
import { toastOk, toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import {
  formatCLP,
  subtotalRentalItem,
  calcularTotalesRental,
  ESTADO_RENTAL_COT_LABELS,
} from '@/types'
import { parseFechaLocal } from '@/lib/fechas'
import { useCambiado } from '@/components/ui/useCambiado'
import type {
  RentalCotizacion,
  RentalCotizacionSeccion,
  RentalCotizacionItem,
  Equipo,
  Maleta,
  EstadoRentalCotizacion,
} from '@/types'

const ESTADO_COLORS: Record<EstadoRentalCotizacion, string> = {
  borrador:  'text-ch-muted  border-ch-border    bg-transparent',
  enviada:   'text-blue-400  border-blue-400/30  bg-blue-400/5',
  aprobada:  'text-ch-green  border-ch-green/30  bg-ch-green/5',
  rechazada: 'text-red-400   border-red-400/30   bg-red-400/5',
  cerrada:   'text-ch-subtle border-ch-border/50  bg-transparent',
}

interface Props {
  cotizacion: RentalCotizacion & {
    cliente?: { nombre: string; empresa?: string; email?: string; rut?: string } | null
    reserva?: { fecha_inicio: string; fecha_fin: string; equipo?: { nombre: string; codigo: string } | null; maleta?: { nombre: string; codigo: string } | null } | null
    secciones: (RentalCotizacionSeccion & { items: RentalCotizacionItem[] })[]
  }
  equipos: Equipo[]
  maletas: Maleta[]
}

function FormAgregarItem({
  cotizacionId,
  seccionId,
  equipos,
  maletas,
  onDone,
}: {
  cotizacionId: string
  seccionId: string
  equipos: Equipo[]
  maletas: Maleta[]
  onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [tipo, setTipo] = useState<'equipo' | 'maleta' | 'libre'>('equipo')
  const [equipoId, setEquipoId] = useState('')
  const [maletaId, setMaletaId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [dias, setDias] = useState(1)
  const [precio, setPrecio] = useState(0)
  const [incluido, setIncluido] = useState(false)

  const selectedEquipo = equipos.find(e => e.id === equipoId)

  function handleEquipoChange(id: string) {
    setEquipoId(id)
    const eq = equipos.find(e => e.id === id)
    if (eq) {
      setDescripcion(eq.nombre)
      if (eq.precio_jornada) setPrecio(eq.precio_jornada)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const desc = descripcion || selectedEquipo?.nombre || ''
    if (!desc) { toastError('Agrega una descripción'); return }

    startTransition(async () => {
      const r = await agregarItemRentalCotizacion(cotizacionId, {
        seccion_id:     seccionId,
        equipo_id:      tipo === 'equipo' ? (equipoId || null) : null,
        maleta_id:      tipo === 'maleta' ? (maletaId || null) : null,
        descripcion:    desc,
        cantidad,
        dias,
        precio_unitario: precio,
        descuento:      0,
        descuento_tipo: 'porcentaje',
        incluido,
      })
      if (r.ok) { toastOk('Ítem agregado'); momento('item.agregado'); onDone() }
      else { toastError(r.error ?? 'Error'); momento('error', { mensaje: r.error ?? 'Error' }) }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="border border-ch-border bg-ch-surface/20 p-4 space-y-3">
      <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Agregar ítem</p>

      <div className="flex gap-1">
        {(['equipo', 'maleta', 'libre'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={`text-[9px] tracking-widest uppercase px-3 py-1 border transition-colors ${
              tipo === t
                ? 'border-ch-green text-ch-cream bg-ch-surface'
                : 'border-ch-border text-ch-subtle hover:text-ch-muted'
            } ch-press`}
          >
            {t === 'equipo' ? 'Equipo' : t === 'maleta' ? 'Maleta' : 'Libre'}
          </button>
        ))}
      </div>

      {tipo === 'equipo' && (
        <select
          value={equipoId}
          onChange={e => handleEquipoChange(e.target.value)}
          className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]"
        >
          <option value="">— Seleccionar equipo —</option>
          {equipos.map(eq => (
            <option key={eq.id} value={eq.id}>{eq.codigo} · {eq.nombre}</option>
          ))}
        </select>
      )}

      {tipo === 'maleta' && (
        <select
          value={maletaId}
          onChange={e => setMaletaId(e.target.value)}
          className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]"
        >
          <option value="">— Seleccionar maleta —</option>
          {maletas.map(m => (
            <option key={m.id} value={m.id}>{m.codigo} · {m.nombre}</option>
          ))}
        </select>
      )}

      <input
        type="text"
        placeholder="Descripción"
        value={descripcion}
        onChange={e => setDescripcion(e.target.value)}
        required
        className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px] placeholder:text-ch-subtle"
      />

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">Cant.</label>
          <input type="number" min={1} value={cantidad} onChange={e => setCantidad(+e.target.value)}
            className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]" />
        </div>
        <div>
          <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">Días</label>
          <input type="number" min={1} value={dias} onChange={e => setDias(+e.target.value)}
            className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]" />
        </div>
        <div>
          <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">Precio / día</label>
          <input type="number" min={0} value={precio} onChange={e => setPrecio(+e.target.value)}
            className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]" />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={incluido} onChange={e => setIncluido(e.target.checked)} className="accent-[#7a9e7e]" />
        <span className="font-body text-xs text-ch-muted">Incluido (sin costo)</span>
      </label>

      {!incluido && cantidad > 0 && dias > 0 && precio > 0 && (
        <p className="font-body text-xs text-ch-green">
          Subtotal: {formatCLP(precio * cantidad * dias)}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onDone}
          className="flex-1 border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-widest uppercase py-2 transition-colors ch-press">
          Cancelar
        </button>
        <button type="submit" disabled={pending}
          className="flex-1 bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[9px] tracking-widest uppercase py-2 transition-colors disabled:opacity-50 ch-press">
          {pending ? 'Agregando…' : 'Agregar'}
        </button>
      </div>
    </form>
  )
}

export default function EditorCotizacion({ cotizacion, equipos, maletas }: Props) {
  const cam = useCambiado<HTMLDivElement>()
  const [pending, startTransition] = useTransition()
  const [addingItemEnSeccion, setAddingItemEnSeccion] = useState<string | null>(null)
  const [addingSeccion, setAddingSeccion] = useState(false)
  const [nuevaSeccion, setNuevaSeccion] = useState('')

  const totales = calcularTotalesRental(cotizacion)

  function cambiarEstado(estado: EstadoRentalCotizacion) {
    startTransition(async () => {
      const r = await actualizarRentalCotizacion(cotizacion.id, { estado })
      if (r.ok) {
        toastOk('Estado actualizado')
        cam.marcar()
        // Reusa los momentos del CRM: mover una cotización de estado es el
        // mismo gesto que mover una tarjeta de etapa.
        momento(estado === 'rechazada' ? 'crm.retroceso' : 'crm.avance', { mensaje: '' })
      } else { toastError(r.error ?? 'Error'); momento('error', { mensaje: r.error ?? 'Error' }) }
    })
  }

  function eliminarItem(itemId: string) {
    startTransition(async () => {
      const r = await eliminarItemRentalCotizacion(itemId, cotizacion.id)
      if (r.ok) { toastOk('Ítem eliminado'); momento('item.eliminado') }
      else { toastError(r.error ?? 'Error'); momento('error', { mensaje: r.error ?? 'Error' }) }
    })
  }

  function agregarSeccion() {
    if (!nuevaSeccion.trim()) return
    startTransition(async () => {
      const r = await agregarSeccionRentalCotizacion(cotizacion.id, nuevaSeccion.trim())
      if (r.ok) { toastOk('Sección agregada'); momento('item.agregado'); setAddingSeccion(false); setNuevaSeccion('') }
      else { toastError(r.error ?? 'Error'); momento('error', { mensaje: r.error ?? 'Error' }) }
    })
  }

  const reserva = cotizacion.reserva

  return (
    <div ref={cam.ref} className="space-y-8">

      {/* Info header */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cliente */}
        <div>
          <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-2">Cliente</p>
          <div className="border border-ch-border bg-ch-surface/20 px-4 py-3">
            <p className="font-body text-sm text-ch-cream">
              {cotizacion.cliente?.nombre ?? cotizacion.cliente_nombre_libre ?? '—'}
            </p>
            {cotizacion.cliente?.empresa && (
              <p className="font-body text-xs text-ch-muted">{cotizacion.cliente.empresa}</p>
            )}
            {cotizacion.cliente?.email && (
              <p className="font-body text-xs text-ch-subtle">{cotizacion.cliente.email}</p>
            )}
          </div>
        </div>

        {/* Reserva vinculada */}
        {reserva && (
          <div>
            <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-2">Reserva vinculada</p>
            <div className="border border-ch-border bg-ch-surface/20 px-4 py-3">
              <p className="font-body text-sm text-ch-cream">
                {reserva.equipo?.nombre ?? reserva.maleta?.nombre ?? '—'}
              </p>
              <p className="font-body text-xs text-ch-muted">
                {parseFechaLocal(reserva.fecha_inicio).toLocaleDateString('es-CL')}
                {' → '}
                {parseFechaLocal(reserva.fecha_fin).toLocaleDateString('es-CL')}
              </p>
            </div>
          </div>
        )}

        {/* Estado */}
        <div>
          <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-2">Estado</p>
          <div className="border border-ch-border bg-ch-surface/20 px-4 py-3 flex items-center justify-between">
            <span className={`text-xs font-body px-2.5 py-0.5 rounded-[2px] border ${ESTADO_COLORS[cotizacion.estado]}`}>
              {ESTADO_RENTAL_COT_LABELS[cotizacion.estado]}
            </span>
            <select
              onChange={e => cambiarEstado(e.target.value as EstadoRentalCotizacion)}
              defaultValue=""
              disabled={pending}
              className="bg-transparent border-0 text-ch-subtle text-[10px] focus:outline-none cursor-pointer"
            >
              <option value="" disabled>Cambiar →</option>
              {(['borrador', 'enviada', 'aprobada', 'rechazada', 'cerrada'] as EstadoRentalCotizacion[]).map(e => (
                <option key={e} value={e}>{ESTADO_RENTAL_COT_LABELS[e]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Secciones e ítems */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase">Ítems</p>
          <button
            onClick={() => setAddingSeccion(true)}
            className="font-body text-[9px] tracking-widest uppercase text-ch-green hover:text-ch-green-light transition-colors ch-press"
          >
            + Agregar sección
          </button>
        </div>

        {addingSeccion && (
          <div className="border border-ch-border bg-ch-surface/20 p-4 mb-4 flex gap-2">
            <input
              type="text"
              placeholder="Nombre de la sección"
              value={nuevaSeccion}
              onChange={e => setNuevaSeccion(e.target.value)}
              autoFocus
              className="flex-1 bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px] placeholder:text-ch-subtle"
            />
            <button onClick={agregarSeccion} disabled={pending}
              className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[9px] tracking-widest uppercase px-4 py-2 disabled:opacity-50 ch-press">
              Agregar
            </button>
            <button onClick={() => setAddingSeccion(false)}
              className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-widest uppercase px-4 py-2 ch-press">
              ×
            </button>
          </div>
        )}

        <div className="space-y-6">
          {cotizacion.secciones.map(sec => (
            <div key={sec.id}>
              {/* Nombre sección */}
              <div className="flex items-center justify-between mb-2">
                <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">{sec.nombre}</p>
                <button
                  onClick={() => setAddingItemEnSeccion(addingItemEnSeccion === sec.id ? null : sec.id)}
                  className="font-body text-[9px] tracking-widest uppercase text-ch-green hover:text-ch-green-light transition-colors ch-press"
                >
                  + Ítem
                </button>
              </div>

              {/* Ítems de la sección */}
              <div className="border border-ch-border">
                {(sec.items ?? []).length === 0 && addingItemEnSeccion !== sec.id && (
                  <div className="px-5 py-4 text-center">
                    <p className="font-body text-xs text-ch-subtle">Sin ítems aún.</p>
                  </div>
                )}
                {/* Header tabla */}
                {(sec.items ?? []).length > 0 && (
                  <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto_auto] border-b border-ch-border bg-ch-surface/50">
                    {['Descripción', 'Cant.', 'Días', 'Precio/día', 'Subtotal', ''].map(h => (
                      <div key={h} className="px-4 py-2 text-ch-muted font-body text-[9px] tracking-widest uppercase">
                        {h}
                      </div>
                    ))}
                  </div>
                )}
                {(sec.items ?? []).map(item => {
                  const sub = subtotalRentalItem(item)
                  return (
                    <div key={item.id}
                      className="border-b border-ch-border/50 last:border-b-0 px-4 py-3 flex flex-wrap items-center gap-2 sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto_auto]">
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm text-ch-cream truncate">{item.descripcion}</p>
                        {item.incluido && (
                          <span className="font-body text-[9px] text-ch-green uppercase tracking-widest">Incluido</span>
                        )}
                      </div>
                      <span className="font-body text-xs text-ch-muted">{item.cantidad}</span>
                      <span className="font-body text-xs text-ch-muted">{item.dias}d</span>
                      <span className="font-body text-xs text-ch-muted">{formatCLP(item.precio_unitario)}</span>
                      <span className="font-body text-xs text-ch-cream font-medium">{formatCLP(sub)}</span>
                      <button
                        onClick={() => eliminarItem(item.id)}
                        disabled={pending}
                        className="font-body text-[9px] text-ch-subtle hover:text-red-400 transition-colors disabled:opacity-50 ch-press"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}

                {/* Form agregar ítem */}
                {addingItemEnSeccion === sec.id && (
                  <div className="border-t border-ch-border">
                    <FormAgregarItem
                      cotizacionId={cotizacion.id}
                      seccionId={sec.id}
                      equipos={equipos}
                      maletas={maletas}
                      onDone={() => setAddingItemEnSeccion(null)}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totales */}
      <div className="border border-ch-border bg-ch-surface/20 p-5 max-w-sm ml-auto">
        <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-3">Resumen</p>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="font-body text-xs text-ch-muted">Subtotal</span>
            <span className="font-body text-xs text-ch-cream">{formatCLP(totales.neto)}</span>
          </div>
          {totales.descuento_global_monto > 0 && (
            <div className="flex justify-between">
              <span className="font-body text-xs text-ch-muted">Descuento</span>
              <span className="font-body text-xs text-red-400">-{formatCLP(totales.descuento_global_monto)}</span>
            </div>
          )}
          {cotizacion.con_iva && (
            <div className="flex justify-between">
              <span className="font-body text-xs text-ch-muted">IVA (19%)</span>
              <span className="font-body text-xs text-ch-cream">{formatCLP(totales.iva)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-ch-border">
            <span className="font-body text-sm text-ch-cream font-medium">Total</span>
            <span className="font-display italic text-lg text-ch-cream">{formatCLP(totales.total)}</span>
          </div>
        </div>
      </div>

      {/* Notas */}
      {(cotizacion.notas_cliente || cotizacion.notas_internas) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cotizacion.notas_cliente && (
            <div>
              <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-2">Notas para el cliente</p>
              <p className="font-body text-sm text-ch-cream leading-relaxed whitespace-pre-line">{cotizacion.notas_cliente}</p>
            </div>
          )}
          {cotizacion.notas_internas && (
            <div>
              <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-2">Notas internas</p>
              <p className="font-body text-sm text-ch-muted leading-relaxed whitespace-pre-line">{cotizacion.notas_internas}</p>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
