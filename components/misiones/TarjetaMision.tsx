'use client'

import { useState, useTransition } from 'react'
import { declararCumplida, type MisionVista } from '@/app/actions/misiones'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import { useCambiado } from '@/components/ui/useCambiado'

/**
 * Una misión, con su casilla para declararla cumplida.
 *
 * La casilla es el honor system hecho botón: la marca la persona y nadie más.
 * Por eso `soloLectura` existe —el panel de equipo muestra sin poder tocar— y
 * por eso no hay ninguna confirmación: declarar que hiciste algo no debería
 * costar más que hacerlo.
 */
export default function TarjetaMision({
  mision, soloLectura = false,
}: {
  mision: MisionVista
  soloLectura?: boolean
}) {
  const [cumplida, setCumplida] = useState(!!mision.cumplida_en)
  const [pendiente, startTransition] = useTransition()
  const { ref, marcar } = useCambiado<HTMLDivElement>()

  function alternar() {
    if (soloLectura) return
    const siguiente = !cumplida
    setCumplida(siguiente)          // optimista
    marcar()
    // `meta.cumplida`, no `hito.alcanzado`: la celebración de hito detiene la
    // pantalla y está reservada para lo excepcional. Cerrar la misión del día
    // pasa todos los días — celebrarlo así enseñaría a odiar la celebración.
    momento(siguiente ? 'meta.cumplida' : 'toggle.off')
    startTransition(async () => {
      try {
        const res = await declararCumplida(mision.id, siguiente)
        if (res?.error) {
          setCumplida(!siguiente)
          toastError(res.error)
        }
      } catch {
        setCumplida(!siguiente)
        toastError('No se pudo guardar')
      }
    })
  }

  return (
    <div
      ref={ref}
      className={`border border-ch-border bg-ch-surface/20 p-4 transition-opacity ${
        cumplida ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {!soloLectura && (
          <button
            onClick={alternar}
            disabled={pendiente}
            aria-pressed={cumplida}
            aria-label={cumplida ? 'Marcar como no cumplida' : 'Declarar cumplida'}
            className={`ch-press mt-0.5 w-4 h-4 shrink-0 border transition-colors disabled:opacity-40 ${
              cumplida
                ? 'border-ch-green bg-ch-green/20'
                : 'border-ch-border hover:border-ch-muted'
            }`}
          >
            {cumplida && (
              <svg viewBox="0 0 16 16" className="w-full h-full text-ch-green" fill="none"
                   stroke="currentColor" strokeWidth={2.2} strokeLinecap="square">
                <path d="M3 8.5l3.2 3.2L13 5" />
              </svg>
            )}
          </button>
        )}

        <div className="min-w-0 flex-1">
          <p className={`font-body text-sm leading-relaxed text-ch-cream ${
            cumplida ? 'line-through decoration-ch-subtle' : ''
          }`}>
            {mision.texto}
          </p>

          {mision.guia && (
            <p className="font-body text-xs text-ch-muted leading-relaxed mt-2">
              {mision.guia}
            </p>
          )}

          {/* La fuente, siempre con su fecha: un conteo sin fecha no vale. */}
          {mision.fuente_verificacion && (
            <p className="font-body text-[10px] text-ch-subtle leading-relaxed mt-2">
              {mision.fuente_verificacion}
              {mision.verificado_en && ` · verificado ${mision.verificado_en}`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
