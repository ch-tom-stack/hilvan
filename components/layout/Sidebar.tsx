'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import PiePerfil from '@/components/layout/PiePerfil'
import { registrarPuente } from '@/app/actions/puentes'
import { revisarMedallasSuave } from '@/lib/medallas-cliente'

const BASE_NAV_ITEMS = [
  { label: 'Dashboard',     href: '/dashboard',     disponible: true,  rolesPermitidos: null,              ocultarPara: null },
  { label: 'CRM',           href: '/crm',           disponible: true,  rolesPermitidos: ['admin', 'productor'], ocultarPara: null },
  { label: 'Cotizaciones',  href: '/cotizaciones',  disponible: true,  rolesPermitidos: null,              ocultarPara: null },
  { label: 'Rodajes',       href: '/rodaje',        disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] },
  { label: 'Centro de costos', href: '/costos',     disponible: true,  rolesPermitidos: null,              ocultarPara: null },
  { label: 'Financiero',    href: '/financiero',    disponible: false, rolesPermitidos: ['admin', 'contabilidad'], ocultarPara: null },
  { label: 'Equipos',       href: '/equipos',       disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] },
  { label: 'Colaboradores', href: '/colaboradores', disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] },
  { label: 'Clientes',      href: '/clientes',      disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] },
  { label: 'Usuarios',      href: '/usuarios',      disponible: false, rolesPermitidos: ['admin'],         ocultarPara: null },
  { label: 'Calendario',   href: '/calendario',    disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] },
  { label: 'Reuniones',    href: '/reuniones',     disponible: true,  rolesPermitidos: ['admin', 'productor'], ocultarPara: null },
  { label: 'Rental',        href: '/rental',        disponible: true,  rolesPermitidos: null,              ocultarPara: ['contabilidad'] },
]

interface SidebarProps {
  email?: string
  nombre?: string
  rol?: string
}

export default function Sidebar({ email, nombre, rol }: SidebarProps) {
  const pathname = usePathname()
  const navItems = BASE_NAV_ITEMS.map(item => {
    let disp = item.disponible
    if (item.rolesPermitidos) disp = item.rolesPermitidos.includes(rol ?? '')
    if (item.ocultarPara?.includes(rol ?? '')) disp = false
    return { ...item, disponible: disp }
  })
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
              className="h-5 opacity-80"
              style={{ width: 'auto' }}
              priority
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

        {/* Otras apps de Casa Hiedra */}
        <div className="mt-4 pt-3 border-t border-ch-border">
          <a
            href="https://bastidor-five.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              void registrarPuente('bastidor').then(revisarMedallasSuave)
            }}
            className="flex items-center justify-between text-sm px-3 py-2 rounded-[2px] text-ch-muted hover:text-ch-cream hover:bg-ch-dark transition-colors"
          >
            Bastidor
            <span className="text-xs text-ch-subtle">↗</span>
          </a>
        </div>

        {/* Quién eres y cómo vas, en un solo link: la puerta a la vitrina. */}
        <div className="mt-4">
          <PiePerfil nombre={nombre} email={email} rol={rol} />
        </div>

        {/* Footer logo */}
        <div className="px-2 mt-4">
          <Image
            src="/logos/logo-horizontal-negro.png"
            alt=""
            width={80}
            height={20}
            className="h-5 opacity-20"
            style={{ width: 'auto' }}
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
            className="h-4 opacity-80"
            style={{ width: 'auto' }}
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
                  className="h-4 opacity-80"
                  style={{ width: 'auto' }}
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
                    className="flex items-center px-4 py-3 font-body text-sm text-ch-subtle cursor-default select-none mb-0.5"
                  >
                    {item.label}
                  </span>
                )
              })}

              {/* Otras apps de Casa Hiedra */}
              <div className="mt-3 pt-3 border-t border-ch-border">
                <a
                  href="https://bastidor-five.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void registrarPuente('bastidor').then(revisarMedallasSuave)
                  }}
                  className="flex items-center justify-between px-4 py-3 rounded-[2px] font-body text-sm text-ch-muted hover:text-ch-cream hover:bg-ch-dark transition-colors"
                >
                  Bastidor
                  <span className="text-xs text-ch-subtle">↗</span>
                </a>
              </div>
            </div>

            {/* El mismo bloque, con más aire lateral y área de toque más alta. */}
            <PiePerfil
              nombre={nombre} email={email} rol={rol}
              compacto onNavegar={() => setMenuOpen(false)}
            />
          </nav>
        </div>
      )}
    </>
  )
}
