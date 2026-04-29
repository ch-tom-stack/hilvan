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
