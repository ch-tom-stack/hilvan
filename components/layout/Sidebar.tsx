'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { useState, useEffect } from 'react'

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
  const [menuOpen, setMenuOpen] = useState(false)

  // Cerrar al cambiar de ruta
  useEffect(() => { setMenuOpen(false) }, [pathname])

  // Bloquear scroll del body cuando el menú está abierto
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

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
              style={{ height: 'auto' }}
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
            style={{ height: 'auto' }}
          />
        </div>
      </aside>

      {/* ── Mobile: top bar con hamburger ── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-ch-black border-b border-ch-border px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="shrink-0">
          <Image
            src="/logos/logo-horizontal-negro.png"
            alt="Casa Hiedra"
            width={100}
            height={24}
            className="h-4 w-auto opacity-80"
            style={{ height: 'auto' }}
          />
        </Link>

        {/* Módulo activo en el centro */}
        <span className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted absolute left-1/2 -translate-x-1/2">
          {navItems.find(i => i.disponible && pathname.startsWith(i.href))?.label ?? ''}
        </span>

        {/* Botón hamburger */}
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
          className="shrink-0 w-9 h-9 flex flex-col items-center justify-center gap-[5px] text-ch-muted hover:text-ch-cream transition-colors"
        >
          <span className="block w-5 h-px bg-current" />
          <span className="block w-5 h-px bg-current" />
          <span className="block w-3 h-px bg-current self-start ml-1" />
        </button>
      </header>

      {/* ── Mobile: drawer overlay ── */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setMenuOpen(false)}
          />

          {/* Drawer */}
          <nav className="relative z-10 w-72 max-w-[85vw] bg-ch-black h-full flex flex-col border-r border-ch-border">
            {/* Header del drawer */}
            <div className="flex items-center justify-between px-6 h-14 border-b border-ch-border shrink-0">
              <Link href="/dashboard">
                <Image
                  src="/logos/logo-horizontal-negro.png"
                  alt="Casa Hiedra"
                  width={100}
                  height={24}
                  className="h-4 w-auto opacity-80"
                  style={{ height: 'auto' }}
                />
              </Link>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
                className="w-8 h-8 flex items-center justify-center text-ch-muted hover:text-ch-cream transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Items de navegación */}
            <div className="flex-1 overflow-y-auto py-4 px-3">
              {navItems.map((item) => {
                const activo = pathname.startsWith(item.href)
                return item.disponible ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center px-4 py-3 rounded-[2px] transition-colors font-body text-sm mb-0.5 ${
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
                    className="flex items-center px-4 py-3 font-body text-sm text-ch-subtle/40 cursor-default select-none mb-0.5"
                  >
                    {item.label}
                  </span>
                )
              })}
            </div>

            {/* Usuario */}
            {(nombre || email) && (
              <Link
                href="/perfil"
                onClick={() => setMenuOpen(false)}
                className="px-6 py-4 border-t border-ch-border shrink-0 block group transition-opacity opacity-70 hover:opacity-100"
              >
                <p className="font-body text-xs text-ch-muted truncate group-hover:text-ch-cream transition-colors">{nombre || email}</p>
                {rol && <p className="font-body text-[10px] text-ch-subtle capitalize mt-0.5">{rol}</p>}
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  )
}
