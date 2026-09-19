'use client'

import { useState, useTransition } from 'react'
import { responderPregunta } from '@/app/actions/crm-preguntas'
import type { PreguntaAbierta } from '@/lib/crm-preguntas-io'
import {
  RESPUESTAS, ETIQUETA_RESPUESTA, EFECTO_RESPUESTA, DIAS_POSTERGACION_DEFECTO,
  sumarDias, type RespuestaPregunta,
} from '@/lib/crm-preguntas'
import { formatFecha } from '@/lib/fechas'
import { toastError } from '@/lib/toast'

const TIPO_LEGIBLE: Record<string, string> = {
  correo: 'un correo', reunion: 'una reunión', llamada: 'una llamada', mensaje: 'un mensaje', lectura: 'una Lectura',
}

/**
 * "¿En qué quedó?" — se llega desde un botón del digest, con la respuesta ya
 * elegida. Nada se guarda hasta apretar Guardar.
 */
export default function ResponderPregunta({
  pregunta,
  inicial,
}: {
  pregunta: PreguntaAbierta
  inicial: RespuestaPregunta | null
}) {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  const [respuesta, setRespuesta] = useState<RespuestaPregunta | null>(inicial)
  const [detalle, setDetalle] = useState('')
  const [hasta, setHasta] = useState(sumarDias(hoy, DIAS_POSTERGACION_DEFECTO))
  const [canal, setCanal] = useState('mensaje')
  const [listo, setListo] = useState(false)
  const [pendiente, startTransition] = useTransition()

  const guardar = () => {
    if (!respuesta) { toastError('Elige qué pasó'); return }
    startTransition(async () => {
      try {
        const res = await responderPregunta({ token: pregunta.token, respuesta, detalle, hasta, canal })
        if (!res.ok) { toastError(res.error); return }
        setListo(true)
      } catch {
        toastError('No se pudo guardar. Intenta de nuevo.')
      }
    })
  }

  if (listo) {
    return (
      <div className="min-h-screen bg-ch-black flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted mb-2">Hilván · Casa Hiedra</p>
          <h1 className="font-display italic text-3xl text-ch-cream mb-3">Anotado</h1>
          <p className="font-body text-sm text-ch-muted">
            {pregunta.empresa}: {respuesta ? ETIQUETA_RESPUESTA[respuesta].toLowerCase() : ''}. Puedes cerrar esta página.
          </p>
        </div>
      </div>
    )
  }

  const contexto = pregunta.ultimaFecha
    ? `Lo último registrado es ${TIPO_LEGIBLE[pregunta.ultimoTipo ?? ''] ?? 'un contacto'} el ${formatFecha(pregunta.ultimaFecha, { day: 'numeric', month: 'long' })}${pregunta.dias !== null ? ` (hace ${pregunta.dias} días)` : ''}.`
    : 'No hay contactos registrados.'

  return (
    <div className="min-h-screen bg-ch-black px-5 py-10">
      <div className="max-w-md mx-auto">
        <p className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted mb-3">Hilván · CRM</p>
        <h1 className="font-display italic text-3xl text-ch-cream leading-tight">¿En qué quedó {pregunta.empresa}?</h1>
        <p className="font-body text-sm text-ch-muted mt-3">
          {contexto} Si pasó algo por WhatsApp, por teléfono o en persona, el CRM no lo sabe.
        </p>

        <div className="mt-7 flex flex-col gap-2" role="radiogroup" aria-label="Qué pasó">
          {RESPUESTAS.map(r => {
            const activo = respuesta === r
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => setRespuesta(r)}
                className={`text-left px-4 py-3 border rounded-[2px] transition-colors ${
                  activo ? 'border-ch-green bg-ch-green/10' : 'border-ch-border bg-ch-surface/40 hover:border-ch-muted'
                }`}
              >
                <span className={`font-body text-sm ${activo ? 'text-ch-cream' : 'text-ch-muted'}`}>{ETIQUETA_RESPUESTA[r]}</span>
                {activo && <span className="block font-body text-[11px] text-ch-muted mt-1 leading-relaxed">{EFECTO_RESPUESTA[r]}</span>}
              </button>
            )
          })}
        </div>

        {respuesta === 'planto' && pregunta.plantonesPrevios > 0 && (
          <p className="font-body text-xs text-ch-gold mt-4">
            Ya hay {pregunta.plantonesPrevios} plantón{pregunta.plantonesPrevios === 1 ? '' : 'es'} registrado{pregunta.plantonesPrevios === 1 ? '' : 's'} de este prospecto.
          </p>
        )}

        {respuesta === 'hablamos' && (
          <label className="block mt-5">
            <span className="font-body text-[9px] tracking-[0.5em] uppercase text-ch-muted">Por dónde</span>
            <select value={canal} onChange={e => setCanal(e.target.value)} className="input-ch w-full mt-2">
              <option value="mensaje">WhatsApp / mensaje</option>
              <option value="llamada">Llamada</option>
              <option value="reunion">En persona / reunión</option>
            </select>
          </label>
        )}

        {respuesta === 'postergo' && (
          <label className="block mt-5">
            <span className="font-body text-[9px] tracking-[0.5em] uppercase text-ch-muted">Retomar el</span>
            <input type="date" value={hasta} min={sumarDias(hoy, 1)} onChange={e => setHasta(e.target.value)} className="input-ch w-full mt-2" />
          </label>
        )}

        {respuesta && respuesta !== 'nada' && (
          <label className="block mt-5">
            <span className="font-body text-[9px] tracking-[0.5em] uppercase text-ch-muted">
              {respuesta === 'hablamos' ? 'Qué se habló' : 'Detalle'} <span className="normal-case tracking-normal">(opcional)</span>
            </span>
            <textarea
              value={detalle}
              onChange={e => setDetalle(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={respuesta === 'hablamos' ? 'Una línea basta: qué pidió, en qué quedaron.' : ''}
              className="input-ch w-full mt-2 resize-none"
            />
          </label>
        )}

        <button
          type="button"
          onClick={guardar}
          disabled={!respuesta || pendiente}
          className="w-full mt-7 font-body text-sm px-4 py-3 bg-ch-green text-ch-black hover:bg-ch-green-light transition-colors disabled:opacity-40 rounded-[2px]"
        >
          {pendiente ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
