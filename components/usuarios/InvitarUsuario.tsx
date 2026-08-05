'use client'

import { useState, useTransition } from 'react'
import { invitarUsuario } from '@/app/actions/usuarios'
import type { Rol } from '@/types'
import { momento } from '@/lib/momentos'

const ROLES: { value: Rol; label: string }[] = [
  { value: 'productor',    label: 'Productor' },
  { value: 'contabilidad', label: 'Contabilidad' },
  { value: 'colaborador',  label: 'Colaborador' },
  { value: 'cliente',      label: 'Cliente' },
  { value: 'admin',        label: 'Administrador' },
]

export default function InvitarUsuario() {
  const [abierto, setAbierto]         = useState(false)
  const [nombre, setNombre]           = useState('')
  const [email, setEmail]             = useState('')
  const [rol, setRol]                 = useState<Rol>('colaborador')
  const [error, setError]             = useState<string | null>(null)
  const [creado, setCreado]           = useState<{ nombre: string; email: string; password: string } | null>(null)
  const [copiado, setCopiado]         = useState(false)
  const [pending, start]              = useTransition()

  const reset = () => {
    setNombre('')
    setEmail('')
    setRol('colaborador')
    setError(null)
    setCreado(null)
    setCopiado(false)
  }

  const cerrar = () => {
    setAbierto(false)
    reset()
  }

  const copiar = async (texto: string) => {
    await navigator.clipboard.writeText(texto)
    momento('copiado')
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const handleSubmit = () => {
    setError(null)
    if (!nombre.trim()) { setError('El nombre es requerido'); return }
    if (!email.trim())  { setError('El email es requerido'); return }

    start(async () => {
      const res = await invitarUsuario(email.trim(), nombre.trim(), rol)
      if (res.error) {
        setError(res.error)
      } else if (res.password) {
        setCreado({ nombre: nombre.trim(), email: email.trim(), password: res.password })
      }
    })
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 text-sm text-ch-muted border border-ch-border hover:border-ch-green/50 hover:text-ch-cream px-4 py-2 rounded-[2px] transition-colors"
      >
        <span className="text-ch-green text-base leading-none">+</span>
        Agregar usuario
      </button>
    )
  }

  return (
    <div className="border border-ch-border bg-ch-surface/30 rounded-[2px] p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[9px] font-body tracking-[0.4em] uppercase text-ch-muted">
          Agregar usuario
        </h2>
        <button
          onClick={cerrar}
          className="text-xs text-ch-subtle hover:text-ch-muted transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Estado: usuario creado — mostrar contraseña temporal */}
      {creado ? (
        <div>
          <p className="text-sm text-ch-cream mb-1">
            Usuario <span className="text-ch-green">{creado.nombre}</span> creado correctamente.
          </p>
          <p className="text-xs text-ch-muted mb-4">
            Comparte esta contraseña temporal con {creado.nombre} (ej. por WhatsApp). Podrá cambiarla desde su perfil.
          </p>

          <div className="mb-2">
            <p className="text-[10px] text-ch-muted tracking-widest uppercase mb-1.5">Email</p>
            <p className="font-mono text-sm text-ch-cream">{creado.email}</p>
          </div>

          <div className="mb-5">
            <p className="text-[10px] text-ch-muted tracking-widest uppercase mb-1.5">Contraseña temporal</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 font-mono text-sm text-ch-cream bg-ch-dark border border-ch-border px-3 py-2 rounded-[2px] tracking-wider select-all">
                {creado.password}
              </code>
              <button
                onClick={() => copiar(creado.password)}
                className="text-xs px-3 py-2 border border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-green/50 rounded-[2px] transition-colors whitespace-nowrap"
              >
                {copiado ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          <button
            onClick={cerrar}
            className="text-xs bg-ch-green text-ch-black px-4 py-1.5 rounded-[2px] hover:bg-ch-green-light transition-colors font-medium"
          >
            Listo
          </button>
        </div>
      ) : (
        /* Estado: formulario */
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">

            {/* Nombre */}
            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Nombre</label>
              <input
                autoFocus
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="Juan Pérez"
                className="w-full bg-ch-dark border border-ch-border rounded-[2px] px-3 py-1.5 text-sm text-ch-cream placeholder:text-ch-subtle focus:outline-none focus:border-ch-green"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="juan@ejemplo.com"
                className="w-full bg-ch-dark border border-ch-border rounded-[2px] px-3 py-1.5 text-sm text-ch-cream placeholder:text-ch-subtle focus:outline-none focus:border-ch-green"
              />
            </div>

            {/* Rol */}
            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Rol</label>
              <select
                value={rol}
                onChange={e => setRol(e.target.value as Rol)}
                className="w-full bg-ch-dark border border-ch-border rounded-[2px] px-3 py-1.5 text-sm text-ch-cream focus:outline-none focus:border-ch-green appearance-none"
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSubmit}
              disabled={pending}
              className="text-xs bg-ch-green text-ch-black px-4 py-1.5 rounded-[2px] hover:bg-ch-green-light disabled:opacity-50 transition-colors font-medium"
            >
              {pending ? 'Creando…' : 'Crear usuario'}
            </button>
            <button
              onClick={cerrar}
              className="text-xs text-ch-muted hover:text-ch-cream transition-colors"
            >
              Cancelar
            </button>
          </div>

          {error && (
            <p className="text-xs mt-3 text-red-400">{error}</p>
          )}
        </>
      )}
    </div>
  )
}
