'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Prospecto } from '@/types'
import { asignarResponsableMasivo, repartirPorReglas } from '@/app/actions/crm'
import { momento } from '@/lib/momentos'

interface Props {
  /** Prospectos sin responsable. */
  huerfanos: Prospecto[]
  /** [id, nombre] de quienes ya trabajan el pipeline. */
  responsables: [string, string][]
}

/**
 * Reparto de prospectos sin dueño.
 *
 * Aparece solo cuando hay huérfanos y desaparece cuando no queda ninguno: no es
 * un módulo permanente, es un pendiente que se puede terminar. Sin dueño no hay
 * lista y sin lista nadie contacta a nadie.
 */
export default function RepartirProspectos({ huerfanos, responsables }: Props) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [responsable, setResponsable] = useState('')
  const [isPending, startTransition] = useTransition()

  if (huerfanos.length === 0) return null

  const alternar = (id: string) =>
    setSel(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  const todos = sel.size === huerfanos.length
  const alternarTodos = () =>
    setSel(todos ? new Set() : new Set(huerfanos.map(h => h.id)))

  // Las reglas se niegan a asignar sin tamaño y rubro —adivinar es peor que
  // esperar—, así que estos no los reparte nadie hasta clasificarlos. Decirlo
  // antes de apretar evita el botón que "no hace nada".
  const sinClasificar = huerfanos.filter(h => !h.tamano || !h.rubro)
  const ningunoReparte = sinClasificar.length === huerfanos.length

  const porReglas = () => {
    startTransition(async () => {
      const res = await repartirPorReglas()
      if (res.error) { momento('error', { mensaje: res.error }); return }
      const r = res.resultado!

      // Cuando no se asignó nada, el reparto NO fue un éxito silencioso: las
      // reglas se negaron a adivinar. Un toast verde diciendo "0 asignados" se
      // lee como un botón roto, que es justo lo que pasó.
      if (r.asignados === 0) {
        momento('error', {
          mensaje: r.porClasificar === 1
            ? 'Sin repartir: al prospecto le falta tamaño y rubro. Clasifícalo primero.'
            : `Sin repartir: a ${r.porClasificar} les falta tamaño y rubro. Clasifícalos primero.`,
        })
        return
      }

      momento('guardado', {
        mensaje: `${r.asignados} asignado${r.asignados === 1 ? '' : 's'} por reglas${r.porClasificar ? ` · ${r.porClasificar} sin clasificar, quedan pendientes` : ''}`,
      })
      router.refresh()
    })
  }

  const asignar = () => {
    if (!responsable || sel.size === 0) return
    const ids = [...sel]
    startTransition(async () => {
      const res = await asignarResponsableMasivo(ids, responsable)
      if (res.error) { momento('error', { mensaje: res.error }); return }
      const nombre = responsables.find(([id]) => id === responsable)?.[1] ?? ''
      momento('guardado', {
        mensaje: `${res.n} prospecto${res.n === 1 ? '' : 's'} para ${nombre}`,
      })
      setSel(new Set())
      router.refresh()
    })
  }

  return (
    <div className="border border-ch-gold/40 bg-ch-gold/5 mb-6">
      <div className="flex items-center justify-between gap-4 px-4 py-3 flex-wrap">
        <span className="font-body text-xs text-ch-gold">
          {huerfanos.length} prospecto{huerfanos.length === 1 ? '' : 's'} sin responsable
          <span className="text-ch-muted"> · nadie sabe a quién le toca contactarlos</span>
        </span>
        <div className="flex items-center gap-4 shrink-0">
          <button
            type="button"
            onClick={porReglas}
            disabled={isPending || ningunoReparte}
            title={ningunoReparte
              ? 'Las reglas necesitan tamaño y rubro para decidir. Clasifícalos primero, o asigna a mano.'
              : undefined}
            className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-gold hover:text-ch-gold-light transition-colors ch-press disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Repartiendo…' : 'Repartir por reglas'}
          </button>
          <button
            type="button"
            onClick={() => setAbierto(a => !a)}
            className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream transition-colors ch-press"
          >
            {abierto ? 'Cerrar' : 'Manual'}
          </button>
        </div>
      </div>

      {sinClasificar.length > 0 && (
        <p className="px-4 pb-3 -mt-1 font-body text-[11px] text-ch-muted leading-relaxed">
          {ningunoReparte ? 'Ninguno se puede repartir por reglas' : `${sinClasificar.length} no se pueden repartir por reglas`}:
          les falta <span className="text-ch-cream">tamaño y rubro</span>, y sin eso las reglas no adivinan a quién le toca.
          Clasifícalos —{' '}
          {sinClasificar.map((h, i) => (
            <span key={h.id}>
              {i > 0 && ', '}
              <Link href={`/crm/${h.id}`} className="text-ch-gold hover:text-ch-gold-light transition-colors">
                {h.empresa}
              </Link>
            </span>
          ))}
          {' '}— o asígnalos a mano.
        </p>
      )}

      {abierto && (
        <div className="px-4 pb-4 border-t border-ch-gold/20 pt-3 ch-fade-up">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <button
              type="button"
              onClick={alternarTodos}
              className="font-body text-[10px] tracking-[0.2em] uppercase text-ch-muted hover:text-ch-cream transition-colors ch-press"
            >
              {todos ? 'Ninguno' : 'Todos'}
            </button>
            <select
              value={responsable}
              onChange={e => setResponsable(e.target.value)}
              className="input-ch text-xs py-1"
            >
              <option value="">Asignar a…</option>
              {responsables.map(([id, nombre]) => (
                <option key={id} value={id}>{nombre}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={asignar}
              disabled={isPending || !responsable || sel.size === 0}
              className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.3em] uppercase px-4 py-2 transition-colors disabled:opacity-40 ch-press"
            >
              {isPending ? 'Asignando…' : `Asignar ${sel.size || ''}`}
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-px">
            {huerfanos.map(h => (
              <label
                key={h.id}
                className="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer hover:bg-ch-surface/40 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={sel.has(h.id)}
                  onChange={() => alternar(h.id)}
                />
                <span className="font-body text-xs text-ch-cream truncate">{h.empresa}</span>
                {h.nombre_contacto && (
                  <span className="font-body text-[10px] text-ch-subtle truncate">{h.nombre_contacto}</span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
