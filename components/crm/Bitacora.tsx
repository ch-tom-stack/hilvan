'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CrmInteraccion } from '@/types'
import { TIPOS_INTERACCION } from '@/types'
import { registrarInteraccion, registrarToque, eliminarInteraccion, type InteraccionInput } from '@/app/actions/crm'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import { formatFecha, parseFechaLocal } from '@/lib/fechas'

function hoyISO(): string {
  // Fecha local de Chile en formato YYYY-MM-DD (sin correrse por UTC)
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

function estaVencida(fecha?: string | null): boolean {
  if (!fecha) return false
  return parseFechaLocal(fecha).getTime() < parseFechaLocal(hoyISO()).getTime()
}

// Mismos cuatro canales que la tarjeta del Kanban: el toque se registra igual
// desde el tablero que desde la ficha.
const CANALES_RAPIDOS: { tipo: string; label: string }[] = [
  { tipo: 'correo',  label: 'Correo'  },
  { tipo: 'llamada', label: 'Llamada' },
  { tipo: 'mensaje', label: 'Mensaje' },
  { tipo: 'reunion', label: 'Reunión' },
]

interface Props {
  prospectoId: string
  interacciones: CrmInteraccion[]
}

export default function Bitacora({ prospectoId, interacciones }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [abierto, setAbierto] = useState(false)

  const tocarRapido = (tipo: string) => {
    momento('crm.contacto', { mensaje: '' })
    startTransition(async () => {
      const res = await registrarToque(prospectoId, tipo)
      if (res.error) { momento('error', { mensaje: res.error }); return }
      router.refresh()
    })
  }
  const [form, setForm] = useState<InteraccionInput>({
    fecha: hoyISO(),
    tipo: 'correo',
    resumen: '',
    cuerpo: '',
    respondido: false,
    proximo_paso: '',
    fecha_proximo: '',
  })

  const [borrar, setBorrar] = useState<string | null>(null)

  const set = (patch: Partial<InteraccionInput>) => setForm(p => ({ ...p, ...patch }))

  const eliminar = (id: string) => {
    startTransition(async () => {
      try {
        const res = await eliminarInteraccion(id, prospectoId)
        if (res.error) { toastError(res.error); return }
        momento('eliminado', { mensaje: 'Contacto eliminado' })
        setBorrar(null)
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al eliminar')
      }
    })
  }

  const submit = () => {
    if (!form.resumen?.trim()) {
      toastError('Escribe un resumen de la interacción')
      return
    }
    startTransition(async () => {
      try {
        const res = await registrarInteraccion(prospectoId, form)
        if (res.error) { toastError(res.error); return }
        momento('crm.contacto', { mensaje: 'Interacción registrada' })
        setForm({ fecha: hoyISO(), tipo: 'correo', resumen: '', cuerpo: '', respondido: false, proximo_paso: '', fecha_proximo: '' })
        setAbierto(false)
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al registrar')
      }
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted">Bitácora</h2>
        <button
          onClick={() => setAbierto(!abierto)}
          className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-green hover:text-ch-green-light transition-colors"
        >
          {abierto ? 'Cancelar' : '+ Registrar'}
        </button>
      </div>

      {abierto && (
        <div className="border border-ch-border bg-ch-surface/30 p-4 mb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Fecha</label>
              <input type="date" value={form.fecha} onChange={e => set({ fecha: e.target.value })} className="input-ch w-full" />
            </div>
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Tipo</label>
              <select value={form.tipo} onChange={e => set({ tipo: e.target.value })} className="input-ch w-full capitalize">
                {TIPOS_INTERACCION.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Resumen</label>
            <textarea value={form.resumen} onChange={e => set({ resumen: e.target.value })} rows={2} className="input-ch w-full resize-none"
              placeholder="Qué pasó en este toque" />
          </div>
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Correo enviado</label>
            <textarea value={form.cuerpo} onChange={e => set({ cuerpo: e.target.value })} rows={4} className="input-ch w-full resize-none"
              placeholder="Pega acá el correo que enviaste (opcional)" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer font-body text-xs text-ch-cream">
            <input type="checkbox" checked={form.respondido} onChange={e => set({ respondido: e.target.checked })} />
            Tuvo respuesta
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Próximo paso</label>
              <input value={form.proximo_paso} onChange={e => set({ proximo_paso: e.target.value })} className="input-ch w-full"
                placeholder="Qué sigue" />
            </div>
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Fecha próximo paso</label>
              <input type="date" value={form.fecha_proximo} onChange={e => set({ fecha_proximo: e.target.value })} className="input-ch w-full" />
            </div>
          </div>
          <button onClick={submit} disabled={isPending || !form.resumen?.trim()}
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-2.5 transition-colors disabled:opacity-50">
            {isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}

      {interacciones.length === 0 ? (
        // El estado vacío más visto de toda la app: con 1 contacto en la base
        // aparece en 29 de 30 fichas. Debe enseñar y ofrecer la acción, no
        // limitarse a informar la nada.
        <div className="border border-dashed border-ch-border p-5 ch-fade-up">
          <p className="font-display italic text-xl text-ch-cream mb-1.5">
            Sin contactos registrados
          </p>
          <p className="font-body text-xs text-ch-muted leading-relaxed mb-4 max-w-md">
            Cada toque que anotas alimenta la Biblioteca: es lo que después dice
            a qué contacto suelen cerrar los prospectos y cuáles se están
            enfriando. Registra el primero con un click.
          </p>
          <div className="flex flex-wrap gap-2">
            {CANALES_RAPIDOS.map(c => (
              <button
                key={c.tipo}
                type="button"
                disabled={isPending}
                onClick={() => tocarRapido(c.tipo)}
                className="border border-ch-border text-ch-muted hover:text-ch-green hover:border-ch-green/50 font-body text-[10px] tracking-[0.2em] uppercase px-3.5 py-2 transition-colors disabled:opacity-40 ch-press"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ol className="space-y-0">
          {interacciones.map(i => {
            const vencida = estaVencida(i.fecha_proximo)
            return (
              <li key={i.id} className="border-l border-ch-border pl-4 pb-5 relative">
                <span className="absolute left-0 top-1.5 -translate-x-1/2 w-1.5 h-1.5 bg-ch-muted" />
                <div className="flex items-center gap-3 mb-1">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {i.tipo && (
                      <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle border border-ch-border px-2 py-0.5 capitalize">
                        {i.tipo}
                      </span>
                    )}
                    {i.respondido && (
                      <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-green border border-ch-green px-2 py-0.5">
                        Respondido
                      </span>
                    )}
                    <span className="font-body text-[11px] text-ch-muted">{formatFecha(i.fecha)}</span>
                  </div>
                  {borrar === i.id ? (
                    <span className="flex items-center gap-2 shrink-0">
                      <button onClick={() => eliminar(i.id)} disabled={isPending}
                        className="font-body text-[9px] tracking-[0.2em] uppercase text-red-400 hover:text-red-300 disabled:opacity-50">
                        Eliminar
                      </button>
                      <button onClick={() => setBorrar(null)}
                        className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream">
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button onClick={() => setBorrar(i.id)} title="Eliminar contacto"
                      className="shrink-0 font-body text-xs text-ch-subtle hover:text-red-400 transition-colors leading-none">
                      ✕
                    </button>
                  )}
                </div>
                {i.resumen && <p className="font-body text-sm text-ch-cream mb-1">{i.resumen}</p>}
                {i.cuerpo && (
                  <details className="mb-1">
                    <summary className="font-body text-[10px] tracking-[0.2em] uppercase text-ch-subtle hover:text-ch-cream cursor-pointer">
                      Ver correo enviado
                    </summary>
                    <p className="font-body text-xs text-ch-muted whitespace-pre-wrap mt-1 border-l border-ch-border pl-3">{i.cuerpo}</p>
                  </details>
                )}
                {i.proximo_paso && (
                  <p className="font-body text-xs text-ch-muted">
                    <span className="text-ch-subtle">Próximo: </span>
                    {i.proximo_paso}
                    {i.fecha_proximo && (
                      <span className={`ml-1 ${vencida ? 'text-ch-gold font-medium' : 'text-ch-subtle'}`}>
                        · {formatFecha(i.fecha_proximo)}{vencida ? ' (vencido)' : ''}
                      </span>
                    )}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
