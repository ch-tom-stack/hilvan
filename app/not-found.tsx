import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-ch-black flex flex-col">
      {/* Header */}
      <div className="border-b border-ch-border px-6 py-4">
        <img
          src="/logos/logo-horizontal-negro.png"
          alt="Casa Hiedra"
          className="h-5 opacity-80 invert"
        />
      </div>

      {/* Contenido centrado */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="font-display italic text-[120px] leading-none text-ch-border/60 select-none mb-0">
            404
          </p>
          <h1 className="font-display italic text-3xl text-ch-cream mb-3 leading-tight -mt-2">
            Página no encontrada
          </h1>
          <p className="text-ch-muted text-sm mb-10 leading-relaxed">
            Esta página no existe o fue movida.<br />
            Vuelve al inicio y continúa desde allí.
          </p>
          <Link
            href="/dashboard"
            className="inline-block border border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-muted font-body text-[10px] tracking-[0.4em] uppercase px-8 py-3 transition-colors"
          >
            Volver al Dashboard
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-ch-border px-6 py-4 text-center">
        <p className="text-ch-subtle text-[9px] tracking-[0.4em] uppercase">
          Hilván · Casa Hiedra
        </p>
      </div>
    </div>
  )
}
