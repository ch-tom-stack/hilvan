'use client'

import { useState, useEffect } from 'react'

const SITIO = 'https://casahiedra.com'
const NAV_LINKS = [
  { href: SITIO, label: 'Inicio' },
  { href: `${SITIO}/productos`, label: 'Productos' },
  { href: `${SITIO}/archivo`, label: 'Archivo' },
  { href: `${SITIO}/la-casa`, label: 'La casa' },
]
const TINTA = '#0A0A0A'
const LINEA = '#0A0A0A22'
const LINEA_SUAVE = '#0A0A0A14'

// Nav de Rental. En desktop los links van en fila; bajo 768px colapsan a un
// botón hamburguesa que abre un drawer a pantalla completa (antes el logo se
// superponía con "Inicio" y "La casa" se partía en dos líneas en ~390px).
export default function NavArriendo() {
  const [abierto, setAbierto] = useState(false)

  // Bloquea el scroll del fondo, cierra con Escape, y cierra al pasar a desktop
  // (si no, al rotar el teléfono a horizontal el drawer se queda tapando todo).
  useEffect(() => {
    if (!abierto) return
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    const onResize = () => { if (window.innerWidth > 768) setAbierto(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.body.style.overflow = previo
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [abierto])

  const logo = (
    // logo-horizontal-blanco = logo oscuro para FONDOS CLAROS (convención del repo).
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logos/logo-horizontal-blanco.png" alt="Casa Hiedra" style={{ height: 24, display: 'block' }} />
  )

  return (
    <>
      <header className="ch-nav" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '14px 20px', borderBottom: `1px solid ${LINEA}`, flexShrink: 0,
      }}>
        <a href={SITIO} aria-label="Casa Hiedra — inicio" style={{ flexShrink: 0, display: 'block', lineHeight: 0 }}>{logo}</a>

        {/* Links — desktop */}
        <nav className="ch-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} style={{ fontSize: 14, color: TINTA, textDecoration: 'none', whiteSpace: 'nowrap' }}>{l.label}</a>
          ))}
        </nav>

        {/* Hamburguesa — mobile */}
        <button
          className="ch-nav-burger"
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          aria-expanded={abierto}
          style={{
            display: 'none', flexDirection: 'column', justifyContent: 'center', gap: 5,
            width: 40, height: 40, padding: 8, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <span style={{ display: 'block', height: 2, background: TINTA, borderRadius: 1 }} />
          <span style={{ display: 'block', height: 2, background: TINTA, borderRadius: 1 }} />
          <span style={{ display: 'block', height: 2, background: TINTA, borderRadius: 1 }} />
        </button>
      </header>

      {/* Drawer — mobile */}
      {abierto && (
        <div role="dialog" aria-modal="true" aria-label="Menú" style={{
          position: 'fixed', inset: 0, zIndex: 70, background: '#fff', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${LINEA}` }}>
            <a href={SITIO} aria-label="Casa Hiedra — inicio" style={{ display: 'block', lineHeight: 0 }}>{logo}</a>
            <button onClick={() => setAbierto(false)} aria-label="Cerrar menú" style={{
              width: 40, height: 40, border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 22, lineHeight: 1, color: TINTA, fontFamily: 'inherit',
            }}>✕</button>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', padding: '4px 20px' }}>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setAbierto(false)} style={{
                fontSize: 20, fontWeight: 600, color: TINTA, textDecoration: 'none',
                padding: '18px 0', borderBottom: `1px solid ${LINEA_SUAVE}`,
              }}>{l.label}</a>
            ))}
          </nav>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .ch-nav-links { display: none !important; }
          .ch-nav-burger { display: flex !important; }
        }
      `}</style>
    </>
  )
}
