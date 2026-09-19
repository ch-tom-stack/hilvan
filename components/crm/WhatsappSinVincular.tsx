'use client'

import { useState, useTransition } from 'react'
import { resolverWhatsappDesconocido, type WhatsappDesconocido } from '@/app/actions/whatsapp'
import { formatFecha } from '@/lib/fechas'
import { toastOk, toastError } from '@/lib/toast'

/**
 * Números que hablaron con el WhatsApp de la empresa y no calzan con nadie del CRM.
 *
 * De ellos NO se guarda la conversación — solo el número, el nombre de perfil y
 * las fechas — hasta que alguien diga de quién son. Por eso esto vive arriba del
 * tablero: mientras un número esté acá, lo que ese prospecto escribe se pierde.
 */
export default function WhatsappSinVincular({
  desconocidos,
  prospectos,
}: {
  desconocidos: WhatsappDesconocido[]
  prospectos: { id: string; empresa: string }[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [eleccion, setEleccion] = useState<Record<string, string>>({})
  const [resueltos, setResueltos] = useState<Set<string>>(new Set())
  const [pendiente, startTransition] = useTransition()

  const visibles = desconocidos.filter(d => !resueltos.has(d.telefono))
  if (visibles.length === 0) return null

  const resolver = (telefono: string, accion: 'vincular' | 'ignorar') => {
    const prospecto_id = eleccion[telefono]
    if (accion === 'vincular' && !prospecto_id) { toastError('Elige de qué prospecto es el número'); return }
    startTransition(async () => {
      try {
        const res = await resolverWhatsappDesconocido({ telefono, accion, prospecto_id })
        if (!res.ok) { toastError(res.error); return }
        setResueltos(prev => new Set(prev).add(telefono))
        toastOk(accion === 'vincular'
          ? `Vinculado a ${res.empresa ?? 'el prospecto'}: desde ahora su WhatsApp entra al CRM`
          : 'Listo: no se volverá a preguntar por ese número')
      } catch {
        toastError('No se pudo guardar la decisión')
      }
    })
  }

  return (
    <div className="border border-ch-border bg-ch-surface/40 px-4 py-3 mb-6">
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="font-body text-xs text-ch-cream">
          {visibles.length === 1
            ? '1 número de WhatsApp sin vincular'
            : `${visibles.length} números de WhatsApp sin vincular`}
          <span className="text-ch-muted"> — lo que escriban no entra al CRM hasta saber de quién son</span>
        </span>
        <span className="font-body text-[11px] text-ch-muted shrink-0">{abierto ? 'Cerrar' : 'Revisar'}</span>
      </button>

      {abierto && (
        <ul className="mt-3 divide-y divide-ch-border">
          {visibles.map(d => (
            <li key={d.telefono} className="py-3 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="min-w-0 lg:w-64 shrink-0">
                <p className="font-body text-sm text-ch-cream truncate">{d.nombre_perfil || 'Sin nombre de perfil'}</p>
                <p className="font-body text-[11px] text-ch-muted">
                  +{d.telefono} · {d.mensajes} {d.mensajes === 1 ? 'mensaje' : 'mensajes'} · último{' '}
                  {formatFecha(d.ultimo_mensaje, { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <select
                value={eleccion[d.telefono] ?? ''}
                onChange={e => setEleccion(prev => ({ ...prev, [d.telefono]: e.target.value }))}
                className="input-ch flex-1 min-w-0"
                aria-label="Prospecto al que pertenece el número"
              >
                <option value="">¿De qué prospecto es?</option>
                {prospectos.map(p => <option key={p.id} value={p.id}>{p.empresa}</option>)}
              </select>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => resolver(d.telefono, 'vincular')}
                  className="font-body text-xs px-3 py-2 bg-ch-green text-ch-black hover:bg-ch-green-light transition-colors disabled:opacity-50 rounded-[2px]"
                >
                  Vincular
                </button>
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => resolver(d.telefono, 'ignorar')}
                  className="font-body text-xs px-3 py-2 border border-ch-border text-ch-muted hover:text-ch-cream transition-colors disabled:opacity-50 rounded-[2px]"
                >
                  No es venta
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
