'use client'

import { useState, useTransition } from 'react'
import { crearReunionManual } from '@/app/actions/reuniones'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'

export default function NuevaReunionModal() {
  const [abierto, setAbierto] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [motivo, setMotivo] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [duracion, setDuracion] = useState(30)

  const limpiar = () => { setNombre(''); setEmail(''); setMotivo(''); setFecha(''); setHora(''); setDuracion(30) }
  const cerrar = () => { if (!isPending) { setAbierto(false); limpiar() } }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim() || !email.trim() || !fecha || !hora) {
      toastError('Completa nombre, email, fecha y hora')
      return
    }
    // fecha+hora en hora de Santiago → se manda como ISO local, el server la interpreta con Date().
    const inicio = new Date(`${fecha}T${hora}:00`)
    if (Number.isNaN(inicio.getTime())) { toastError('Fecha/hora inválida'); return }

    startTransition(async () => {
      try {
        const r = await crearReunionManual({
          nombre: nombre.trim(), email: email.trim(), motivo: motivo.trim() || undefined,
          inicio: inicio.toISOString(), duracionMin: duracion,
        })
        if (r.error) { toastError(r.error); return }
        momento('creado', { mensaje: 'Reunión creada y agendada en el calendario' })
        setAbierto(false)
        limpiar()
      } catch (e: any) {
        toastError(e?.message || 'No se pudo crear la reunión')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="font-body text-[11px] tracking-[0.15em] uppercase px-4 py-2.5 bg-ch-green text-ch-black hover:bg-ch-green-light transition-colors shrink-0"
      >
        + Nueva reunión
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={cerrar} />
          <div className="relative w-full max-w-md h-full bg-ch-dark border-l border-ch-border overflow-y-auto">
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-body text-sm font-medium text-ch-cream">Nueva reunión</h2>
                <button type="button" onClick={cerrar} className="text-ch-muted hover:text-ch-cream text-lg">✕</button>
              </div>

              <p className="font-body text-xs text-ch-muted -mt-2">
                Se crea directo en el calendario de reuniones (con Meet) y queda registrada acá. A diferencia de la reserva pública, puedes elegir cualquier horario libre.
              </p>

              <div>
                <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-1.5">Nombre</label>
                <input
                  value={nombre} onChange={e => setNombre(e.target.value)} required
                  className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
                />
              </div>

              <div>
                <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-1.5">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-1.5">Fecha</label>
                  <input
                    type="date" value={fecha} onChange={e => setFecha(e.target.value)} required
                    className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
                  />
                </div>
                <div>
                  <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-1.5">Hora</label>
                  <input
                    type="time" value={hora} onChange={e => setHora(e.target.value)} required
                    className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
                  />
                </div>
              </div>

              <div>
                <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-1.5">Duración</label>
                <select
                  value={duracion} onChange={e => setDuracion(Number(e.target.value))}
                  className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
                >
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>

              <div>
                <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-1.5">Motivo (opcional)</label>
                <textarea
                  value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
                  className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40 resize-none"
                />
              </div>

              <button
                type="submit" disabled={isPending}
                className="w-full font-body text-[11px] tracking-[0.15em] uppercase px-4 py-3 bg-ch-green text-ch-black hover:bg-ch-green-light transition-colors disabled:opacity-50"
              >
                {isPending ? 'Creando…' : 'Crear y agendar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
