'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { crearColaborador } from '@/app/actions/colaboradores'

const ESPECIALIDADES_SUGERIDAS = [
  'Cámara', 'Dirección', 'Fotografía', 'Arte', 'Producción', 'Sonido',
  'Edición', 'Colorización', 'Modelo', 'Cast', 'Maquillaje', 'Vestuario',
  'Gaffer', 'Grip', 'VFX', 'Música', 'Locución', 'Otro',
]

export default function NuevoColaboradorPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    nombre: '', rut: '', email: '', telefono: '',
    tipo_persona: 'natural' as 'natural' | 'empresa',
    tipo_documento: '' as any,
    banco: '', tipo_cuenta: '' as any, numero_cuenta: '',
    especialidades: [] as string[],
    notas_internas: '',
    disponible: true, requiere_release: false,
  })

  const set = (campo: string, valor: any) => setForm(p => ({ ...p, [campo]: valor }))
  const toggleEsp = (esp: string) =>
    set('especialidades', form.especialidades.includes(esp)
      ? form.especialidades.filter(e => e !== esp)
      : [...form.especialidades, esp])

  const submit = () => {
    if (!form.nombre.trim()) return
    startTransition(async () => {
      const nuevo = await crearColaborador(form)
      router.push(`/colaboradores/${nuevo.id}`)
    })
  }

  return (
    <div className="p-6 lg:p-10 max-w-2xl">
      <div className="flex items-start justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">Colaboradores · Nuevo</p>
          <h1 className="font-display italic text-4xl text-ch-cream leading-none">Nueva ficha</h1>
        </div>
        <Link href="/colaboradores" className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors">
          ← Volver
        </Link>
      </div>

      <div className="space-y-5">
        <Campo label="Nombre completo" requerido>
          <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
            autoFocus className="input-ch w-full" />
        </Campo>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="RUT">
            <input value={form.rut} onChange={e => set('rut', e.target.value)}
              placeholder="12.345.678-9" className="input-ch w-full" />
          </Campo>
          <Campo label="Tipo de persona">
            <select value={form.tipo_persona} onChange={e => set('tipo_persona', e.target.value)}
              className="input-ch w-full">
              <option value="natural">Persona natural</option>
              <option value="empresa">Empresa</option>
            </select>
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Email">
            <input value={form.email} onChange={e => set('email', e.target.value)}
              type="email" className="input-ch w-full" />
          </Campo>
          <Campo label="Teléfono">
            <input value={form.telefono} onChange={e => set('telefono', e.target.value)}
              placeholder="+56 9 XXXX XXXX" className="input-ch w-full" />
          </Campo>
        </div>

        <Campo label="Tipo de documento habitual">
          <select value={form.tipo_documento} onChange={e => set('tipo_documento', e.target.value)}
            className="input-ch w-full">
            <option value="">— Seleccionar —</option>
            <option value="boleta">Boleta de honorarios</option>
            <option value="bet">BET</option>
            <option value="factura">Factura</option>
            <option value="sin_documento">Sin documento</option>
          </select>
        </Campo>

        <div>
          <p className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] mb-2">Especialidades</p>
          <div className="flex flex-wrap gap-2">
            {ESPECIALIDADES_SUGERIDAS.map(esp => (
              <button key={esp} type="button" onClick={() => toggleEsp(esp)}
                className={`font-body text-[10px] tracking-wider uppercase px-3 py-1.5 border transition-colors ${
                  form.especialidades.includes(esp) ? 'border-ch-green text-ch-cream bg-ch-green/10' : 'border-ch-border text-ch-muted hover:text-ch-cream'
                }`}>
                {esp}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.disponible} onChange={e => set('disponible', e.target.checked)}
              className="w-3.5 h-3.5 accent-ch-green" />
            <span className="font-body text-xs text-ch-muted">Disponible</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.requiere_release} onChange={e => set('requiere_release', e.target.checked)}
              className="w-3.5 h-3.5 accent-ch-green" />
            <span className="font-body text-xs text-ch-muted">Requiere release</span>
          </label>
        </div>

        <div className="pt-4 border-t border-ch-border">
          <button onClick={submit} disabled={isPending || !form.nombre.trim()}
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-8 py-3 transition-colors disabled:opacity-50">
            {isPending ? 'Creando...' : 'Crear colaborador'}
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
