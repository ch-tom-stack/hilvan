import type { Metadata } from 'next'
import '../marca-web.css'

export const metadata: Metadata = {
  title: 'Agenda una reunión · Casa Hiedra',
  description: 'Reserva una reunión con Casa Hiedra.',
}

// Layout AISLADO de la marca web de Casa Hiedra (no usa el tema oscuro de Hilván):
// fondo blanco, tinta negra, tipografía grotesca. El rojo (#C11700) se reserva
// solo para el CTA dentro de la página.
//
// La fuente se sirve desde el repo (ver fuente.css). Venía de
// `next/font/google`, que la baja en tiempo de build: el caché de Vercel se
// quedó con URLs de gstatic que empezaron a dar 404 y tumbó TODOS los deploys,
// no sólo esta ruta.
export default function ReunionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        color: '#0A0A0A',
        minHeight: '100vh',
        fontFamily: "'Schibsted Grotesk', system-ui, -apple-system, sans-serif",
      }}
    >
      {children}
    </div>
  )
}
