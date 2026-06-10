#!/bin/bash

# ============================================
# Hilván — Setup Chat 0
# Ejecutar desde la raíz del proyecto: bash setup-hilvan.sh
# ============================================

echo "🌿 Configurando Hilván..."

# ── tailwind.config.ts ──────────────────────
cat > tailwind.config.ts << 'EOF'
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'ch-black':       '#111110',
        'ch-dark':        '#1c1c1a',
        'ch-surface':     '#242422',
        'ch-border':      '#2e2e2b',
        'ch-muted':       '#6b6b65',
        'ch-cream':       '#f5f0e8',
        'ch-white':       '#faf9f7',
        'ch-green':       '#7a9e7e',
        'ch-green-light': '#9dbfa1',
        'ch-gold':        '#c9a84c',
        'ch-gold-light':  '#dfc078',
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        body:    ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
EOF
echo "✓ tailwind.config.ts"

# ── app/globals.css ──────────────────────────
cat > app/globals.css << 'EOF'
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  scrollbar-width: thin;
  scrollbar-color: #2e2e2b #111110;
}

*::-webkit-scrollbar { width: 6px; }
*::-webkit-scrollbar-track { background: #111110; }
*::-webkit-scrollbar-thumb { background: #2e2e2b; border-radius: 0; }

body {
  background-color: #1c1c1a;
  color: #f5f0e8;
  font-family: 'DM Sans', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

::selection { background: #7a9e7e; color: #111110; }

input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus {
  -webkit-text-fill-color: #f5f0e8;
  -webkit-box-shadow: 0 0 0px 1000px #242422 inset;
  transition: background-color 5000s ease-in-out 0s;
}
EOF
echo "✓ app/globals.css"

# ── app/layout.tsx ───────────────────────────
cat > app/layout.tsx << 'EOF'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hilván — Casa Hiedra',
  description: 'Plataforma de gestión interna de producción audiovisual',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
EOF
echo "✓ app/layout.tsx"

# ── app/page.tsx ─────────────────────────────
cat > app/page.tsx << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
EOF
echo "✓ app/page.tsx"

# ── types/index.ts ───────────────────────────
mkdir -p types
cat > types/index.ts << 'EOF'
export type Rol = 'admin' | 'productor' | 'colaborador' | 'cliente'

export interface Profile {
  id: string
  email: string
  nombre: string | null
  apellido: string | null
  rol: Rol
  activo: boolean
  created_at: string
  updated_at: string
}
EOF
echo "✓ types/index.ts"

# ── lib/supabase/client.ts ───────────────────
mkdir -p lib/supabase
cat > lib/supabase/client.ts << 'EOF'
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
EOF
echo "✓ lib/supabase/client.ts"

# ── lib/supabase/server.ts ───────────────────
cat > lib/supabase/server.ts << 'EOF'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignorado en Server Components
          }
        },
      },
    }
  )
}
EOF
echo "✓ lib/supabase/server.ts"

# ── middleware.ts ────────────────────────────
cat > middleware.ts << 'EOF'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/login')) {
    if (user) return NextResponse.redirect(new URL('/dashboard', request.url))
    return supabaseResponse
  }

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
EOF
echo "✓ middleware.ts"

# ── app/actions/auth.ts ──────────────────────
mkdir -p app/actions
cat > app/actions/auth.ts << 'EOF'
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
EOF
echo "✓ app/actions/auth.ts"

# ── app/(auth)/layout.tsx ────────────────────
mkdir -p "app/(auth)/login"
cat > "app/(auth)/layout.tsx" << 'EOF'
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
EOF
echo "✓ app/(auth)/layout.tsx"

# ── app/(auth)/login/page.tsx ────────────────
cat > "app/(auth)/login/page.tsx" << 'EOF'
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
                className="w-full bg-ch-surface border border-ch-border text-ch-cream font-body px-4 py-3 text-sm placeholder:text-ch-border focus:outline-none focus:border-ch-green transition-colors duration-200"
              />
            </div>
            <div>
              <label className="block text-ch-muted text-[10px] font-body tracking-[0.35em] uppercase mb-2">Contraseña</label>
              <input
                name="password" type="password" required autoComplete="current-password"
                placeholder="••••••••"
                className="w-full bg-ch-surface border border-ch-border text-ch-cream font-body px-4 py-3 text-sm placeholder:text-ch-border focus:outline-none focus:border-ch-green transition-colors duration-200"
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
EOF
echo "✓ app/(auth)/login/page.tsx"

# ── components/layout/Sidebar.tsx ───────────
mkdir -p components/layout
cat > components/layout/Sidebar.tsx << 'EOF'
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import type { Rol } from '@/types'

