'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'

const BASE_NAV_ITEMS = [
  { label: 'Dashboard',      href: '/dashboard',      disponible: true  },
  { label: 'Cotizaciones',   href: '/cotizaciones',   disponible: true  },
  { label: 'Rodajes',        href: '/rodaje',         disponible: true  },
  { label: 'Rendiciones',    href: '/rendiciones',    disponible: true  },
  { label: 'Financiero',     href: '/financiero',     disponible: false, soloAdmin: true },
  { label: 'Equipos',        href: '/equipos',        disponible: true  },
  { label: 'Colaboradores',  href: '/colaboradores',  disponible: true  },
  { label: 'Clientes',       href: '/clientes',       disponible: true  },
  { label: 'Usuarios',       href: '/usuarios',       disponible: false, soloAdmin: true },
  { label: 'Calendario',    href: '/calendario',     disponible: true  },
  { label: 'Rental',         href: '/rental',         disponible: true  },
]

interface SidebarProps {
  email?: string
  nombre?: string
  rol?: string
}

export default function Sidebar({ email, nombre, rol }: SidebarProps) {
  const pathname = usePathname()
  const esAdmin = rol === 'admin'
  const navItems = BASE_NAV_ITEMS.map(item =>
    item.soloAdmin ? { ...item, disponible: esAdmin } : item
  )

  return (
    <>
      {/* Desktop sidebar — sticky en el flujo flex del layout */}
      <aside className="hidden lg:flex flex-col w-52 min-h-screen shrink-0 bg-ch-black border-r border-ch-border py-6 px-4 sticky top-0 self-start h-screen">
        {/* Logo */}
        <div className="mb-8 px-2">
          <Link href="/dashboard">
            <Image
              src="/logos/logo-horizontal-negro.png"
              alt="Casa Hiedra"
              width={120}
              height={28}
              className="h-5 w-auto opacity-80"
            />
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 flex-1">
          {navItems.map((item) => {
            const activo = pathname.startsWith(item.href)
            return item.disponible ? (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm px-3 py-2 rounded-[2px] transition-colors ${
                  activo
                    ? 'bg-ch-surface text-ch-cream'
                    : 'text-ch-muted hover:text-ch-cream hover:bg-ch-dark'
                }`}
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.href}
                className="text-sm px-3 py-2 text-ch-subtle cursor-default select-none"
              >
                {item.label}
              </span>
            )
          })}
        </nav>

        {/* Usuario → link a perfil */}
        {(nombre || email) && (
          <Link
            href="/perfil"
            className={`px-2 mt-4 pt-4 border-t border-ch-border block group transition-opacity ${
              pathname.startsWith('/perfil') ? 'opacity-100' : 'opacity-70 hover:opacity-100'
            }`}
          >
            <p className="text-xs text-ch-muted truncate group-hover:text-ch-cream transition-colors">{nombre || email}</p>
            {rol && <p className="text-xs text-ch-subtle capitalize mt-0.5">{rol}</p>}
          </Link>
        )}

        {/* Footer logo */}
        <div className="px-2 mt-4">
          <Image
            src="/logos/logo-horizontal-negro.png"
            alt=""
            width={80}
            height={20}
            className="h-5 w-auto opacity-20"
          />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-ch-black border-b border-ch-border px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard">
          <Image
            src="/logos/logo-horizontal-negro.png"
            alt="Casa Hiedra"
            width={100}
            height={24}
            className="h-4 w-auto opacity-80"
          />
        </Link>
        <nav className="flex gap-1 overflow-x-auto">
          {navItems.filter((i) => i.disponible).map((item) => {
            const activo = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-xs px-3 py-1.5 rounded-[2px] whitespace-nowrap transition-colors ${
                  activo ? 'bg-ch-surface text-ch-cream' : 'text-ch-muted hover:text-ch-cream'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>
    </>
  )
}
