'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toastError } from '@/lib/toast'
import {
  RodajeEquipoTecnico, RodajeCitacion,
  resolverHoraLlamado, formatHora, estadoCitacion,
} from '@/types'

// ─── Panel equipo ─────────────────────────────────────────────────────────────

export default function PanelEquipo({ equipo, rodaje, rodajeId, onPersonaAgregada }: {
  equipo: RodajeEquipoTecnico[]
  rodaje: any
  rodajeId: string
  onPersonaAgregada: () => void
}) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')

  const handleAgregar = async () => {
    if (!nombre.trim()) return
    setGuardando(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('rodaje_equipo_tecnico').insert({
        rodaje_id: rodajeId,
        nombre: nombre.trim(),
        rol: rol.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
      })
      if (error) throw error
      setNombre('')
      setRol('')
      setTelefono('')
      setEmail('')
      setMostrarForm(false)
      onPersonaAgregada()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al agregar persona')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="px-4 py-3 border-b border-ch-border flex items-center justify-between">
        <span className="text-xs text-ch-muted uppercase tracking-wider">Equipo técnico</span>
        <div className="flex gap-2">
          <button
            onClick={() => setMostrarForm(!mostrarForm)}
            className="text-xs bg-ch-cream text-ch-dark font-medium px-2.5 py-1 rounded-[2px] hover:bg-white transition-colors"
          >
            + Persona
          </button>
          <Link href={`/rodaje/${rodajeId}/equipo`} className="text-xs text-ch-subtle hover:text-ch-muted transition-colors py-1">
            Gestionar →
          </Link>
        </div>
      </div>

      {/* Form rápido */}
      {mostrarForm && (
        <div className="px-4 py-3 border-b border-ch-border bg-ch-surface/50 space-y-2">
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Nombre *"
            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-2 py-1.5 text-sm text-ch-cream focus:outline-none focus:border-ch-muted placeholder:text-ch-subtle"
            onKeyDown={e => { if (e.key === 'Enter') handleAgregar() }}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={rol}
              onChange={e => setRol(e.target.value)}
              placeholder="Rol / cargo"
              className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-2 py-1.5 text-xs text-ch-cream focus:outline-none focus:border-ch-muted placeholder:text-ch-subtle"
            />
            <input
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              placeholder="Teléfono"
              className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-2 py-1.5 text-xs text-ch-cream focus:outline-none focus:border-ch-muted placeholder:text-ch-subtle"
            />
          </div>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email (para citaciones)"
            type="email"
            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-2 py-1.5 text-xs text-ch-cream focus:outline-none focus:border-ch-muted placeholder:text-ch-subtle"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAgregar}
              disabled={guardando || !nombre.trim()}
              className="text-xs bg-ch-cream text-ch-dark font-medium px-3 py-1 rounded-[2px] hover:bg-white transition-colors disabled:opacity-50"
            >
              {guardando ? '...' : 'Agregar'}
            </button>
            <button onClick={() => setMostrarForm(false)} className="text-xs text-ch-subtle hover:text-ch-muted px-2">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {equipo.length === 0 && !mostrarForm ? (
        <div className="px-4 py-8 text-center text-ch-subtle text-sm">
          <p className="text-xs">Sin equipo agregado.</p>
        </div>
      ) : (
        <div className="divide-y divide-ch-border/20">
          {equipo.map((persona: any) => {
            const horaEfectiva = resolverHoraLlamado(persona, rodaje)
            const citacion: RodajeCitacion | undefined = Array.isArray(persona.citacion)
              ? persona.citacion[0] : persona.citacion
            const estado = citacion ? estadoCitacion(citacion) : null
            return (
              <div key={persona.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ch-cream truncate">{persona.nombre}</p>
                  <p className="text-xs text-ch-subtle truncate">{persona.rol}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-ch-muted">{horaEfectiva ? formatHora(horaEfectiva) : '—'}</p>
                  {estado && (
                    <span className={`text-xs ${estado.color === 'green' ? 'text-emerald-400' : estado.color === 'red' ? 'text-red-400' : estado.color === 'yellow' ? 'text-amber-400' : 'text-ch-border'}`}>
                      {estado.label}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="px-4 py-3 border-t border-ch-border">
        <Link href={`/rodaje/${rodajeId}/citaciones`} className="text-xs text-ch-cream hover:underline">
          Ver citaciones →
        </Link>
      </div>
    </div>
  )
}
