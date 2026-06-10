'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearRentalCotizacion } from '@/app/actions/rental'
import { toastOk, toastError } from '@/lib/toast'
import type { Cliente } from '@/types'
import { parseFechaLocal } from '@/lib/fechas'

interface Props {
  clientes: Cliente[]
  reservaId: string | null
  reservaData: {
    id: string
    fecha_inicio: string
    fecha_fin: string
    cliente_id?: string | null
    equipo?: { id: string; codigo: string; nombre: string; precio_jornada?: number } | null
    maleta?: { id: string; codigo: string; nombre: string } | null
  } | null
}

export default function NuevaCotizacionForm({ clientes, reservaId, reservaData }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [clienteId, setClienteId] = useState(reservaData?.cliente_id ?? '')
  const [clienteNombreLibre, setClienteNombreLibre] = useState('')
  const [clienteEmailLibre, setClienteEmailLibre] = useState('')
  const [conIva, setConIva] = useState(true)
  const [notasInternas, setNotasInternas] = useState('')
  const [notasCliente, setNotasCliente] = useState('')
  const [error, setError] = useState('')
  const [modoCliente, setModoCliente] = useState<'lista' | 'libre'>(
    reservaData?.cliente_id ? 'lista' : 'lista'
  )

  const item = reservaData?.equipo ?? reservaData?.maleta

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (modoCliente === 'lista' && !clienteId && !clienteNombreLibre) {
      setError('Selecciona un cliente o ingresa un nombre.')
      return
    }

    startTransition(async () => {
      const r = await crearRentalCotizacion({
        reserva_id:           reservaId,
        cliente_id:           modoCliente === 'lista' ? (clienteId || null) : null,
        cliente_nombre_libre: modoCliente === 'libre' ? (clienteNombreLibre || null) : null,
        cliente_email_libre:  modoCliente === 'libre' ? (clienteEmailLibre || null) : null,
        con_iva:              conIva,
        notas_internas:       notasInternas || null,
        notas_cliente:        notasCliente  || null,
      })

      if (r.ok && r.id) {
        toastOk('Cotización creada')
        router.push(`/rental/cotizaciones/${r.id}`)
      } else {
        const msg = r.error ?? 'Error al crear la cotización'
        setError(msg)
        toastError(msg)
      }
    })
  }

  return (
    <div className="max-w-2xl">

      {/* Info reserva vinculada */}
      {reservaData && item && (
        <div className="border border-ch-border bg-ch-surface/30 px-4 py-3 mb-8">
          <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">
            Reserva vinculada
          </p>
          <p className="font-body text-sm text-ch-cream">
            {item.codigo} · {item.nombre}
          </p>
          <p className="font-body text-xs text-ch-muted">
            {parseFechaLocal(reservaData.fecha_inicio).toLocaleDateString('es-CL')}
            {' → '}
            {parseFechaLocal(reservaData.fecha_fin).toLocaleDateString('es-CL')}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Cliente */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-[10px] tracking-widest uppercase text-ch-muted">
              Cliente
            </label>
            <div className="flex gap-1 ml-auto">
              <button
                type="button"
                onClick={() => setModoCliente('lista')}
                className={`text-[9px] tracking-widest uppercase px-2 py-1 border transition-colors ${
                  modoCliente === 'lista'
                    ? 'border-ch-green text-ch-cream bg-ch-surface'
                    : 'border-ch-border text-ch-subtle hover:text-ch-muted'
                }`}
              >
                De lista
              </button>
              <button
                type="button"
                onClick={() => setModoCliente('libre')}
                className={`text-[9px] tracking-widest uppercase px-2 py-1 border transition-colors ${
                  modoCliente === 'libre'
                    ? 'border-ch-green text-ch-cream bg-ch-surface'
                    : 'border-ch-border text-ch-subtle hover:text-ch-muted'
                }`}
              >
                Libre
              </button>
            </div>
          </div>

          {modoCliente === 'lista' ? (
            <select
              value={clienteId}
              onChange={e => setClienteId(e.target.value)}
              className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm
                         px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]"
            >
              <option value="">— Seleccionar cliente —</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre}{c.empresa ? ` · ${c.empresa}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Nombre del cliente"
                value={clienteNombreLibre}
                onChange={e => setClienteNombreLibre(e.target.value)}
                className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm
                           px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]
                           placeholder:text-ch-subtle"
              />
              <input
                type="email"
                placeholder="Email (opcional)"
                value={clienteEmailLibre}
                onChange={e => setClienteEmailLibre(e.target.value)}
                className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm
                           px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]
                           placeholder:text-ch-subtle"
              />
            </div>
          )}
        </div>

        {/* IVA */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={conIva}
              onChange={e => setConIva(e.target.checked)}
              className="w-4 h-4 accent-[#7a9e7e]"
            />
            <span className="font-body text-sm text-ch-cream">Incluir IVA (19%)</span>
          </label>
        </div>

        {/* Notas internas */}
        <div>
          <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">
            Notas internas
          </label>
          <textarea
            value={notasInternas}
            onChange={e => setNotasInternas(e.target.value)}
            placeholder="Solo visibles para el equipo…"
            rows={2}
            className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm
                       px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]
                       placeholder:text-ch-subtle resize-none"
          />
        </div>

        {/* Notas para el cliente */}
        <div>
          <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">
            Notas para el cliente
          </label>
          <textarea
            value={notasCliente}
            onChange={e => setNotasCliente(e.target.value)}
            placeholder="Condiciones, instrucciones de retiro…"
            rows={2}
            className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm
                       px-3 py-2 focus:outline-none focus:border-ch-green rounded-[2px]
                       placeholder:text-ch-subtle resize-none"
          />
        </div>

        {error && (
          <div className="border border-red-900/50 bg-red-950/40 px-4 py-3">
            <p className="text-red-400 text-xs font-body">{error}</p>
          </div>
        )}

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
            {pending ? 'Creando…' : 'Crear cotización →'}
          </button>
        </div>

      </form>
    </div>
  )
}
