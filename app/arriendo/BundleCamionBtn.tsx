'use client'

import { useState } from 'react'

// Completar cuando esté definido el contenido del bundle
const CAMION = {
  nombre: 'Camión completo',
  descripcion: '',  // ← pendiente
  precio: null as number | null,  // ← null = "a consultar"
  incluye: [] as string[],  // ← lista de ítems
}

export default function BundleCamionBtn() {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setAbierto(true)}
        className="fixed bottom-24 right-5 lg:bottom-8 lg:right-8 z-40 flex items-center gap-2 bg-ch-surface border border-ch-border text-ch-cream hover:border-ch-green hover:text-ch-green transition-colors px-4 py-3 font-body text-[10px] tracking-[0.35em] uppercase"
        title="Arriendo camión completo"
      >
        <span>⬛</span>
        <span className="hidden sm:inline">Camión completo</span>
      </button>

      {/* Modal */}
      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ch-black/90 px-4"
          onClick={() => setAbierto(false)}
        >
          <div
            className="relative w-full max-w-2xl bg-ch-dark border border-ch-border"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="border-b border-ch-border px-8 py-6 flex items-start justify-between gap-4">
              <div>
                <p className="font-body text-[9px] tracking-[0.5em] uppercase text-ch-muted mb-2">Casa Hiedra · Rental</p>
                <h2 className="font-display italic text-4xl text-ch-cream leading-none">{CAMION.nombre}</h2>
              </div>
              <button
                onClick={() => setAbierto(false)}
                className="font-body text-[10px] tracking-[0.4em] uppercase text-ch-muted hover:text-ch-cream transition-colors mt-1 shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Contenido */}
            <div className="px-8 py-6 space-y-6">
              {CAMION.descripcion && (
                <p className="font-body text-sm text-ch-muted leading-relaxed">{CAMION.descripcion}</p>
              )}

              {CAMION.incluye.length > 0 && (
                <div>
                  <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-3">Incluye</p>
                  <ul className="space-y-1">
                    {CAMION.incluye.map((item, i) => (
                      <li key={i} className="font-body text-sm text-ch-cream flex items-baseline gap-2">
                        <span className="text-ch-border text-xs">—</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Precio + CTA */}
              <div className="border-t border-ch-border pt-6 flex items-center justify-between gap-4">
                <div>
                  <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">Precio por jornada</p>
                  <p className="font-display italic text-3xl text-ch-cream leading-none">
                    {CAMION.precio ? `$${CAMION.precio.toLocaleString('es-CL')}` : 'A consultar'}
                  </p>
                </div>
                <a
                  href="mailto:rental@casahiedra.com?subject=Arriendo%20camión%20completo"
                  className="font-body text-[10px] tracking-[0.4em] uppercase px-6 py-3.5 bg-ch-green text-ch-black hover:bg-ch-green-light transition-colors"
                >
                  Consultar →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
