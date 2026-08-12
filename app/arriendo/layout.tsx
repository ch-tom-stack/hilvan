import type { Metadata } from 'next'
import '../marca-web.css'

export const metadata: Metadata = {
  title: 'Arriendo de equipos · Casa Hiedra',
  description: 'Arriendo de equipos audiovisuales profesionales. Arma tu cotización al instante.',
}

// Layout AISLADO con la marca web de Casa Hiedra (no el tema oscuro de Hilván):
// fondo blanco, tinta negra, tipografía grotesca. El rojo (#C11700) queda solo
// para el CTA dentro de la página.
//
// La fuente se sirve desde el repo (ver app/marca-web.css), no desde
// `next/font/google`: esa la descarga en tiempo de build y un 404 de gstatic
// tumbó TODOS los deploys, no sólo esta ruta.
export default function ArriendoLayout({ children }: { children: React.ReactNode }) {
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
