'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { actualizarNombre, cambiarPassword } from '@/app/actions/perfil'
import { logout } from '@/app/actions/auth'
import PreferenciasFeedback from './PreferenciasFeedback'
import type { Profile, Rol } from '@/types'
import { momento } from '@/lib/momentos'

const ROL_LABELS: Record<Rol, string> = {
  admin:         'Administrador',
  productor:     'Productor',
  colaborador:   'Colaborador',
  cliente:       'Cliente',
  contabilidad:  'Contabilidad',
}

const TODOS_LOS_MODULOS = [
  'Dashboard',
  'Equipos',
  'Cotizaciones',
  'Rodaje',
  'Colaboradores',
  'Rendiciones',
  'Clientes',
  'Financiero',
] as const

const PERMISOS: Record<Rol, readonly string[]> = {
  admin:        TODOS_LOS_MODULOS,
  productor:    ['Dashboard', 'Equipos', 'Cotizaciones', 'Rodaje', 'Colaboradores', 'Rendiciones', 'Clientes'],
  colaborador:  ['Dashboard', 'Rodaje', 'Rendiciones'],
  cliente:      ['Dashboard', 'Cotizaciones'],
  contabilidad: ['Dashboard', 'Cotizaciones', 'Rendiciones', 'Financiero'],
}

interface Props {
  profile: Profile
  email: string
}

