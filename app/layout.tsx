import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hilván — Casa Hiedra',
  description: 'Plataforma de gestión interna de producción audiovisual',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
