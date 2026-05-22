'use client'

import { useState, useTransition } from 'react'
import { invitarUsuario } from '@/app/actions/usuarios'
import type { Rol } from '@/types'

const ROLES: { value: Rol; label: string }[] = [
  { value: 'productor',   label: 'Productor' },
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'cliente',     label: 'Cliente' },
  { value: 'admin',       label: 'Administrador' },
]

export default function InvitarUsuario() {
  const [abierto, setAbierto]   = useState(false)
  const [nombre, setNombre]     = useState('')
  const [email, setEmail]       = useState('')
  const [rol, setRol]           = useState<Rol>('colaborador')
  const [msg, setMsg]           = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [pending, start]        = useTransition()

  const reset = () => {
    setNombre('')
    setEmail('')
    setRol('colaborador')
    setMsg(null)
  }

  const cerrar = () => {
    setAbierto(false)
    reset()
  }

  const handleSubmit = () => {
    setMsg(null)
    if (!nombre.trim()) { setMsg({ tipo: 'error', texto: 'El nombre es requerido' }); return }
    if (!email.trim())  { setMsg({ tipo: 'error', texto: 'El email es requerido' }); return }

    start(async () => {
      const res = await invitarUsuario(email.trim(), nombre.trim(), rol)
      if (res.error) {
        setMsg({ tipo: 'error', texto: res.error })
      } else {
        setMsg({ tipo: 'ok', texto: `Invitación enviada a ${email.trim()}` })
        setNombre('')
        setEmail('')
        setRol('colaborador')
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
        Invitar usuario
      </button>
    )
  }

  return (
    <div className="border border-ch-border bg-ch-surface/30 rounded-[2px] p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[9px] font-body tracking-[0.4em] uppercase text-ch-muted">
          Invitar nuevo usuario
        </h2>
        <button
          onClick={cerrar}
          className="text-xs text-ch-subtle hover:text-ch-muted transition-colors"
        >
          ✕
        </button>
      </div>

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
          {pending ? 'Enviando…' : 'Enviar invitación'}
        </button>
        <button
          onClick={cerrar}
          className="text-xs text-ch-muted hover:text-ch-cream transition-colors"
        >
          Cancelar
        </button>
      </div>

      {msg && (
        <p className={`text-xs mt-3 ${msg.tipo === 'ok' ? 'text-ch-green' : 'text-red-400'}`}>
          {msg.tipo === 'ok' ? '✓ ' : ''}{msg.texto}
        </p>
      )}

      {msg?.tipo === 'ok' && (
        <p className="text-[10px] text-ch-subtle mt-1">
          El usuario recibirá un email con el link de acceso. Podrá establecer su contraseña al entrar.
        </p>
      )}
    </div>
  )
}
