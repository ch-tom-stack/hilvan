'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Prospecto, Profile } from '@/types'
import {
  ORIGENES_PROSPECTO,
  SCORES_PROSPECTO,
  ARQUETIPOS,
  PRODUCTOS_OBJETIVO,
} from '@/types'
import { crearProspecto, actualizarProspecto, type ProspectoInput } from '@/app/actions/crm'
import { toastOk, toastError } from '@/lib/toast'

interface Props {
  prospecto?: Prospecto
  responsables: Pick<Profile, 'id' | 'nombre'>[]
}

export default function FormProspecto({ prospecto, responsables }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // El servidor rechazó: el formulario se sacude. Sin esto el toast aparece en
  // una esquina y, si estabas mirando el botón, no te enteras de que falló.
  const [rechazado, setRechazado] = useState(false)
  const rechazar = () => {
    setRechazado(true)
    window.setTimeout(() => setRechazado(false), 420)   // dura lo que ch-shake
  }
  const esEdicion = !!prospecto

  const [form, setForm] = useState({
    empresa: prospecto?.empresa ?? '',
    nombre_contacto: prospecto?.nombre_contacto ?? '',
    email: prospecto?.email ?? '',
    telefono: prospecto?.telefono ?? '',
    origen: prospecto?.origen ?? '',
    arquetipo: prospecto?.arquetipo ?? '',
    responsable_id: prospecto?.responsable_id ?? '',
    score: prospecto?.score ?? '',
    decisor: prospecto?.decisor ?? '',
    angulo: prospecto?.angulo ?? '',
    producto_objetivo: prospecto?.producto_objetivo ?? '',
    notas: prospecto?.notas ?? '',
  })

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const submit = () => {
    if (!form.empresa.trim()) {
      toastError('La empresa es obligatoria')
      return
    }
    const payload: ProspectoInput = {
      empresa: form.empresa.trim(),
      nombre_contacto: form.nombre_contacto,
      email: form.email,
      telefono: form.telefono,
      origen: form.origen,
      arquetipo: form.arquetipo,
      responsable_id: form.responsable_id,
      score: form.score,
      decisor: form.decisor,
      angulo: form.angulo,
      producto_objetivo: form.producto_objetivo,
      notas: form.notas,
    }
    startTransition(async () => {
      try {
        if (esEdicion) {
          const res = await actualizarProspecto(prospecto!.id, payload)
          if (res.error) { toastError(res.error); rechazar(); return }
          toastOk('Prospecto actualizado')
          router.push(`/crm/${prospecto!.id}`)
        } else {
          const res = await crearProspecto(payload)
          if (res.error) { toastError(res.error); rechazar(); return }
          toastOk('Prospecto creado')
          router.push(`/crm/${res.id}`)
        }
        router.refresh()
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al guardar')
        rechazar()
      }
    })
  }

  return (
    <div className="p-6 lg:p-10 max-w-2xl">
      <div className="flex items-start justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            CRM · {esEdicion ? 'Editar' : 'Nuevo'}
          </p>
          <h1 className="font-display italic text-4xl text-ch-cream leading-none">
            {esEdicion ? 'Editar prospecto' : 'Nuevo prospecto'}
          </h1>
        </div>
        <Link
          href={esEdicion ? `/crm/${prospecto!.id}` : '/crm'}
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors"
        >
          ← Volver
        </Link>
      </div>

      <div className={`space-y-5 ${rechazado ? 'ch-shake' : ''}`}>
        <Campo label="Empresa / Marca" requerido>
          <input value={form.empresa} onChange={e => set('empresa', e.target.value)} autoFocus
            className="input-ch w-full" placeholder="Ej: Sodimac, Ripley…" />
        </Campo>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Nombre del contacto">
            <input value={form.nombre_contacto} onChange={e => set('nombre_contacto', e.target.value)} className="input-ch w-full" />
          </Campo>
          <Campo label="Decisor">
            <input value={form.decisor} onChange={e => set('decisor', e.target.value)} className="input-ch w-full"
              placeholder="Quién decide la contratación" />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Email">
            <input value={form.email} onChange={e => set('email', e.target.value)} type="email" className="input-ch w-full" />
          </Campo>
          <Campo label="Teléfono">
            <input value={form.telefono} onChange={e => set('telefono', e.target.value)} className="input-ch w-full" placeholder="+56 9 XXXX XXXX" />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Origen">
            <select value={form.origen} onChange={e => set('origen', e.target.value)} className="input-ch w-full capitalize">
              <option value="">— Sin definir —</option>
              {ORIGENES_PROSPECTO.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
            </select>
          </Campo>
          <Campo label="Responsable">
            <select value={form.responsable_id} onChange={e => set('responsable_id', e.target.value)} className="input-ch w-full">
              <option value="">— Sin asignar —</option>
              {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </Campo>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Campo label="Score">
            <select value={form.score} onChange={e => set('score', e.target.value)} className="input-ch w-full capitalize">
              <option value="">—</option>
              {SCORES_PROSPECTO.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
          </Campo>
          <Campo label="Arquetipo">
            <select value={form.arquetipo} onChange={e => set('arquetipo', e.target.value)} className="input-ch w-full">
              <option value="">—</option>
              {ARQUETIPOS.map(a => <option key={a} value={a}>{a.replace('_', ' ')}</option>)}
            </select>
          </Campo>
          <Campo label="Producto objetivo">
            <select value={form.producto_objetivo} onChange={e => set('producto_objetivo', e.target.value)} className="input-ch w-full">
              <option value="">—</option>
              {PRODUCTOS_OBJETIVO.map(p => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
            </select>
          </Campo>
        </div>

        <Campo label="Ángulo de acercamiento">
          <input value={form.angulo} onChange={e => set('angulo', e.target.value)} className="input-ch w-full"
            placeholder="El gancho: por qué Casa Hiedra para esta marca" />
        </Campo>

        <Campo label="Notas">
          <textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={3} className="input-ch w-full resize-none"
            placeholder="Contexto, observaciones…" />
        </Campo>

        <div className="pt-4 border-t border-ch-border">
          <button onClick={submit} disabled={isPending || !form.empresa.trim()}
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-8 py-3 transition-colors disabled:opacity-50">
            {isPending ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear prospecto'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Campo({ label, children, requerido }: { label: string; children: React.ReactNode; requerido?: boolean }) {
  return (
    <div>
      <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">
        {label}{requerido && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
