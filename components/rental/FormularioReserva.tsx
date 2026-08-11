'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { crearRentalReserva, verificarDisponibilidad } from '@/app/actions/rental'
import { toastOk, toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import type { Equipo, Maleta, Cliente } from '@/types'
import { formatCLP } from '@/types'
import { parseFechaLocal } from '@/lib/fechas'

interface Props {
  equipos: (Equipo & { categoria?: { nombre: string } })[]
  maletas: Maleta[]
  clientes: Cliente[]
  defaultEquipoId?: string | null
  defaultMaletaId?: string | null
  esAdmin: boolean
}

type TipoItem = 'equipo' | 'maleta'

interface Disponibilidad {
  disponible: boolean
  conflictos: { fecha_inicio: string; fecha_fin: string }[]
  stockTotal?: number
  stockDisponible?: number
}

export default function FormularioReserva({
  equipos, maletas, clientes, defaultEquipoId, defaultMaletaId, esAdmin,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [tipo, setTipo] = useState<TipoItem>(defaultMaletaId ? 'maleta' : 'equipo')
  const [equipoId, setEquipoId] = useState(defaultEquipoId ?? '')
  const [maletaId, setMaletaId] = useState(defaultMaletaId ?? '')
  const [clienteId, setClienteId] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad | null>(null)
  const [checkingDisp, setCheckingDisp] = useState(false)

  const selectedEquipo = equipos.find(e => e.id === equipoId)
  const selectedMaleta = maletas.find(m => m.id === maletaId)

  // Verificar disponibilidad al cambiar item o fechas
  useEffect(() => {
    const id = tipo === 'equipo' ? equipoId : maletaId
    if (!id || !fechaInicio || !fechaFin || fechaInicio >= fechaFin) {
      setDisponibilidad(null)
      return
    }
    setCheckingDisp(true)
    setDisponibilidad(null)
    const t = setTimeout(async () => {
      const r = await verificarDisponibilidad(
        tipo === 'equipo' ? id : null,
        tipo === 'maleta' ? id : null,
        fechaInicio,
        fechaFin,
      )
      setDisponibilidad(r)
      setCheckingDisp(false)
    }, 600)
    return () => clearTimeout(t)
  }, [tipo, equipoId, maletaId, fechaInicio, fechaFin])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const id = tipo === 'equipo' ? equipoId : maletaId
    if (!id) { setError('Selecciona un equipo o maleta.'); return }
    if (!fechaInicio || !fechaFin) { setError('Las fechas son obligatorias.'); return }
    if (fechaInicio >= fechaFin) { setError('La fecha de fin debe ser posterior a la de inicio.'); return }

    startTransition(async () => {
      try {
        const r = await crearRentalReserva({
          equipo_id:  tipo === 'equipo' ? id : null,
          maleta_id:  tipo === 'maleta' ? id : null,
          cliente_id: clienteId || null,
          fecha_inicio: fechaInicio,
          fecha_fin:    fechaFin,
          notas:        notas || null,
        })
        if (r.ok) {
          toastOk('Solicitud enviada correctamente')
          momento('rental.solicitada', { mensaje: '' })
          router.push('/rental/reservas')
        } else {
          setError(r.error ?? 'Error al enviar la solicitud')
          toastError(r.error ?? 'Error al enviar')
          momento('error', { mensaje: r.error ?? 'Error al enviar' })
        }
      } catch (e: any) {
        const msg = e?.message ?? 'Error inesperado'
        setError(msg)
        toastError(msg)
        momento('error', { mensaje: msg })
      }
    })
  }

  const hoy = new Date().toISOString().split('T')[0]

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Tipo de ítem */}
        <div>
          <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-2">
            Tipo de ítem
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setTipo('equipo'); setMaletaId('') }}
              className={`px-5 py-2.5 font-body text-[10px] tracking-[0.35em] uppercase border transition-colors ${
                tipo === 'equipo'
                  ? 'border-ch-green bg-ch-surface text-ch-cream'
                  : 'border-ch-border text-ch-muted hover:text-ch-cream'
              }`}
            >
              Equipo
            </button>
            <button
              type="button"
              onClick={() => { setTipo('maleta'); setEquipoId('') }}
              className={`px-5 py-2.5 font-body text-[10px] tracking-[0.35em] uppercase border transition-colors ${
                tipo === 'maleta'
                  ? 'border-ch-green bg-ch-surface text-ch-cream'
                  : 'border-ch-border text-ch-muted hover:text-ch-cream'
              }`}
            >
              Maleta
            </button>
          </div>
        </div>

        {/* Selector de ítem */}
        <div>
          <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">
            {tipo === 'equipo' ? 'Equipo *' : 'Maleta *'}
          </label>
          {tipo === 'equipo' ? (
            <select
              value={equipoId}
              onChange={e => setEquipoId(e.target.value)}
              required
              className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm
                         px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]"
            >
              <option value="">— Seleccionar equipo —</option>
              {equipos.map(eq => (
                <option key={eq.id} value={eq.id}>
                  {eq.codigo} · {eq.nombre}
                  {eq.categoria?.nombre ? ` (${eq.categoria.nombre})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={maletaId}
              onChange={e => setMaletaId(e.target.value)}
              required
              className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm
                         px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]"
            >
              <option value="">— Seleccionar maleta —</option>
              {maletas.map(m => (
                <option key={m.id} value={m.id}>
                  {m.codigo} · {m.nombre}
                </option>
              ))}
            </select>
          )}

          {/* Preview del ítem seleccionado */}
          {tipo === 'equipo' && selectedEquipo && (
            <div className="mt-2 px-3 py-2 bg-ch-surface/40 border border-ch-border/50">
              <p className="font-body text-xs text-ch-muted">
                {selectedEquipo.nombre}
                {selectedEquipo.precio_jornada && selectedEquipo.precio_jornada > 0
                  ? ` · ${formatCLP(selectedEquipo.precio_jornada)} / jornada`
                  : ''}
                {selectedEquipo.cantidad != null && selectedEquipo.cantidad > 1
                  ? ` · Stock: ${selectedEquipo.cantidad} unidades`
                  : ''}
              </p>
            </div>
          )}
          {tipo === 'maleta' && selectedMaleta && (
            <div className="mt-2 px-3 py-2 bg-ch-surface/40 border border-ch-border/50">
              <p className="font-body text-xs text-ch-muted">{selectedMaleta.nombre}</p>
            </div>
          )}
        </div>

        {/* Fechas */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">
              Fecha inicio *
            </label>
            <input
              type="date"
              value={fechaInicio}
              min={hoy}
              onChange={e => setFechaInicio(e.target.value)}
              required
              className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm
                         px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]"
            />
          </div>
          <div>
            <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">
              Fecha fin *
            </label>
            <input
              type="date"
              value={fechaFin}
              min={fechaInicio || hoy}
              onChange={e => setFechaFin(e.target.value)}
              required
              className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm
                         px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]"
            />
          </div>
        </div>

        {/* Disponibilidad */}
        {(checkingDisp || disponibilidad) && (
          <div>
            {checkingDisp ? (
              <div className="px-4 py-3 border border-ch-border/30 bg-ch-surface/20">
                <p className="text-ch-subtle text-xs font-body">Verificando disponibilidad…</p>
              </div>
            ) : disponibilidad && (
              disponibilidad.disponible ? (
                <div className="border border-ch-green/30 bg-ch-green/5 px-4 py-3">
                  <p className="text-ch-green text-xs font-body">
                    ✓ Disponible en esas fechas
                    {disponibilidad.stockTotal && disponibilidad.stockTotal > 1
                      ? ` · ${disponibilidad.stockDisponible} de ${disponibilidad.stockTotal} unidades libres`
                      : ''}
                  </p>
                </div>
              ) : (
                <div className="border border-red-900/50 bg-red-950/20 px-4 py-3">
                  <p className="text-red-400 text-xs font-body mb-1">
                    ✗ {disponibilidad.stockTotal && disponibilidad.stockTotal > 1
                      ? `Sin stock disponible (${disponibilidad.stockDisponible} de ${disponibilidad.stockTotal} libres)`
                      : 'Hay reservas activas en esas fechas'}
                  </p>
                  {disponibilidad.conflictos.length > 0 && (
                    <ul className="text-red-400/70 text-[10px] font-body space-y-0.5">
                      {disponibilidad.conflictos.map((c, i) => (
                        <li key={i}>
                          Reservado del {parseFechaLocal(c.fecha_inicio).toLocaleDateString('es-CL')} al {parseFechaLocal(c.fecha_fin).toLocaleDateString('es-CL')}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-ch-subtle text-[10px] font-body mt-1">Puedes igualmente enviar la solicitud.</p>
                </div>
              )
            )}
          </div>
        )}

        {/* Cliente (solo admin) */}
        {esAdmin && clientes.length > 0 && (
          <div>
            <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">
              Cliente (opcional)
            </label>
            <select
              value={clienteId}
              onChange={e => setClienteId(e.target.value)}
              className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm
                         px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]"
            >
              <option value="">— Mis datos por defecto —</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre}{c.empresa ? ` · ${c.empresa}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Notas */}
        <div>
          <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">
            Notas / contexto del uso
          </label>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Ej: Para rodaje Falabella, necesito con cage y monitor…"
            rows={3}
            className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm
                       px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]
                       placeholder:text-ch-subtle resize-none"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="border border-red-900/50 bg-red-950/40 px-4 py-3">
            <p className="text-red-400 text-xs font-body">{error}</p>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 border border-ch-border text-ch-muted hover:text-ch-cream font-body
                       text-[9px] tracking-[0.35em] uppercase py-3 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium
                       text-[9px] tracking-[0.35em] uppercase py-3 transition-colors disabled:opacity-50"
          >
            {pending ? 'Enviando…' : 'Enviar solicitud →'}
          </button>
        </div>

      </form>
    </div>
  )
}
