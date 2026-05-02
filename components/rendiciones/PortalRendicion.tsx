'use client'

import { useState, useTransition, useRef } from 'react'
import { crearRendicion } from '@/app/actions/rendiciones'
import { calcularRetencion } from '@/types'
import type { Rendicion, TipoRendicion, TipoDocRendicion } from '@/types'
import { createClient } from '@/lib/supabase/client'

const TIPOS: { value: TipoRendicion; label: string; icon: string }[] = [
  { value: 'honorarios', label: 'Honorarios', icon: '💼' },
  { value: 'transporte', label: 'Transporte', icon: '🚗' },
  { value: 'alimentacion', label: 'Alimentación', icon: '🍽' },
  { value: 'arte', label: 'Arte / Props', icon: '🎨' },
  { value: 'factura', label: 'Factura', icon: '🧾' },
  { value: 'otro', label: 'Otro', icon: '📎' },
]

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'text-amber-400 border-amber-500/30',
  aprobada: 'text-ch-green border-ch-green/30',
  rechazada: 'text-red-400 border-red-500/30',
}

interface Props {
  token: string
  colaboradorId: string
  colaboradorNombre: string
  rodaje: { id: string; nombre: string; fecha?: string } | null
  rendiciones: Rendicion[]
}

export default function PortalRendicion({ token, colaboradorId, colaboradorNombre, rodaje, rendiciones: inicial }: Props) {
  const [rendiciones, setRendiciones] = useState(inicial)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [enviado, setEnviado] = useState(false)

  const [form, setForm] = useState({
    tipo: '' as TipoRendicion | '',
    monto: '',
    descripcion: '',
    tipo_documento: '' as TipoDocRendicion | '',
    notas: '',
    foto_url: '',
  })
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (campo: string, valor: any) => setForm(p => ({ ...p, [campo]: valor }))

  const subirFoto = async (file: File) => {
    setSubiendo(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `rendiciones/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('rendiciones').upload(path, file)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('rendiciones').getPublicUrl(path)
      set('foto_url', publicUrl)
      setFotoPreview(URL.createObjectURL(file))
    } finally {
      setSubiendo(false)
    }
  }

  const enviar = () => {
    if (!rodaje || !form.tipo || !form.monto || !form.descripcion || !form.foto_url) return
    startTransition(async () => {
      const nueva = await crearRendicion({
        rodaje_id: rodaje.id,
        colaborador_id: colaboradorId,
        tipo: form.tipo as TipoRendicion,
        descripcion: form.descripcion,
        monto: parseInt(form.monto),
        foto_url: form.foto_url,
        tipo_documento: form.tipo_documento || undefined,
        notas: form.notas || undefined,
      })
      setRendiciones(prev => [nueva, ...prev])
      setMostrarForm(false)
      setEnviado(true)
      setForm({ tipo: '', monto: '', descripcion: '', tipo_documento: '', notas: '', foto_url: '' })
      setFotoPreview(null)
      setTimeout(() => setEnviado(false), 4000)
    })
  }

  return (
    <div className="min-h-screen bg-ch-black">
      <div className="max-w-lg mx-auto p-4 pt-10">
        {/* Header */}
        <div className="mb-8">
          <p className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted mb-1">Casa Hiedra · Portal</p>
          <h1 className="font-display italic text-3xl text-ch-cream leading-tight mb-0.5">Hola, {colaboradorNombre}</h1>
          {rodaje && (
            <p className="font-body text-sm text-ch-muted">
              {rodaje.nombre}{rodaje.fecha ? ` · ${rodaje.fecha}` : ''}
            </p>
          )}
        </div>

        {/* Éxito */}
        {enviado && (
          <div className="border border-ch-green/30 bg-ch-green/10 p-4 mb-6">
            <p className="font-body text-xs text-ch-green">✓ Rendición enviada correctamente. Te avisaremos cuando sea revisada.</p>
          </div>
        )}

        {/* CTA agregar */}
        {rodaje && (
          <button
            onClick={() => setMostrarForm(!mostrarForm)}
            className="w-full bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase py-3 mb-6 transition-colors">
            + Agregar gasto
          </button>
        )}

        {!rodaje && (
          <div className="border border-dashed border-ch-border p-8 text-center mb-6">
            <p className="font-body text-sm text-ch-muted">Este enlace no está asociado a un rodaje específico. Contacta al equipo de producción.</p>
          </div>
        )}

        {/* Formulario */}
        {mostrarForm && (
          <div className="border border-ch-border bg-ch-surface/20 p-5 mb-6 space-y-4">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Nuevo gasto · {rodaje?.nombre}</p>

            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-2">Tipo *</label>
              <div className="grid grid-cols-3 gap-2">
                {TIPOS.map(t => (
                  <button key={t.value} type="button" onClick={() => set('tipo', t.value)}
                    className={`py-2 px-2 border font-body text-xs transition-colors text-left ${form.tipo === t.value ? 'border-ch-green text-ch-cream bg-ch-green/10' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`}>
                    <span className="mr-1">{t.icon}</span>{t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Monto CLP *</label>
              <input value={form.monto} onChange={e => set('monto', e.target.value)}
                type="number" placeholder="150000" className="input-ch w-full font-mono text-lg" />
            </div>

            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Descripción *</label>
              <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
                rows={2} placeholder="Ej: Gasolina ida/vuelta locación" className="input-ch w-full resize-none" />
            </div>

            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Tipo documento</label>
              <select value={form.tipo_documento} onChange={e => set('tipo_documento', e.target.value)} className="input-ch w-full">
                <option value="">— Seleccionar —</option>
                <option value="boleta">Boleta</option>
                <option value="bet">BET</option>
                <option value="factura">Factura</option>
                <option value="sin_documento">Sin documento</option>
              </select>
            </div>

            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Foto comprobante *</label>
              <input ref={fileRef} type="file" accept="image/*" capture="environment"
                onChange={e => { if (e.target.files?.[0]) subirFoto(e.target.files[0]) }}
                className="hidden" />
              {fotoPreview ? (
                <div className="relative">
                  <img src={fotoPreview} alt="Comprobante" className="w-full max-h-48 object-cover border border-ch-border" />
                  <button onClick={() => { setFotoPreview(null); set('foto_url', '') }}
                    className="absolute top-2 right-2 bg-ch-surface border border-ch-border text-ch-muted font-body text-xs px-2 py-1 hover:text-red-400 transition-colors">
                    ✕
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} disabled={subiendo}
                  className="w-full border border-dashed border-ch-border text-ch-muted hover:text-ch-cream hover:border-zinc-600 font-body text-xs py-6 transition-colors disabled:opacity-50">
                  {subiendo ? 'Subiendo...' : '📷 Tomar foto o seleccionar imagen'}
                </button>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={enviar}
                disabled={isPending || !form.tipo || !form.monto || !form.descripcion || !form.foto_url || subiendo}
                className="flex-1 bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase py-3 transition-colors disabled:opacity-50">
                {isPending ? 'Enviando...' : 'Enviar rendición'}
              </button>
              <button onClick={() => setMostrarForm(false)}
                className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-4 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista rendiciones */}
        {rendiciones.length > 0 && (
          <div>
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">Mis rendiciones</p>
            <div className="space-y-3">
              {rendiciones.map(r => {
                const cfg = ESTADO_COLOR[r.estado]
                const retencion = r.tipo_documento ? calcularRetencion(r) : null
                return (
                  <div key={r.id} className="border border-ch-border p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-body text-sm text-ch-cream">{r.descripcion}</p>
                        <p className="font-body text-[10px] text-ch-muted mt-0.5">
                          {TIPOS.find(t => t.value === r.tipo)?.label}
                          {(r.rodaje as any)?.nombre ? ` · ${(r.rodaje as any).nombre}` : ''}
                        </p>
                      </div>
                      <span className={`font-body text-[9px] tracking-wider px-2 py-0.5 border whitespace-nowrap ${cfg}`}>
                        {r.estado === 'pendiente' ? 'Pendiente' : r.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-body text-base text-ch-cream font-mono">${r.monto.toLocaleString('es-CL')}</span>
                        {retencion && retencion.retencion > 0 && (
                          <span className="font-body text-[10px] text-ch-muted ml-2">→ neto ${retencion.neto.toLocaleString('es-CL')}</span>
                        )}
                      </div>
                      {r.foto_url && (
                        <a href={r.foto_url} target="_blank" rel="noopener noreferrer"
                          className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors">
                          Ver doc →
                        </a>
                      )}
                    </div>
                    {r.estado === 'rechazada' && r.motivo_rechazo && (
                      <p className="font-body text-[10px] text-red-400 mt-2 border-t border-ch-border/50 pt-2">
                        Motivo: {r.motivo_rechazo}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <p className="font-body text-[9px] text-ch-muted text-center mt-10 tracking-wider">
          Casa Hiedra · Hilván
        </p>
      </div>
    </div>
  )
}
