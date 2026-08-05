'use client'

import { useSyncExternalStore } from 'react'
import {
  getPreferencias, setPreferencias, onPreferencias, PREFERENCIAS_POR_DEFECTO,
  type Preferencias, type Volumen,
} from '@/lib/preferencias'
import { reproducir } from '@/lib/sfx'
import { confetti } from '@/lib/celebrate'

const VOLUMENES: { valor: Volumen; label: string }[] = [
  { valor: 'bajo',  label: 'Bajo'  },
  { valor: 'medio', label: 'Medio' },
  { valor: 'alto',  label: 'Alto'  },
]

// La media query de movimiento reducido es otro store externo.
const QUERY = '(prefers-reduced-motion: reduce)'
function suscribirMovimiento(cb: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export default function PreferenciasFeedback() {
  // Las preferencias viven en localStorage: un store externo a React. Con
  // useSyncExternalStore la hidratación es correcta sin setState en efectos.
  const prefs = useSyncExternalStore(
    onPreferencias,
    getPreferencias,
    () => PREFERENCIAS_POR_DEFECTO,
  )
  const reducido = useSyncExternalStore(
    suscribirMovimiento,
    () => window.matchMedia?.(QUERY).matches ?? false,
    () => false,
  )

  const cambiar = (parcial: Partial<Preferencias>) => {
    const siguiente = setPreferencias(parcial)
    // Devolver el cambio en el mismo medio que se está configurando.
    if (parcial.sonido !== false && siguiente.sonido) reproducir('ok-guardar')
  }

  const probar = () => {
    reproducir('win-cierre')
    confetti(undefined, undefined, 'normal')
  }

  return (
    <section className="border border-ch-border bg-ch-surface/30 p-6">
      <h2 className="text-[9px] font-body tracking-[0.4em] uppercase text-ch-muted mb-1.5">Sonido y movimiento</h2>
      <p className="text-xs text-ch-muted mb-5">
        Cómo te responde Hilván. Se guarda en este dispositivo.
      </p>

      <div className="space-y-5">

        {/* Sonido */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-ch-cream">Sonidos de interfaz</p>
            <p className="text-xs text-ch-muted mt-0.5">Confirmaciones, avances y celebraciones.</p>
          </div>
          <button
            onClick={() => cambiar({ sonido: !prefs.sonido })}
            aria-pressed={prefs.sonido}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-[2px] border transition-colors ch-press ${
              prefs.sonido
                ? 'border-ch-green/50 text-ch-green bg-ch-green/5'
                : 'border-ch-border text-ch-subtle hover:text-ch-cream'
            }`}
          >
            {prefs.sonido ? 'Encendido' : 'Silencio'}
          </button>
        </div>

        {/* Volumen */}
        <div className={prefs.sonido ? '' : 'opacity-40 pointer-events-none'}>
          <label className="block text-xs text-ch-muted mb-2">Volumen</label>
          <div className="flex gap-2">
            {VOLUMENES.map(v => (
              <button
                key={v.valor}
                onClick={() => cambiar({ volumen: v.valor })}
                className={`text-xs px-3 py-1.5 rounded-[2px] border transition-colors ch-press ${
                  prefs.volumen === v.valor
                    ? 'border-ch-green/50 text-ch-green bg-ch-green/5'
                    : 'border-ch-border text-ch-muted hover:text-ch-cream'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Celebraciones */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-ch-cream">Celebraciones</p>
            <p className="text-xs text-ch-muted mt-0.5">
              Confeti y animaciones en los cierres, pagos y facturas.
            </p>
          </div>
          <button
            onClick={() => cambiar({ celebraciones: !prefs.celebraciones })}
            aria-pressed={prefs.celebraciones}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-[2px] border transition-colors ch-press ${
              prefs.celebraciones
                ? 'border-ch-green/50 text-ch-green bg-ch-green/5'
                : 'border-ch-border text-ch-subtle hover:text-ch-cream'
            }`}
          >
            {prefs.celebraciones ? 'Encendidas' : 'Apagadas'}
          </button>
        </div>

        {/* Probar */}
        <div className="pt-1">
          <button
            onClick={probar}
            className="text-xs bg-ch-surface border border-ch-border text-ch-cream px-4 py-1.5 rounded-[2px] hover:border-ch-green hover:text-ch-green transition-colors ch-press"
          >
            Probar
          </button>
        </div>

        {reducido && (
          <p className="text-[11px] text-ch-gold border-t border-ch-border pt-4">
            Tu sistema pide movimiento reducido, así que las animaciones están desactivadas
            aunque las celebraciones estén encendidas. Se respeta siempre.
          </p>
        )}

      </div>
    </section>
  )
}
