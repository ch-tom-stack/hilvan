'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import type { Rol } from '@/types'

const navItems = [
  { label: 'Dashboard',    href: '/dashboard',   disponible: true  },
  { label: 'Equipos',      href: '/equipos',      disponible: true  },
  { label: 'Cotizaciones', href: '/cotizaciones', disponible: true  },
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
  const [abierto, setAbierto] = useState(false)

  const NavContent = () => (
    <>
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
                  onClick={() => setAbierto(false)}
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
          <button
            type="submit"
            className="w-full text-left px-4 py-2 text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase transition-colors duration-150"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </>
  )

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex w-60 min-h-screen bg-ch-black border-r border-ch-border flex-col flex-shrink-0">
        <div className="px-7 py-7 border-b border-ch-border">
          <img src="/logos/logo-horizontal-negro.png" alt="Casa Hiedra" className="h-5 w-auto mb-2 opacity-80" />
          <h1 className="font-display italic text-[2rem] leading-none text-ch-cream tracking-tight">Hilván</h1>
        </div>
        <NavContent />
      </aside>

      {/* ── Mobile header ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-ch-black border-b border-ch-border flex items-center justify-between px-5 py-4">
        <div>
          <img src="/logos/logo-horizontal-negro.png" alt="Casa Hiedra" className="h-4 w-auto mb-1 opacity-80" />
          <h1 className="font-display italic text-xl leading-none text-ch-cream">Hilván</h1>
        </div>
        <button
          onClick={() => setAbierto(!abierto)}
          className="text-ch-muted hover:text-ch-cream transition-colors p-1"
          aria-label="Menú"
        >
          {abierto ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
        </button>
      </div>

      {/* ── Mobile drawer ── */}
      {abierto && (
        <div className="lg:hidden fixed inset-0 z-30" onClick={() => setAbierto(false)}>
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}
      <aside
        className={`lg:hidden fixed top-0 left-0 bottom-0 z-40 w-72 bg-ch-black border-r border-ch-border flex flex-col transform transition-transform duration-300 ${
          abierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-7 py-7 border-b border-ch-border flex items-center justify-between">
          <div>
            <img src="/logos/logo-horizontal-negro.png" alt="Casa Hiedra" className="h-5 w-auto mb-2 opacity-80" />
            <h1 className="font-display italic text-[2rem] leading-none text-ch-cream tracking-tight">Hilván</h1>
          </div>
          <button
            onClick={() => setAbierto(false)}
            className="text-ch-muted hover:text-ch-cream transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 3L15 15M15 3L3 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <NavContent />
      </aside>
    </>
  )
}
