import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-ch-dark flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <p className="font-display italic text-8xl text-ch-border mb-2 leading-none select-none">404</p>
        <h1 className="font-display italic text-3xl text-ch-cream mb-3 leading-tight">
          Página no encontrada
        </h1>
        <p className="text-ch-muted text-sm mb-8 leading-relaxed">
          Esta página no existe o fue movida. Vuelve al inicio y continúa desde allí.
        </p>
        <Link
          href="/dashboard"
          className="inline-block border border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-muted font-body text-[10px] tracking-[0.4em] uppercase px-8 py-3 transition-colors"
        >
          Volver al Dashboard
        </Link>
        <p className="text-ch-subtle text-[10px] tracking-widest uppercase mt-12">
          Casa Hiedra · Hilván
        </p>
      </div>
    </div>
  )
}
