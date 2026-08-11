'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Prospecto } from '@/types'
import { registrarToque, snoozeProspecto } from '@/app/actions/crm'
import { momento } from '@/lib/momentos'
import { prioridadCadencia } from '@/lib/crm-cadencia'
import { formatFecha } from '@/lib/fechas'

const CANALES: { tipo: string; label: string }[] = [
  { tipo: 'correo',  label: 'Correo'  },
  { tipo: 'llamada', label: 'Llamada' },
  { tipo: 'mensaje', label: 'Mensaje' },
  { tipo: 'reunion', label: 'Reunión' },
]

/** Cuántos se muestran de entrada: la lista tiene que ser terminable. */
const VISIBLES = 6

interface Props {
  prospectos: Prospecto[]
  /** id del usuario en sesión: la agenda muestra SUS prospectos. */
  usuarioId: string
}

/**
 * "Lo de hoy": la lista de contactos que vencen, por reglas de cadencia.
 *
 * Reemplaza a las tres sugerencias por heurística. La diferencia importa: antes
 * era "por dónde podrías empezar" y no se terminaba nunca; ahora es una lista
 * finita, con fecha de vencimiento real, que se vacía. Un día completo es un
 * hecho verificable, no una sensación.
 *
 * Quien contestó va primero y aparte: responder a alguien que habló es lo más
 * urgente que existe en un pipeline, y mezclarlo con el drip lo esconde.
 */
export default function AgendaDeHoy({ prospectos, usuarioId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [hechos, setHechos] = useState<Set<string>>(new Set())
  const [verTodo, setVerTodo] = useState(false)

  const pendientes = useMemo(() => (
    prospectos
      .filter(p => p.responsable?.id === usuarioId)
      .filter(p => p.etapa !== 'descartado' && p.etapa !== 'confirmado')
      .filter(p => p.cadencia?.pendiente)
      .sort((a, b) => prioridadCadencia(b.cadencia!) - prioridadCadencia(a.cadencia!))
  ), [prospectos, usuarioId])

  const total = pendientes.length
  const listos = pendientes.filter(p => hechos.has(p.id)).length
  const vivos = pendientes.filter(p => !hechos.has(p.id))
  const mostrados = verTodo ? vivos : vivos.slice(0, VISIBLES)

  if (total === 0) return null

  const tocar = (p: Prospecto, tipo: string) => {
    // Cerrar el último de la lista es la meta del día, no un contacto más.
    const completa = listos + 1 === total
    if (completa) momento('meta.cumplida', { mensaje: `Día cerrado · ${total} contacto${total === 1 ? '' : 's'}` })
    else momento('crm.contacto', { mensaje: '' })
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

  const posponer = (p: Prospecto) => {
    const dias = p.cadencia?.snoozeMax ?? 1
    setHechos(h => new Set(h).add(p.id))
    startTransition(async () => {
      const res = await snoozeProspecto(p.id, dias)
      if (res.error) {
        setHechos(h => { const n = new Set(h); n.delete(p.id); return n })
        momento('error', { mensaje: res.error })
        return
      }
      momento('guardado', { mensaje: `Pospuesto ${dias} día${dias === 1 ? '' : 's'}` })
      router.refresh()
    })
  }

  const pct = total ? Math.round((listos / total) * 100) : 0

  return (
    <div className="border border-ch-border bg-ch-surface/20 mb-6">
      {/* Cabecera con progreso: el día es finito y se ve cuánto falta. */}
      <div className="flex items-center justify-between gap-4 px-4 pt-3.5 pb-2">
        <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">
          Lo de hoy
        </p>
        <div className="flex items-center gap-3">
          <span className="font-body text-[10px] tracking-[0.15em] uppercase text-ch-subtle tabular-nums">
            {listos} de {total}
          </span>
          {/* ch-bar-fill llena desde 0 al montar. `transition-all` sola sólo
              anima los CAMBIOS: al cargar la página la barra ya aparecía llena,
              que es la diferencia entre ver un número y ver cuánto avanzaste. */}
          <div className="w-24 h-px bg-ch-border relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-ch-green transition-all duration-500 ch-bar-fill"
              style={{ width: `${pct}%`, ['--w' as string]: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {listos === total ? (
        <p className="px-4 pb-3.5 font-body text-xs text-ch-green ch-fade-up">
          Listo por hoy. {total} contacto{total === 1 ? '' : 's'} registrado{total === 1 ? '' : 's'}.
        </p>
      ) : (
        <div className="divide-y divide-ch-border/60 border-t border-ch-border/60">
          {mostrados.map((p, i) => {
            const c = p.cadencia!
            const respondio = c.estado === 'respondio'
            return (
              <div
                key={p.id}
                style={{ '--i': i } as React.CSSProperties}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 ch-fade-up ch-stagger ${respondio ? 'border-l-2 border-l-ch-gold' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => router.push(`/crm/${p.id}`)}
                  className="font-display italic text-lg text-ch-cream hover:text-ch-green transition-colors text-left truncate min-w-0 flex-1"
                >
                  {p.empresa}
                </button>

                <span className={`font-body text-[10px] tracking-[0.15em] uppercase shrink-0 ${
                  respondio ? 'text-ch-gold' : c.diasAtraso > 0 ? 'text-ch-gold' : 'text-ch-subtle'
                }`}>
                  {respondio
                    ? 'te respondió'
                    : c.estado === 'nunca'
                      ? 'sin tocar'
                      : c.diasAtraso > 0
                        ? `${c.diasAtraso} día${c.diasAtraso === 1 ? '' : 's'} atrasado`
                        : 'vence hoy'}
                </span>

                {c.ultimoToque && (
                  <span className="font-body text-[10px] text-ch-subtle shrink-0 hidden sm:inline">
                    último {formatFecha(c.ultimoToque)}
                  </span>
                )}

                <div className="flex gap-px shrink-0">
                  {CANALES.map(ca => (
                    <button
                      key={ca.tipo}
                      type="button"
                      disabled={isPending}
                      title={`Registrar ${ca.label.toLowerCase()} de hoy`}
                      onClick={() => tocar(p, ca.tipo)}
                      className="font-body text-[8px] tracking-[0.04em] uppercase text-ch-subtle hover:text-ch-green hover:bg-ch-green/10 transition-colors px-2 py-1.5 disabled:opacity-40 ch-press"
                    >
                      {ca.label}
                    </button>
                  ))}
                  {!respondio && (
                    <button
                      type="button"
                      disabled={isPending}
                      title={`Posponer ${c.snoozeMax} día${c.snoozeMax === 1 ? '' : 's'} (el máximo de este tramo)`}
                      onClick={() => posponer(p)}
                      className="font-body text-[8px] tracking-[0.04em] uppercase text-ch-subtle hover:text-ch-gold hover:bg-ch-gold/10 transition-colors px-2 py-1.5 disabled:opacity-40 ch-press"
                    >
                      +{c.snoozeMax}d
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {vivos.length > VISIBLES && (
            <button
              type="button"
              onClick={() => setVerTodo(v => !v)}
              className="w-full text-left px-4 py-2 font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream transition-colors"
            >
              {verTodo ? 'Ver menos' : `Ver los ${vivos.length - VISIBLES} restantes`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
