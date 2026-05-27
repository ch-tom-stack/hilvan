'use client'

import { useState, useTransition } from 'react'
import {
  crearRentalReserva,
  actualizarEstadoReserva,
  eliminarReserva,
} from '@/app/actions/rental'
import type { EstadoRental, RentalReserva } from '@/types'
import EstadoVacio from '@/components/ui/EstadoVacio'

type ReservaConJoins = RentalReserva & {
  equipo?: { codigo: string; nombre: string } | null
  maleta?: { codigo: string; nombre: string } | null
  cliente?: { nombre: string } | null
}

const ESTADO_LABELS: Record<EstadoRental, string> = {
  pendiente:  'Pendiente',
  aprobada:   'Aprobada',
  denegada:   'Denegada',
  entregada:  'Entregada',
  devuelta:   'Devuelta',
}

const ESTADO_COLORS: Record<EstadoRental, string> = {
  pendiente:  'text-amber-400 border-amber-400/30',
  aprobada:   'text-blue-400 border-blue-400/30',
  denegada:   'text-red-400 border-red-400/30',
  entregada:  'text-ch-green border-ch-green/30',
  devuelta:   'text-ch-muted border-ch-border',
}

interface Props {
  reservas: ReservaConJoins[]
  equipos: { id: string; codigo: string; nombre: string }[]
  maletas: { id: string; codigo: string; nombre: string }[]
  clientes: { id: string; nombre: string }[]
  puedeGestionar: boolean
}

