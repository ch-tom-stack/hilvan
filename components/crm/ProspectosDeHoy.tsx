'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Prospecto } from '@/types'
import { registrarToque } from '@/app/actions/crm'
import { momento } from '@/lib/momentos'
import { parseFechaLocal } from '@/lib/fechas'

const CANALES: { tipo: string; label: string }[] = [
  { tipo: 'correo',  label: 'Correo'  },
  { tipo: 'llamada', label: 'Llamada' },
  { tipo: 'mensaje', label: 'Mensaje' },
  { tipo: 'reunion', label: 'Reunión' },
]

function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

/** Días desde el último toque. `null` = nunca se ha tocado. */
function diasSinTocar(p: Prospecto): number | null {
  if (!p.ultima_interaccion) return null
  const ms = parseFechaLocal(hoyISO()).getTime() - parseFechaLocal(p.ultima_interaccion).getTime()
  return Math.max(0, Math.round(ms / 86400000))
}

interface Props {
  prospectos: Prospecto[]
  /** id del usuario en sesión: la franja muestra SUS prospectos. */
  usuarioId: string
}

/**
 * "Tus prospectos de hoy": tres sugerencias de por dónde empezar.
 *
 * No es una lista de tareas ni un recordatorio — es el equivalente honesto a
 * mostrar el premio: acá está lo que está a un click de sumar. Prioriza los
 * nunca tocados y luego los más fríos, que son los que se pierden.
 */
export default function ProspectosDeHoy({ prospectos, usuarioId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [hechos, setHechos] = useState<Set<string>>(new Set())

  const mios = prospectos
    .filter(p => p.responsable?.id === usuarioId)
    .filter(p => p.etapa !== 'descartado' && p.etapa !== 'confirmado')
    .filter(p => !hechos.has(p.id))
    .sort((a, b) => {
      // Nunca tocados primero; después, el más frío.
      const da = diasSinTocar(a), db = diasSinTocar(b)
      if (da === null && db !== null) return -1
      if (db === null && da !== null) return 1
      return (db ?? 0) - (da ?? 0)
    })
    .slice(0, 3)

  if (mios.length === 0) return null

  const tocar = (p: Prospecto, tipo: string) => {
    momento('crm.contacto', { mensaje: '' })
    setHechos(h => new Set(h).add(p.id))
    startTransition(async () => {
      const res = await registrarToque(p.id, tipo)
      if (res.error) {
        setHechos(h => { const n = new Set(h); n.delete(p.id); return n })
        momento('error', { mensaje: res.error })
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="border border-ch-border bg-ch-surface/20 mb-6">
      <div className="px-4 pt-3.5 pb-2">
        <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">
          Tus prospectos de hoy
        </p>
      </div>
      <div className="divide-y divide-ch-border/60 border-t border-ch-border/60">
        {mios.map((p, i) => {
          const d = diasSinTocar(p)
          return (
            <div
              key={p.id}
              style={{ '--i': i } as React.CSSProperties}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 ch-fade-up ch-stagger"
            >
              <button
                type="button"
                onClick={() => router.push(`/crm/${p.id}`)}
                className="font-display italic text-lg text-ch-cream hover:text-ch-green transition-colors text-left truncate min-w-0 flex-1"
              >
                {p.empresa}
              </button>

              <span className={`font-body text-[10px] tracking-[0.15em] uppercase shrink-0 ${d === null ? 'text-ch-gold' : 'text-ch-subtle'}`}>
                {d === null ? 'sin tocar' : d === 0 ? 'tocado hoy' : `${d} día${d === 1 ? '' : 's'}`}
              </span>

              <div className="flex gap-px shrink-0">
                {CANALES.map(c => (
                  <button
                    key={c.tipo}
                    type="button"
                    disabled={isPending}
                    title={`Registrar ${c.label.toLowerCase()} de hoy`}
                    onClick={() => tocar(p, c.tipo)}
                    className="font-body text-[8px] tracking-[0.04em] uppercase text-ch-subtle hover:text-ch-green hover:bg-ch-green/10 transition-colors px-2 py-1.5 disabled:opacity-40 ch-press"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
