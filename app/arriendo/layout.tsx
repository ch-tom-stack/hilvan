import type { Metadata } from 'next'
import { Schibsted_Grotesk } from 'next/font/google'

const schibsted = Schibsted_Grotesk({ subsets: ['latin'], weight: ['400', '500', '700', '800'] })

export const metadata: Metadata = {
  title: 'Arriendo de equipos · Casa Hiedra',
  description: 'Arriendo de equipos audiovisuales profesionales. Arma tu cotización al instante.',
}

// Layout AISLADO con la marca web de Casa Hiedra (no el tema oscuro de Hilván):
// fondo blanco, tinta negra, tipografía grotesca. El rojo (#C11700) queda solo
// para el CTA dentro de la página.
export default function ArriendoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={schibsted.className}
      style={{ background: '#FFFFFF', color: '#0A0A0A', minHeight: '100vh' }}
    >
      {children}
    </div>
  )
}