function formatFecha(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default function TablaReservas({ reservas: inicial, equipos, maletas, clientes, puedeGestionar }: Props) {
  const [reservas, setReservas] = useState<ReservaConJoins[]>(inicial)
  const [formulario, setFormulario] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  // Form state
  const [form, setForm] = useState({
    tipo: 'equipo' as 'equipo' | 'maleta',
    equipo_id: '',
    maleta_id: '',
    cliente_id: '',
    fecha_inicio: '',
    fecha_fin: '',
    notas: '',
  })

  function nombreItem(r: ReservaConJoins) {
    if (r.equipo) return `${r.equipo.codigo} · ${r.equipo.nombre}`
    if (r.maleta) return `${r.maleta.codigo} · ${r.maleta.nombre}`
    return '—'
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.fecha_inicio || !form.fecha_fin) {
      setError('Las fechas son requeridas')
      return
    }
    if (form.fecha_fin < form.fecha_inicio) {
      setError('La fecha de fin debe ser posterior al inicio')
      return
    }
    if (form.tipo === 'equipo' && !form.equipo_id) {
      setError('Selecciona un equipo')
      return
    }
    if (form.tipo === 'maleta' && !form.maleta_id) {
      setError('Selecciona una maleta')
      return
    }

    start(async () => {
      const res = await crearRentalReserva({
        equipo_id: form.tipo === 'equipo' ? form.equipo_id : null,
        maleta_id: form.tipo === 'maleta' ? form.maleta_id : null,
        cliente_id: form.cliente_id || null,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        notas: form.notas || null,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      setFormulario(false)
      setForm({ tipo: 'equipo', equipo_id: '', maleta_id: '', cliente_id: '', fecha_inicio: '', fecha_fin: '', notas: '' })
      // Refresca desde servidor en siguiente render
      window.location.reload()
    })
  }

  function handleEstado(id: string, estado: EstadoRental) {
    start(async () => {
      await actualizarEstadoReserva(id, estado)
      setReservas(prev => prev.map(r => r.id === id ? { ...r, estado } : r))
    })
  }

  function handleEliminar(id: string) {
    start(async () => {
      await eliminarReserva(id)
      setReservas(prev => prev.filter(r => r.id !== id))
    })
  }

  const activas   = reservas.filter(r => !['devuelta', 'denegada'].includes(r.estado))
  const historial = reservas.filter(r => ['devuelta', 'denegada'].includes(r.estado))

  const inputClass = "w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px] placeholder:text-ch-subtle"
  const labelClass = "block text-[10px] tracking-widest uppercase text-ch-muted mb-1"

  return (
    <div>
      {/* Botón nueva reserva */}
      {puedeGestionar && !formulario && (
        <button
          onClick={() => setFormulario(true)}
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2.5 transition-colors mb-8"
        >
          + Nueva reserva
        </button>
      )}

      {/* Formulario */}
      {formulario && (
        <div className="border border-ch-border bg-ch-surface/30 p-6 mb-8 rounded-[2px]">
          <div className="flex items-center justify-between mb-5">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Nueva reserva</p>
            <button onClick={() => setFormulario(false)} className="text-ch-subtle hover:text-ch-muted text-xl leading-none">×</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tipo */}
            <div>
              <label className={labelClass}>Tipo de ítem</label>
              <div className="flex gap-2">
                {(['equipo', 'maleta'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tipo: t, equipo_id: '', maleta_id: '' }))}
                    className={`font-body text-[9px] tracking-widest uppercase px-4 py-2 border transition-colors rounded-[2px] ${
                      form.tipo === t
                        ? 'border-ch-cream text-ch-cream'
                        : 'border-ch-border text-ch-muted hover:text-ch-cream'
                    }`}
                  >
                    {t === 'equipo' ? 'Equipo' : 'Maleta'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Equipo o Maleta */}
              <div>
                <label className={labelClass}>{form.tipo === 'equipo' ? 'Equipo' : 'Maleta'} *</label>
                {form.tipo === 'equipo' ? (
                  <select value={form.equipo_id} onChange={e => setForm(f => ({ ...f, equipo_id: e.target.value }))} className={inputClass}>
                    <option value="">— Seleccionar</option>
                    {equipos.map(eq => (
                      <option key={eq.id} value={eq.id}>{eq.codigo} · {eq.nombre}</option>
                    ))}
                  </select>
                ) : (
                  <select value={form.maleta_id} onChange={e => setForm(f => ({ ...f, maleta_id: e.target.value }))} className={inputClass}>
                    <option value="">— Seleccionar</option>
                    {maletas.map(m => (
                      <option key={m.id} value={m.id}>{m.codigo} · {m.nombre}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Cliente */}
              <div>
                <label className={labelClass}>Cliente</label>
                <select value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))} className={inputClass}>
                  <option value="">— Sin asignar</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Fechas */}
              <div>
                <label className={labelClass}>Fecha inicio *</label>
                <input type="date" value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Fecha fin *</label>
                <input type="date" value={form.fecha_fin} onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))} className={inputClass} />
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className={labelClass}>Notas</label>
              <textarea
                value={form.notas}
                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                rows={2}
                placeholder="Detalles adicionales..."
                className={`${inputClass} resize-none`}
              />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setFormulario(false); setError('') }}
                className="flex-1 border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-[0.35em] uppercase py-2.5 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 border border-ch-cream text-ch-cream hover:bg-ch-dark font-body text-[9px] tracking-[0.35em] uppercase py-2.5 transition-colors disabled:opacity-50"
              >
                {pending ? 'Guardando…' : 'Crear reserva'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reservas activas */}
      {activas.length === 0 && !formulario ? (
        <div className="mb-8">
          <EstadoVacio mensaje="No hay reservas activas." />
        </div>
      ) : activas.length > 0 ? (
        <div className="mb-8">
          <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Activas</p>
          <div className="space-y-2">
            {activas.map(r => (
              <ReservaRow
                key={r.id}
                reserva={r}
                nombreItem={nombreItem(r)}
                puedeGestionar={puedeGestionar}
                pending={pending}
                onEstado={handleEstado}
                onEliminar={handleEliminar}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Historial */}
      {historial.length > 0 && (
        <div>
          <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Historial</p>
          <div className="space-y-2">
            {historial.map(r => (
              <ReservaRow
                key={r.id}
                reserva={r}
                nombreItem={nombreItem(r)}
                puedeGestionar={puedeGestionar}
                pending={pending}
                onEstado={handleEstado}
                onEliminar={handleEliminar}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ReservaRow({ reserva: r, nombreItem, puedeGestionar, pending, onEstado, onEliminar }: {
  reserva: ReservaConJoins
  nombreItem: string
  puedeGestionar: boolean
  pending: boolean
  onEstado: (id: string, estado: EstadoRental) => void
  onEliminar: (id: string) => void
}) {
  const [expandido, setExpandido] = useState(false)

  const SIGUIENTE: Partial<Record<EstadoRental, { estado: EstadoRental; label: string }[]>> = {
    pendiente: [{ estado: 'aprobada', label: 'Aprobar' }, { estado: 'denegada', label: 'Denegar' }],
    aprobada:  [{ estado: 'entregada', label: 'Marcar entregada' }],
    entregada: [{ estado: 'devuelta', label: 'Marcar devuelta' }],
  }

  const acciones = puedeGestionar ? (SIGUIENTE[r.estado] ?? []) : []

  return (
    <div className="border border-ch-border rounded-[2px] bg-ch-surface/20 hover:bg-ch-surface/30 transition-colors">
      <div
        className="px-4 py-3 flex items-start justify-between gap-4 cursor-pointer"
        onClick={() => setExpandido(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <p className="text-ch-cream text-sm truncate">{nombreItem}</p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <p className="text-ch-subtle text-xs">
              {formatFecha(r.fecha_inicio)} → {formatFecha(r.fecha_fin)}
            </p>
            {r.cliente && (
              <span className="text-ch-subtle text-xs">{r.cliente.nombre}</span>
            )}
          </div>
        </div>
        <span className={`text-xs font-body px-2.5 py-0.5 rounded-[2px] border shrink-0 ${ESTADO_COLORS[r.estado]}`}>
          {ESTADO_LABELS[r.estado]}
        </span>
      </div>

      {expandido && (
        <div className="border-t border-ch-border px-4 py-3 space-y-2">
          {r.notas && (
            <p className="text-ch-subtle text-xs">{r.notas}</p>
          )}
          {(acciones.length > 0 || puedeGestionar) && (
            <div className="flex items-center gap-2 flex-wrap">
              {acciones.map(a => (
                <button
                  key={a.estado}
                  onClick={() => onEstado(r.id, a.estado)}
                  disabled={pending}
                  className="font-body text-[9px] tracking-[0.3em] uppercase border border-ch-border text-ch-muted hover:text-ch-cream px-3 py-1.5 transition-colors disabled:opacity-50"
                >
                  {a.label}
                </button>
              ))}
              {puedeGestionar && r.estado === 'pendiente' && (
                <button
                  onClick={() => onEliminar(r.id)}
                  disabled={pending}
                  className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-subtle hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  Eliminar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
