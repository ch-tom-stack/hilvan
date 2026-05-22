'use client'

import { useState, useTransition } from 'react'
import { actualizarRol } from '@/app/actions/usuarios'
import type { Profile, Rol } from '@/types'

const ROLES: { value: Rol; label: string; desc: string }[] = [
  { value: 'admin',       label: 'Administrador', desc: 'Acceso total, incluyendo Financiero y Usuarios' },
  { value: 'productor',   label: 'Productor',     desc: 'Acceso completo excepto Financiero' },
  { value: 'colaborador', label: 'Colaborador',   desc: 'Dashboard, Rodaje y Rendiciones' },
  { value: 'cliente',     label: 'Cliente',       desc: 'Dashboard y Cotizaciones' },
]

const ROL_BADGE: Record<Rol, string> = {
  admin:       'bg-ch-green/10 text-ch-green border-ch-green/30',
  productor:   'bg-blue-500/10 text-blue-400 border-blue-400/30',
  colaborador: 'bg-amber-500/10 text-amber-400 border-amber-400/30',
  cliente:     'bg-purple-500/10 text-purple-400 border-purple-400/30',
}

interface Props {
  usuarios: Profile[]
  selfId: string
}

interface RowProps {
  usuario: Profile
  isSelf: boolean
}

function UsuarioRow({ usuario, isSelf }: RowProps) {
  const [rol, setRol]           = useState<Rol>(usuario.rol)
  const [editando, setEditando] = useState(false)
  const [pending, start]        = useTransition()
  const [msg, setMsg]           = useState('')

  const handleGuardar = (nuevoRol: Rol) => {
    setMsg('')
    start(async () => {
      const res = await actualizarRol(usuario.id, nuevoRol)
      if (res.error) {
        setMsg(res.error)
      } else {
        setRol(nuevoRol)
        setEditando(false)
      }
    })
  }

  const rolInfo = ROLES.find(r => r.value === rol)

  return (
    <div className="border border-ch-border bg-ch-surface/20 rounded-[2px] p-4 hover:bg-ch-surface/30 transition-colors">
      <div className="flex items-start justify-between gap-4 flex-wrap">

        {/* Info usuario */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-sm text-ch-cream font-medium truncate">{usuario.nombre}</p>
            {isSelf && (
              <span className="text-[9px] font-body tracking-[0.3em] uppercase text-ch-muted border border-ch-border px-1.5 py-0.5 rounded-[2px]">
                Tú
              </span>
            )}
          </div>
          <p className="text-xs text-ch-muted truncate">{usuario.email}</p>
          <p className="text-[10px] text-ch-subtle mt-1">
            Desde {new Date(usuario.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>

        {/* Rol + acción */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {editando ? (
            <div className="flex flex-col items-end gap-2">
              <div className="space-y-1">
                {ROLES.map(r => (
                  <button
                    key={r.value}
                    onClick={() => handleGuardar(r.value)}
                    disabled={pending}
                    className={`w-full text-left px-3 py-2 text-xs rounded-[2px] border transition-colors disabled:opacity-50 ${
                      r.value === rol
                        ? 'border-ch-green/50 bg-ch-green/10 text-ch-cream'
                        : 'border-ch-border text-ch-muted hover:border-ch-border/80 hover:text-ch-cream'
                    }`}
                  >
                    <span className="font-medium">{r.label}</span>
                    <span className="block text-[10px] text-ch-subtle mt-0.5">{r.desc}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setEditando(false); setMsg('') }}
                className="text-xs text-ch-muted hover:text-ch-cream transition-colors"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`text-xs font-body px-2.5 py-0.5 rounded-[2px] border ${ROL_BADGE[rol]}`}>
                {rolInfo?.label ?? rol}
              </span>
              {!isSelf && (
                <button
                  onClick={() => setEditando(true)}
                  className="text-xs text-ch-muted hover:text-ch-cream transition-colors"
                >
                  Cambiar
                </button>
              )}
            </div>
          )}
          {msg && <p className="text-xs text-red-400">{msg}</p>}
        </div>

      </div>
    </div>
  )
}

export default function GestorUsuarios({ usuarios, selfId }: Props) {
  // Agrupar por rol para visual clarity
  const admins       = usuarios.filter(u => u.rol === 'admin')
  const productores  = usuarios.filter(u => u.rol === 'productor')
  const colaboradors = usuarios.filter(u => u.rol === 'colaborador')
  const clientes     = usuarios.filter(u => u.rol === 'cliente')

  const grupos: { label: string; items: Profile[] }[] = [
    { label: 'Administradores',  items: admins },
    { label: 'Productores',      items: productores },
    { label: 'Colaboradores',    items: colaboradors },
    { label: 'Clientes',         items: clientes },
  ].filter(g => g.items.length > 0)

  return (
    <div className="space-y-8">

      {/* Leyenda roles */}
      <div className="border border-ch-border bg-ch-surface/20 p-4 rounded-[2px]">
        <p className="text-[9px] font-body tracking-[0.4em] uppercase text-ch-muted mb-3">Roles del sistema</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROLES.map(r => (
            <div key={r.value} className="flex items-start gap-2">
              <span className={`text-xs font-body px-2 py-0.5 rounded-[2px] border shrink-0 ${ROL_BADGE[r.value]}`}>
                {r.label}
              </span>
              <p className="text-xs text-ch-muted leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Lista agrupada */}
      {grupos.map(({ label, items }) => (
        <div key={label}>
          <p className="text-[9px] font-body tracking-[0.4em] uppercase text-ch-muted mb-3">{label}</p>
          <div className="space-y-2">
            {items.map(u => (
              <UsuarioRow key={u.id} usuario={u} isSelf={u.id === selfId} />
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-ch-subtle pt-2">
        Total: {usuarios.length} {usuarios.length === 1 ? 'usuario' : 'usuarios'}
      </p>
    </div>
  )
}
