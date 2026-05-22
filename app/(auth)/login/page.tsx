'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const form = new FormData(e.currentTarget)

    const { error } = await supabase.auth.signInWithPassword({
      email: form.get('email') as string,
      password: form.get('password') as string,
    })

    if (error) {
      setError('Credenciales incorrectas. Verifica tu email y contraseña.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-ch-black flex">
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-16 relative overflow-hidden border-r border-ch-border"
        style={{ background: 'linear-gradient(160deg, #1a1a18 0%, #111110 100%)' }}
      >
        <svg className="absolute bottom-0 left-0 opacity-[0.06] pointer-events-none" width="420" height="420" viewBox="0 0 420 420" fill="none">
          <path d="M60 400 Q90 340 70 280 Q50 220 90 160 Q130 100 110 40" stroke="#7a9e7e" strokeWidth="2.5" fill="none"/>
          <ellipse cx="70" cy="280" rx="36" ry="24" fill="#7a9e7e" transform="rotate(-35 70 280)"/>
          <ellipse cx="90" cy="160" rx="40" ry="26" fill="#7a9e7e" transform="rotate(22 90 160)"/>
          <ellipse cx="110" cy="40" rx="30" ry="20" fill="#7a9e7e" transform="rotate(-12 110 40)"/>
          <path d="M170 400 Q200 320 185 250 Q170 180 210 110" stroke="#7a9e7e" strokeWidth="2" fill="none" opacity="0.7"/>
          <ellipse cx="185" cy="250" rx="32" ry="21" fill="#7a9e7e" transform="rotate(28 185 250)" opacity="0.7"/>
          <ellipse cx="210" cy="110" rx="36" ry="23" fill="#7a9e7e" transform="rotate(-18 210 110)" opacity="0.7"/>
          <path d="M280 400 Q310 330 295 260" stroke="#7a9e7e" strokeWidth="1.5" fill="none" opacity="0.4"/>
          <ellipse cx="295" cy="260" rx="28" ry="18" fill="#7a9e7e" transform="rotate(15 295 260)" opacity="0.4"/>
        </svg>
        <p className="text-ch-muted text-[10px] font-body tracking-[0.5em] uppercase relative z-10">Casa Hiedra</p>
        <div className="relative z-10">
          <h1 className="font-display italic text-[7rem] leading-none text-ch-cream mb-6 tracking-tight">Hilván</h1>
          <p className="text-ch-muted font-body text-sm leading-relaxed max-w-[260px]">Plataforma de gestión interna para producción audiovisual.</p>
        </div>
        <p className="text-[#2e2e2b] text-[10px] font-body tracking-wider relative z-10">© {new Date().getFullYear()} Casa Hiedra. Santiago de Chile.</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-ch-dark">
        <div className="w-full max-w-[340px]">
          <div className="mb-10 lg:hidden">
            <p className="text-ch-muted text-[10px] font-body tracking-[0.5em] uppercase mb-2">Casa Hiedra</p>
            <h1 className="font-display italic text-5xl text-ch-cream">Hilván</h1>
          </div>
          <div className="mb-8">
            <h2 className="text-ch-cream font-body text-xl font-light mb-1">Acceso</h2>
            <p className="text-ch-muted font-body text-sm">Ingresa tus credenciales para continuar</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-ch-muted text-[10px] font-body tracking-[0.35em] uppercase mb-2">Email</label>
              <input
                name="email" type="email" required autoComplete="email"
                placeholder="tu@casahiedra.com"
                className="w-full bg-ch-surface border border-ch-border text-ch-cream font-body px-4 py-3 text-sm placeholder:text-ch-subtle focus:outline-none focus:border-ch-green transition-colors duration-200"
              />
            </div>
            <div>
              <label className="block text-ch-muted text-[10px] font-body tracking-[0.35em] uppercase mb-2">Contraseña</label>
              <input
                name="password" type="password" required autoComplete="current-password"
                placeholder="••••••••"
                className="w-full bg-ch-surface border border-ch-border text-ch-cream font-body px-4 py-3 text-sm placeholder:text-ch-subtle focus:outline-none focus:border-ch-green transition-colors duration-200"
              />
            </div>
            {error && (
              <div className="border border-red-900/50 bg-red-950/40 px-4 py-3">
                <p className="text-red-400 text-xs font-body">{error}</p>
              </div>
            )}
            <button
              type="submit" disabled={loading}
              className="w-full mt-2 bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase py-4 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
