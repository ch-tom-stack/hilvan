'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { definirClaveConLink } from '@/app/actions/clave-link'
import { toastError } from '@/lib/toast'

interface Props {
  token: string
  email?: string
  nombre?: string
  /** Viene del servidor: lib/clave-link usa `crypto` y no puede ir al cliente. */
  minimo: number
}

const INPUT = 'w-full bg-ch-dark border border-ch-border rounded-[2px] px-3 py-2 text-sm text-ch-cream placeholder:text-ch-subtle focus:outline-none focus:border-ch-green'

export default function DefinirClave({ token, email, nombre, minimo }: Props) {
  const router = useRouter()
  const [clave, setClave] = useState('')
  const [repetida, setRepetida] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<{ sesion: boolean } | null>(null)
  const [pending, start] = useTransition()

  const guardar = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (clave.length < minimo) { setError(`Mínimo ${minimo} caracteres`); return }
    if (clave !== repetida) { setError('Las contraseñas no coinciden'); return }

    start(async () => {
      try {
        const res = await definirClaveConLink(token, clave, repetida)
        if (res.error) { setError(res.error); return }
        setListo({ sesion: !!res.sesion })
        if (res.sesion) {
          setTimeout(() => { router.push('/dashboard'); router.refresh() }, 1200)
        }
      } catch {
        toastError('No se pudo guardar la contraseña. Revisa tu conexión e intenta de nuevo.')
      }
    })
  }

  return (
    <div className="min-h-screen bg-ch-black flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <p className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted mb-2">Hilván · Casa Hiedra</p>
        <h1 className="font-display italic text-4xl text-ch-cream leading-none mb-3">
          {listo ? 'Listo' : 'Define tu contraseña'}
        </h1>

        {listo ? (
          <div className="font-body">
            <p className="text-sm text-ch-muted mb-6">
              {listo.sesion ? 'Tu contraseña quedó guardada. Entrando…' : 'Tu contraseña quedó guardada. Ya puedes entrar con ella.'}
            </p>
            {!listo.sesion && (
              <a href="/login" className="inline-block text-xs bg-ch-green text-ch-black px-4 py-2 rounded-[2px] hover:bg-ch-green-light transition-colors font-medium">
                Ir al inicio de sesión
              </a>
            )}
          </div>
        ) : (
          <form onSubmit={guardar} className="font-body">
            <p className="text-sm text-ch-muted mb-6">
              {nombre ? `${nombre.split(' ')[0]}, elige` : 'Elige'} la contraseña con la que vas a entrar
              {email ? <> como <span className="text-ch-cream">{email}</span></> : null}.
            </p>

            {/* Para que el gestor de contraseñas la guarde con el usuario correcto */}
            {email && <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />}

            <label className="block text-xs text-ch-muted mb-1.5">Nueva contraseña</label>
            <input
              autoFocus
              type={ver ? 'text' : 'password'}
              autoComplete="new-password"
              value={clave}
              onChange={e => setClave(e.target.value)}
              className={`${INPUT} mb-4`}
            />

            <label className="block text-xs text-ch-muted mb-1.5">Repítela</label>
            <input
              type={ver ? 'text' : 'password'}
              autoComplete="new-password"
              value={repetida}
              onChange={e => setRepetida(e.target.value)}
              className={`${INPUT} mb-3`}
            />

            <label className="flex items-center gap-2 text-xs text-ch-muted mb-6 cursor-pointer select-none">
              <input type="checkbox" checked={ver} onChange={e => setVer(e.target.checked)} className="accent-ch-green" />
              Mostrar
            </label>

            <button
              type="submit"
              disabled={pending}
              className="w-full text-sm bg-ch-green text-ch-black px-4 py-2 rounded-[2px] hover:bg-ch-green-light disabled:opacity-50 transition-colors font-medium"
            >
              {pending ? 'Guardando…' : 'Guardar contraseña'}
            </button>

            {error && <p className="text-xs mt-3 text-red-400">{error}</p>}
            <p className="text-[11px] text-ch-subtle mt-6">Mínimo {minimo} caracteres. Este link sirve una sola vez.</p>
          </form>
        )}
      </div>
    </div>
  )
}
