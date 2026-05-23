'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'

const NAV = [
  { label: 'Catálogo',     href: '/rental' },
  { label: 'Maletas',      href: '/rental/maletas' },
  { label: 'Reservas',     href: '/rental/reservas' },
  { label: 'Cotizaciones', href: '/rental/cotizaciones' },
]

const NAV_BOTTOM = [
  { label: '← Hilván', href: '/dashboard' },
]

interface Props {
  nombre?: string
  rol?: string
  esAdmin?: boolean
}

export default function RentalSidebar({ nombre, rol, esAdmin }: Props) {
  const pathname = usePathname()

  const navItems = esAdmin
    ? NAV
    : NAV.filter(i => i.href !== '/rental/cotizaciones')

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-52 min-h-screen shrink-0 bg-ch-black border-r border-ch-border py-6 px-4 sticky top-0 self-start h-screen">
        {/* Logo + label módulo */}
        <div className="mb-8 px-2">
          <Link href="/rental">
            <Image
              src="/logos/logo-horizontal-negro.png"
              alt="Casa Hiedra"
              width={120}
              height={28}
              className="h-5 opacity-80"
              style={{ width: 'auto' }}
            />
          </Link>
          <p className="text-ch-subtle font-body text-[8px] tracking-[0.4em] uppercase mt-2">
            Rental
          </p>
        </div>

        {/* Nav principal */}
        <nav className="flex flex-col gap-0.5 flex-1">
          {navItems.map((item) => {
            const activo = item.href === '/rental'
              ? pathname === '/rental'
              : pathname.startsWith(item.href)
            return (
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
            )
          })}
        </nav>

        {/* Volver a Hilván */}
        <div className="flex flex-col gap-0.5 border-t border-ch-border pt-3 mt-3">
          {NAV_BOTTOM.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm px-3 py-2 rounded-[2px] text-ch-subtle hover:text-ch-muted hover:bg-ch-dark transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Usuario */}
        {nombre && (
          <Link
            href="/perfil"
            className="px-2 mt-4 pt-4 border-t border-ch-border block group transition-opacity opacity-70 hover:opacity-100"
          >
            <p className="text-xs text-ch-muted truncate group-hover:text-ch-cream transition-colors">{nombre}</p>
            {rol && <p className="text-xs text-ch-subtle capitalize mt-0.5">{rol}</p>}
          </Link>
        )}
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-ch-black border-b border-ch-border px-4 py-3 flex items-center justify-between">
        <Link href="/rental" className="flex items-center gap-2">
          <Image
            src="/logos/logo-horizontal-negro.png"
            alt="Casa Hiedra"
            width={100}
            height={24}
            className="h-4 opacity-80"
            style={{ width: 'auto' }}
          />
          <span className="text-ch-subtle font-body text-[8px] tracking-[0.3em] uppercase">Rental</span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const activo = item.href === '/rental'
              ? pathname === '/rental'
              : pathname.startsWith(item.href)
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
          <Link
            href="/dashboard"
            className="text-xs px-3 py-1.5 rounded-[2px] whitespace-nowrap text-ch-subtle hover:text-ch-muted transition-colors"
          >
            ← Hilván
          </Link>
        </nav>
      </header>
    </>
  )
}
