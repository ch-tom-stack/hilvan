import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hilván — Casa Hiedra',
  description: 'Plataforma de gestión interna de producción audiovisual',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#242422',
              border: '1px solid #383836',
              color: '#f5f0e8',
              fontFamily: 'DM Sans, system-ui, sans-serif',
              fontSize: '0.8rem',
              borderRadius: '2px',
            },
          }}
        />
      </body>
    </html>
  )
}
