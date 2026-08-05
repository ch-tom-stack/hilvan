'use client'

import { useState, useTransition } from 'react'
import type { Prospecto } from '@/types'
import { registrarInteraccion, type InteraccionInput } from '@/app/actions/crm'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'

function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

interface Props {
  prospecto: Prospecto
  onClose: () => void
  onSaved: () => void
}

// Registro rápido de un contacto (frío o con respuesta) desde el pipeline.
// Permite adjuntar el correo enviado para que el operador proponga el siguiente.
export default function QuickContacto({ prospecto, onClose, onSaved }: Props) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<InteraccionInput>({
    fecha: hoyISO(),
    tipo: 'correo',
    resumen: '',
    cuerpo: '',
    respondido: false,
    proximo_paso: '',
    fecha_proximo: '',
  })

  const set = (patch: Partial<InteraccionInput>) => setForm(p => ({ ...p, ...patch }))

  const submit = () => {
    if (!form.resumen?.trim() && !form.cuerpo?.trim()) {
      toastError('Escribe un resumen o pega el correo enviado')
      return
    }
    startTransition(async () => {
      try {
        const res = await registrarInteraccion(prospecto.id, form)
        if (res.error) { toastError(res.error); return }
        momento('crm.contacto')
        onSaved()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al registrar')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ch-black/70 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        className="bg-ch-dark border border-ch-border w-full max-w-lg mt-16 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5 gap-4">
          <div>
            <p className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-subtle mb-1">Registrar contacto</p>
            <h2 className="font-display italic text-2xl text-ch-cream leading-none">{prospecto.empresa}</h2>
          </div>
          <button onClick={onClose} className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted hover:text-ch-cream transition-colors">
            Cerrar
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Fecha</label>
              <input type="date" value={form.fecha} onChange={e => set({ fecha: e.target.value })} className="input-ch w-full" />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer font-body text-xs text-ch-cream">
                <input type="checkbox" checked={form.respondido} onChange={e => set({ respondido: e.target.checked })} />
                Tuvo respuesta
              </label>
            </div>
          </div>

          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Resumen</label>
            <input value={form.resumen} onChange={e => set({ resumen: e.target.value })} className="input-ch w-full"
              placeholder="Qué pasó en este toque" />
          </div>

          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Correo enviado</label>
            <textarea value={form.cuerpo} onChange={e => set({ cuerpo: e.target.value })} rows={5} className="input-ch w-full resize-none"
              placeholder="Pega acá el correo que enviaste (asunto + cuerpo)" />
          </div>

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

          <div className="flex gap-2 pt-2">
            <button onClick={submit} disabled={isPending}
              className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-2.5 transition-colors disabled:opacity-50">
              {isPending ? 'Guardando…' : 'Guardar contacto'}
            </button>
            <button onClick={onClose}
              className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