const navItems = [
  { label: 'Dashboard',    href: '/dashboard',   disponible: true  },
  { label: 'Equipos',      href: '/equipos',      disponible: false },
  { label: 'Cotizaciones', href: '/cotizaciones', disponible: false },
  { label: 'Rodaje',       href: '/rodaje',       disponible: false },
  { label: 'Rendiciones',  href: '/rendiciones',  disponible: false },
  { label: 'Financiero',   href: '/financiero',   disponible: false },
  { label: 'CRM',          href: '/crm',          disponible: false },
]

interface SidebarProps {
  email?: string
  nombre?: string | null
  rol?: Rol
}

export default function Sidebar({ email, nombre, rol }: SidebarProps) {
  const pathname = usePathname()
  const displayName = nombre || email?.split('@')[0] || 'Usuario'

  return (
    <aside className="w-60 min-h-screen bg-ch-black border-r border-ch-border flex flex-col flex-shrink-0">
      <div className="px-7 py-7 border-b border-ch-border">
        <p className="text-ch-muted text-[9px] font-body tracking-[0.45em] uppercase mb-1">Casa Hiedra</p>
        <h1 className="font-display italic text-[2rem] leading-none text-ch-cream tracking-tight">Hilván</h1>
      </div>
      <nav className="flex-1 py-5 px-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            if (!item.disponible) {
              return (
                <li key={item.href}>
                  <span className="flex items-center justify-between px-4 py-2.5 cursor-not-allowed select-none">
                    <span className="font-body text-sm text-ch-border opacity-40">{item.label}</span>
                    <span className="text-[8px] font-body tracking-widest text-ch-border opacity-20">PRONTO</span>
                  </span>
                </li>
              )
            }
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center px-4 py-2.5 transition-colors duration-150 ${
                    isActive
                      ? 'bg-ch-surface text-ch-cream border-l-2 border-ch-green'
                      : 'text-ch-muted hover:text-ch-cream hover:bg-ch-surface/60'
                  }`}
                >
                  <span className="font-body text-sm">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="px-3 py-5 border-t border-ch-border">
        <div className="px-4 mb-3">
          <p className="text-ch-cream text-xs font-body font-medium truncate capitalize">{displayName}</p>
          <p className="text-ch-muted text-[10px] font-body capitalize mt-0.5">{rol}</p>
        </div>
        <form action={logout}>
          <button type="submit" className="w-full text-left px-4 py-2 text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase transition-colors duration-150">
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  )
}
EOF
echo "✓ components/layout/Sidebar.tsx"

# ── app/(dashboard)/layout.tsx ───────────────
mkdir -p "app/(dashboard)/dashboard"
cat > "app/(dashboard)/layout.tsx" << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import type { Profile } from '@/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  return (
    <div className="flex min-h-screen bg-ch-dark">
      <Sidebar email={user.email} nombre={profile?.nombre} rol={profile?.rol} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
EOF
echo "✓ app/(dashboard)/layout.tsx"

# ── app/(dashboard)/dashboard/page.tsx ───────
cat > "app/(dashboard)/dashboard/page.tsx" << 'EOF'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types'

const modulos = [
  { codigo: 'CH-1', nombre: 'Equipos',      desc: 'Inventario, QR y disponibilidad' },
  { codigo: 'CH-2', nombre: 'Cotizaciones', desc: 'Presupuestos y aprobaciones' },
  { codigo: 'CH-3', nombre: 'Rodaje',       desc: 'Hojas de llamado y citaciones' },
  { codigo: 'CH-4', nombre: 'Rendiciones',  desc: 'Gastos de colaboradores' },
  { codigo: 'CH-5', nombre: 'Financiero',   desc: 'Estado de resultados' },
  { codigo: 'CH-6', nombre: 'CRM',          desc: 'Clientes y proyectos' },
]

function getSaludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single<Profile>()

  const nombre = profile?.nombre || user?.email?.split('@')[0] || 'admin'

  return (
    <div className="p-10 max-w-5xl">
      <div className="mb-14">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">{getSaludo()}</p>
        <h1 className="font-display italic text-6xl text-ch-cream leading-none capitalize">{nombre}</h1>
      </div>
      <div className="mb-5">
        <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase">Módulos de Hilván</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {modulos.map((mod) => (
          <div key={mod.codigo} className="border border-ch-border bg-ch-surface/50 p-6 opacity-40 select-none">
            <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-4">{mod.codigo}</p>
            <h3 className="font-display text-2xl text-ch-cream italic mb-1">{mod.nombre}</h3>
            <p className="text-ch-muted font-body text-xs leading-relaxed">{mod.desc}</p>
            <div className="mt-5">
              <span className="text-[8px] font-body tracking-[0.4em] text-ch-border uppercase">Próximamente</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
EOF
echo "✓ app/(dashboard)/dashboard/page.tsx"

echo ""
echo "✅ Hilván Chat 0 configurado correctamente."
echo "   Ejecuta: npm run dev"
