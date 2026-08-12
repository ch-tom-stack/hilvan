'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { crearCotizacion, crearCliente } from '@/app/actions/cotizaciones'
import type { Cliente, Proyecto } from '@/types'

interface Props {
  clientes: Cliente[]
  proyectos: Proyecto[]
}

export default function NuevaCotizacionForm({ clientes, proyectos }: Props) {
  const [isPending, startTransition] = useTransition()
  const [clienteMode, setClienteMode] = useState<'existente' | 'nuevo' | 'libre'>('libre')
  const [clienteId, setClienteId] = useState('')
  const [clienteNombreLibre, setClienteNombreLibre] = useState('')
  const [proyectoId, setProyectoId] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')

  // Nuevo cliente inline
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('')
  const [nuevoClienteEmpresa, setNuevoClienteEmpresa] = useState('')
  const [nuevoClienteEmail, setNuevoClienteEmail] = useState('')
  const [creandoCliente, setCreandoCliente] = useState(false)

  async function handleCrearCliente() {
    if (!nuevoClienteNombre.trim()) return
    setCreandoCliente(true)
    try {
      const fd = new FormData()
      fd.append('nombre', nuevoClienteNombre)
      fd.append('empresa', nuevoClienteEmpresa)
      fd.append('email', nuevoClienteEmail)
      const nuevo = await crearCliente(fd)
      setClienteId(nuevo.id)
      setClienteMode('existente')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCreandoCliente(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) {
      setError('El nombre de la cotización es obligatorio.')
      return
    }
    setError('')
    const fd = new FormData()
    fd.append('nombre', nombre)
    if (clienteMode === 'existente' && clienteId) fd.append('cliente_id', clienteId)
    if (clienteMode === 'libre' && clienteNombreLibre) fd.append('cliente_nombre_libre', clienteNombreLibre)
    if (proyectoId) fd.append('proyecto_id', proyectoId)

    startTransition(() => {
      crearCotizacion(fd)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Nombre */}
      <div>
        <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-2">
          Nombre de la cotización *
        </label>
        <input
          type="text"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="ej: Campaña verano Falabella"
          className="w-full bg-ch-dark border border-ch-border rounded px-4 py-3 font-body text-sm text-ch-cream placeholder-ch-muted/40 focus:outline-none focus:border-ch-cream/40 transition-colors"
          required
        />
      </div>

      {/* Cliente */}
      <div>
        <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-2">
          Cliente
        </label>
        {/* Tabs modo */}
        <div className="flex gap-1 mb-3">
          {(['libre', 'existente', 'nuevo'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setClienteMode(mode)}
              className={`px-3 py-1.5 rounded font-body text-xs transition-colors ${
                clienteMode === mode
                  ? 'bg-ch-cream text-ch-dark font-medium'
                  : 'bg-ch-border/20 text-ch-muted hover:text-ch-cream'
              } ch-press`}
            >
              {mode === 'libre' ? 'Texto libre' : mode === 'existente' ? 'De la BD' : 'Crear nuevo'}
            </button>
          ))}
        </div>

        {clienteMode === 'libre' && (
          <input
            type="text"
            value={clienteNombreLibre}
            onChange={e => setClienteNombreLibre(e.target.value)}
            placeholder="Nombre del cliente o agencia"
            className="w-full bg-ch-dark border border-ch-border rounded px-4 py-3 font-body text-sm text-ch-cream placeholder-ch-muted/40 focus:outline-none focus:border-ch-cream/40 transition-colors"
          />
        )}

        {clienteMode === 'existente' && (
          <select
            value={clienteId}
            onChange={e => setClienteId(e.target.value)}
            className="w-full bg-ch-dark border border-ch-border rounded px-4 py-3 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40 transition-colors"
          >
            <option value="">— Sin cliente —</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>
                {c.empresa ? `${c.nombre} · ${c.empresa}` : c.nombre}
              </option>
            ))}
          </select>
        )}

        {clienteMode === 'nuevo' && (
          <div className="space-y-3 p-4 border border-ch-border rounded">
            <input
              type="text"
              value={nuevoClienteNombre}
              onChange={e => setNuevoClienteNombre(e.target.value)}
              placeholder="Nombre *"
              className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream placeholder-ch-muted/40 focus:outline-none focus:border-ch-cream/40"
            />
            <input
              type="text"
              value={nuevoClienteEmpresa}
              onChange={e => setNuevoClienteEmpresa(e.target.value)}
              placeholder="Empresa"
              className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream placeholder-ch-muted/40 focus:outline-none focus:border-ch-cream/40"
            />
            <input
              type="email"
              value={nuevoClienteEmail}
              onChange={e => setNuevoClienteEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream placeholder-ch-muted/40 focus:outline-none focus:border-ch-cream/40"
            />
            <button
              type="button"
              onClick={handleCrearCliente}
              disabled={creandoCliente || !nuevoClienteNombre.trim()}
              className="px-4 py-2 bg-ch-cream/10 border border-ch-cream/20 text-ch-cream font-body text-xs rounded hover:bg-ch-cream/20 transition-colors disabled:opacity-40 ch-press"
            >
              {creandoCliente ? 'Guardando...' : 'Guardar cliente'}
            </button>
          </div>
        )}
      </div>

      {/* Proyecto */}
      <div>
        <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-2">
          Proyecto <span className="normal-case text-ch-muted/60">(opcional)</span>
        </label>
        <select
          value={proyectoId}
          onChange={e => setProyectoId(e.target.value)}
          className="w-full bg-ch-dark border border-ch-border rounded px-4 py-3 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40 transition-colors"
        >
          <option value="">— Sin proyecto —</option>
          {proyectos.map(p => (
            <option key={p.id} value={p.id}>
              {p.nombre}{p.cliente ? ` · ${p.cliente.nombre}` : ''}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="font-body text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Submit */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 py-3 bg-ch-cream text-ch-dark font-body text-sm font-medium rounded hover:bg-ch-cream/90 transition-colors disabled:opacity-50 ch-press"
        >
          {isPending ? 'Creando...' : 'Crear cotización'}
        </button>
        <Link
          href="/cotizaciones"
          className="px-6 py-3 border border-ch-border text-ch-muted font-body text-sm rounded hover:text-ch-cream hover:border-ch-cream/40 transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
