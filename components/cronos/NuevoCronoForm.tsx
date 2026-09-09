'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { crearCrono } from '@/app/actions/cronos'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'

const inputCls = 'w-full bg-ch-surface border border-ch-border text-ch-cream font-body text-sm px-3 py-2 focus:outline-none focus:border-ch-cream/40 transition-colors placeholder:text-ch-subtle'

export default function NuevoCronoForm({ proyectos, proyectoInicial }: { proyectos: { id: string; nombre: string }[]; proyectoInicial?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [nombre, setNombre] = useState('')
  const [proyectoId, setProyectoId] = useState(proyectoInicial && proyectos.some((p) => p.id === proyectoInicial) ? proyectoInicial : '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) { toastError('Ponle un nombre al crono'); return }
    startTransition(async () => {
      try {
        const r = await crearCrono({ nombre: nombre.trim(), proyecto_id: proyectoId || null })
        if (r.error || !r.id) { toastError(r.error ?? 'No se pudo crear el crono'); return }
        momento('item.agregado', { mensaje: 'Crono creado' })
        router.push(`/cronos/${r.id}`)
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'No se pudo crear el crono')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md flex flex-col gap-5">
      <div>
        <label className="block font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1.5">Nombre</label>
        <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ellesse · Campaña Primavera 2027" className={inputCls} />
      </div>
      <div>
        <label className="block font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1.5">Proyecto (opcional)</label>
        <select value={proyectoId} onChange={(e) => setProyectoId(e.target.value)} className={inputCls}>
          <option value="">Sin proyecto — se puede vincular después</option>
          {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={isPending} className="font-body text-[10px] tracking-[0.3em] uppercase px-5 py-3 bg-ch-green text-ch-black hover:bg-ch-green-light transition-colors disabled:opacity-50 ch-press">
          {isPending ? 'Creando…' : 'Crear crono'}
        </button>
        <Link href="/cronos" className="font-body text-xs text-ch-muted hover:text-ch-cream transition-colors">Cancelar</Link>
      </div>
    </form>
  )
}
