'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { crearCliente, getClientes } from '@/app/actions/clientes'
import { useEffect } from 'react'
import type { Cliente } from '@/types'
import { momento } from '@/lib/momentos'

export default function NuevoClientePage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [form, setForm] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    rut: '',
    direccion: '',
    ciudad: '',
    pais: 'Chile',
    parent_id: '',
    notas: '',
  })

  useEffect(() => {
    getClientes().then(setClientes).catch(() => {})
  }, [])

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const submit = () => {
    if (!form.nombre.trim()) return
    startTransition(async () => {
      const nuevo = await crearCliente({
        nombre: form.nombre.trim(),
        empresa: form.empresa.trim() || undefined,
        email: form.email.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        rut: form.rut.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        ciudad: form.ciudad.trim() || null,
        pais: form.pais.trim() || 'Chile',
        parent_id: form.parent_id || null,
        notas: form.notas.trim() || null,
        created_by: undefined,
      })
      momento('creado', { mensaje: 'Cliente creado' })
      router.push(`/clientes/${nuevo.id}`)
    })
  }

  return (
    <div className="p-6 lg:p-10 max-w-2xl">
      <div className="flex items-start justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">Clientes · Nuevo</p>
          <h1 className="font-display italic text-4xl text-ch-cream leading-none">Nuevo cliente</h1>
        </div>
        <Link href="/clientes" className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
          ← Volver
        </Link>
      </div>

      <div className="space-y-5">
        <Campo label="Nombre" requerido>
          <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
            autoFocus className="input-ch w-full" placeholder="Ej: Ana García, Agencia Norte" />
        </Campo>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Empresa / Razón social">
            <input value={form.empresa} onChange={e => set('empresa', e.target.value)}
              className="input-ch w-full" placeholder="Ej: Falabella S.A." />
          </Campo>
          <Campo label="RUT">
            <input value={form.rut} onChange={e => set('rut', e.target.value)}
              className="input-ch w-full" placeholder="76.123.456-7" />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Email">
            <input value={form.email} onChange={e => set('email', e.target.value)}
              type="email" className="input-ch w-full" />
          </Campo>
          <Campo label="Teléfono">
            <input value={form.telefono} onChange={e => set('telefono', e.target.value)}
              className="input-ch w-full" placeholder="+56 9 XXXX XXXX" />
          </Campo>
        </div>

        <Campo label="Dirección">
          <input value={form.direccion} onChange={e => set('direccion', e.target.value)}
            className="input-ch w-full" placeholder="Calle, número, oficina" />
        </Campo>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Ciudad">
            <input value={form.ciudad} onChange={e => set('ciudad', e.target.value)}
              className="input-ch w-full" placeholder="Santiago" />
          </Campo>
          <Campo label="País">
            <input value={form.pais} onChange={e => set('pais', e.target.value)}
              className="input-ch w-full" />
          </Campo>
        </div>

        {clientes.length > 0 && (
          <Campo label="Cliente padre (opcional)">
            <select value={form.parent_id} onChange={e => set('parent_id', e.target.value)}
              className="input-ch w-full">
              <option value="">— Sin padre —</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre}{c.empresa ? ` · ${c.empresa}` : ''}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <Campo label="Notas internas">
          <textarea value={form.notas} onChange={e => set('notas', e.target.value)}
            rows={3} className="input-ch w-full resize-none"
            placeholder="Observaciones, contexto del cliente…" />
        </Campo>

        <div className="pt-4 border-t border-ch-border">
          <button onClick={submit} disabled={isPending || !form.nombre.trim()}
            className="bg-ch-cream hover:bg-white text-ch-dark font-body font-medium text-[10px] tracking-[0.35em] uppercase px-8 py-3 transition-colors disabled:opacity-50 ch-press">
            {isPending ? 'Creando…' : 'Crear cliente'}
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