export default function PerfilPage({ profile, email }: Props) {
  const [nombre, setNombre]             = useState(profile.nombre)
  const [editandoNombre, setEditando]   = useState(false)
  const [nombreInput, setNombreInput]   = useState(profile.nombre)
  const [nombreMsg, setNombreMsg]       = useState('')

  const [newPwd, setNewPwd]             = useState('')
  const [confirmPwd, setConfirmPwd]     = useState('')
  const [pwdMsg, setPwdMsg]             = useState('')
  // dispara ch-shake en los campos cuando la validación falla
  const [pwdError, setPwdError]         = useState(0)

  const [isPending, startTransition]    = useTransition()

  const rolLabel = ROL_LABELS[profile.rol] ?? profile.rol
  const permisos = PERMISOS[profile.rol] ?? []

  // ── Nombre ──────────────────────────────────────────────────
  const handleGuardarNombre = () => {
    setNombreMsg('')
    startTransition(async () => {
      const res = await actualizarNombre(nombreInput)
      if (res.error) {
        setNombreMsg(res.error)
      } else {
        setNombre(nombreInput)
        setEditando(false)
      }
    })
  }

  const cancelarNombre = () => {
    setEditando(false)
    setNombreInput(nombre)
    setNombreMsg('')
  }

  // ── Password ─────────────────────────────────────────────────
  const handleCambiarPassword = () => {
    setPwdMsg('')
    if (newPwd.length < 8)    { setPwdMsg('Mínimo 8 caracteres'); setPwdError(n => n + 1); momento('atencion', { mensaje: 'Mínimo 8 caracteres' }); return }
    if (newPwd !== confirmPwd) { setPwdMsg('Las contraseñas no coinciden'); setPwdError(n => n + 1); momento('atencion', { mensaje: 'Las contraseñas no coinciden' }); return }

    startTransition(async () => {
      const res = await cambiarPassword(newPwd)
      if (res.error) {
        setPwdMsg(res.error)
      } else {
        setNewPwd('')
        setConfirmPwd('')
        setPwdMsg('✓ Contraseña actualizada')
      }
    })
  }

  // ── UI ───────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-2xl">

      {/* Header */}
      <div className="mb-10">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">Tu cuenta</p>
        <h1 className="font-display italic text-5xl text-ch-cream leading-none">{nombre}</h1>
      </div>

      <div className="space-y-5">

        {/* ── Datos básicos ── */}
        <section className="border border-ch-border bg-ch-surface/30 p-6">
          <h2 className="text-[9px] font-body tracking-[0.4em] uppercase text-ch-muted mb-5">Datos de la cuenta</h2>
          <div className="space-y-5">

            {/* Nombre */}
            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Nombre</label>
              {editandoNombre ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    value={nombreInput}
                    onChange={e => setNombreInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  handleGuardarNombre()
                      if (e.key === 'Escape') cancelarNombre()
                    }}
                    className="bg-ch-dark border border-ch-border rounded-[2px] px-3 py-1.5 text-sm text-ch-cream focus:outline-none focus:border-ch-green w-64"
                  />
                  <button
                    onClick={handleGuardarNombre}
                    disabled={isPending}
                    className="text-xs bg-ch-green text-ch-black px-3 py-1.5 rounded-[2px] hover:bg-ch-green-light disabled:opacity-50 transition-colors"
                  >
                    {isPending ? '…' : 'Guardar'}
                  </button>
                  <button onClick={cancelarNombre} className="text-xs text-ch-muted hover:text-ch-cream transition-colors">
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-ch-cream">{nombre}</p>
                  <button
                    onClick={() => { setEditando(true); setNombreInput(nombre) }}
                    className="text-xs text-ch-muted hover:text-ch-cream transition-colors"
                  >
                    Editar
                  </button>
                </div>
              )}
              {nombreMsg && <p className="text-xs text-red-400 mt-1">{nombreMsg}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Email</label>
              <p className="text-sm text-ch-cream">{email}</p>
            </div>

            {/* Rol */}
            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Rol</label>
              <span className="inline-block text-xs font-body text-ch-cream bg-ch-surface border border-ch-border px-2.5 py-0.5 rounded-[2px]">
                {rolLabel}
              </span>
            </div>

            {/* Miembro desde */}
            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Miembro desde</label>
              <p className="text-sm text-ch-muted">
                {new Date(profile.created_at).toLocaleDateString('es-CL', {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}
              </p>
            </div>

          </div>
        </section>

        {/* ── Acceso y permisos ── */}
        <section className="border border-ch-border bg-ch-surface/30 p-6">
          <h2 className="text-[9px] font-body tracking-[0.4em] uppercase text-ch-muted mb-1.5">Acceso y permisos</h2>
          <p className="text-xs text-ch-muted mb-4">Módulos disponibles para el rol <span className="text-ch-cream">{rolLabel}</span></p>
          <div className="flex flex-wrap gap-2">
            {TODOS_LOS_MODULOS.map(mod => {
              const tiene = permisos.includes(mod)
              return (
                <span
                  key={mod}
                  className={`text-xs font-body px-3 py-1 rounded-[2px] border transition-colors ${
                    tiene
                      ? 'border-ch-green/40 text-ch-green bg-ch-green/5'
                      : 'border-ch-border text-ch-subtle line-through'
                  }`}
                >
                  {mod}
                </span>
              )
            })}
          </div>
        </section>

        {/* ── Seguridad ── */}
        <section className="border border-ch-border bg-ch-surface/30 p-6">
          <h2 className="text-[9px] font-body tracking-[0.4em] uppercase text-ch-muted mb-5">Seguridad</h2>
          <div key={pwdError} className={`space-y-3 max-w-xs ${pwdError ? 'ch-shake' : ''}`}>
            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Nueva contraseña</label>
              <input
                type="password"
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full bg-ch-dark border border-ch-border rounded-[2px] px-3 py-1.5 text-sm text-ch-cream placeholder:text-ch-subtle focus:outline-none focus:border-ch-green"
              />
            </div>
            <div>
              <label className="block text-xs text-ch-muted mb-1.5">Confirmar contraseña</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder="Repite la contraseña"
                onKeyDown={e => e.key === 'Enter' && handleCambiarPassword()}
                className="w-full bg-ch-dark border border-ch-border rounded-[2px] px-3 py-1.5 text-sm text-ch-cream placeholder:text-ch-subtle focus:outline-none focus:border-ch-green"
              />
            </div>
            {pwdMsg && (
              <p className={`text-xs ${pwdMsg.startsWith('✓') ? 'text-ch-green' : 'text-red-400'}`}>
                {pwdMsg}
              </p>
            )}
            <button
              onClick={handleCambiarPassword}
              disabled={isPending || !newPwd || !confirmPwd}
              className="text-xs bg-ch-surface border border-ch-border text-ch-cream px-4 py-1.5 rounded-[2px] hover:bg-ch-dark transition-colors disabled:opacity-40"
            >
              {isPending ? 'Actualizando…' : 'Actualizar contraseña'}
            </button>
          </div>
        </section>

        {/* ── Sonido y movimiento ── */}
        <PreferenciasFeedback />

        {/* ── Notificaciones (placeholder) ── */}
        <section className="border border-ch-border border-dashed bg-ch-surface/10 p-6 select-none">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[9px] font-body tracking-[0.4em] uppercase text-ch-subtle">Notificaciones</h2>
            <span className="text-[8px] font-body tracking-[0.3em] uppercase text-ch-subtle">Próximamente</span>
          </div>
          <p className="text-xs text-ch-subtle">Alertas de cotizaciones, cambios de estado y avisos del equipo.</p>
        </section>

        {/* ── Admin: gestión de usuarios ── */}
        {profile.rol === 'admin' && (
          <section className="border border-ch-border bg-ch-surface/30 p-6">
            <h2 className="text-[9px] font-body tracking-[0.4em] uppercase text-ch-muted mb-3">Administración</h2>
            <Link
              href="/usuarios"
              className="inline-flex items-center gap-2 text-sm text-ch-cream hover:text-ch-green transition-colors group"
            >
              Gestionar usuarios y roles
              <span className="text-ch-muted group-hover:text-ch-green transition-colors">→</span>
            </Link>
          </section>
        )}

        {/* ── Cerrar sesión ── */}
        <div className="pt-2">
          <form action={logout} onSubmit={() => momento('sesion.fin')}>
            <button
              type="submit"
              className="text-xs font-body text-ch-muted hover:text-red-400 transition-colors border border-ch-border hover:border-red-400/40 px-4 py-2 rounded-[2px]"
            >
              Cerrar sesión
            </button>
          </form>
        </div>

      </div>

      <div className="pt-12 pb-4 flex justify-center">
        <img src="/logos/logo-horizontal-negro.png" alt="" className="h-5 w-auto opacity-20" />
      </div>
    </div>
  )
}
