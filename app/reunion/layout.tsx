import type { Metadata } from 'next'
import { Schibsted_Grotesk } from 'next/font/google'

const schibsted = Schibsted_Grotesk({ subsets: ['latin'], weight: ['400', '500', '700', '800'] })

export const metadata: Metadata = {
  title: 'Agenda una reunión · Casa Hiedra',
  description: 'Reserva una reunión con Casa Hiedra.',
}

// Layout AISLADO de la marca web de Casa Hiedra (no usa el tema oscuro de Hilván):
// fondo blanco, tinta negra, tipografía grotesca. El rojo (#C11700) se reserva
// solo para el CTA dentro de la página.
export default function ReunionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={schibsted.className}
      style={{ background: '#FFFFFF', color: '#0A0A0A', minHeight: '100vh' }}
    >
      {children}
    </div>
  )
}
