'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { crearRendicion, eliminarRendicion } from '@/app/actions/rendiciones'
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

const ESTADO_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'text-amber-400 border-amber-500/30' },
  aprobada: { label: 'Aprobada', color: 'text-ch-green border-ch-green/30' },
  rechazada: { label: 'Rechazada', color: 'text-red-400 border-red-500/30' },
}

interface Props {
  colaboradorId?: string
  rendiciones: Rendicion[]
  rodajes: { id: string; nombre: string; fecha?: string }[]
  rodajeFiltro?: string
}

export default function RendicionesColaborador({ colaboradorId, rendiciones: inicial, rodajes, rodajeFiltro }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rendiciones, setRendiciones] = useState(inicial)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [subiendo, setSubiendo] = useState(false)

  const [form, setForm] = useState({
    rodaje_id: rodajeFiltro || '',
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
    if (!form.rodaje_id || !form.tipo || !form.monto || !form.descripcion || !form.foto_url) return
    startTransition(async () => {
      const nueva = await crearRendicion({
        rodaje_id: form.rodaje_id,
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
      setForm({ rodaje_id: '', tipo: '', monto: '', descripcion: '', tipo_documento: '', notas: '', foto_url: '' })
      setFotoPreview(null)
    })
  }

  return (
    <div className="p-4 lg:p-10 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display italic text-3xl text-ch-cream">Mis rendiciones</h1>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors"
        >
          + Agregar gasto
        </button>
      </div>

      {/* Filtro rodaje */}
      {rodajes.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          <Link href="/rendiciones"
            className={`whitespace-nowrap font-body text-[10px] tracking-wider uppercase px-3 py-1.5 border transition-colors ${!rodajeFiltro ? 'border-ch-green text-ch-cream' : 'border-ch-border text-ch-muted'}`}>
            Todos
          </Link>
          {rodajes.slice(0, 6).map(r => (
            <Link key={r.id} href={`/rendiciones?rodaje=${r.id}`}
              className={`whitespace-nowrap font-body text-[10px] tracking-wider uppercase px-3 py-1.5 border transition-colors ${rodajeFiltro === r.id ? 'border-ch-green text-ch-cream' : 'border-ch-border text-ch-muted'}`}>
              {r.nombre}
            </Link>
          ))}
        </div>
      )}

      {/* Formulario nuevo gasto */}
      {mostrarForm && (
        <div className="border border-ch-border bg-ch-surface/20 p-5 mb-6 space-y-4">
          <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Nuevo gasto</p>

          {/* Rodaje */}
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Rodaje *</label>
            <select value={form.rodaje_id} onChange={e => set('rodaje_id', e.target.value)} className="input-ch w-full">
              <option value="">— Seleccionar —</option>
              {rodajes.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>

          {/* Tipo (chips) */}
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

          {/* Monto */}
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Monto CLP *</label>
            <input value={form.monto} onChange={e => set('monto', e.target.value)}
              type="number" placeholder="150000" className="input-ch w-full font-mono text-lg" />
          </div>

          {/* Descripción */}
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Descripción *</label>
            <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
              rows={2} placeholder="Ej: Gasolina ida/vuelta locación" className="input-ch w-full resize-none" />
          </div>

          {/* Tipo documento */}
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

          {/* Foto comprobante */}
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
              disabled={isPending || !form.rodaje_id || !form.tipo || !form.monto || !form.descripcion || !form.foto_url || subiendo}
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
      {rendiciones.length === 0 ? (
        <div className="border border-dashed border-ch-border p-12 text-center">
          <p className="text-ch-muted font-body text-sm">No hay rendiciones aún.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rendiciones.map(r => {
            const cfg = ESTADO_CONFIG[r.estado]
            const retencion = r.tipo_documento ? calcularRetencion(r) : null
            return (
              <div key={r.id} className="border border-ch-border bg-ch-surface/10 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-body text-sm text-ch-cream">{r.descripcion}</span>
                      {r.tipo_documento === 'sin_documento' && (
                        <span className="font-body text-[9px] tracking-wider px-1.5 py-0.5 border border-red-500/40 text-red-400">⚠ SIN DOC</span>
                      )}
                      {r.tipo_documento === 'bet' && (
                        <span className="font-body text-[9px] tracking-wider px-1.5 py-0.5 border border-amber-500/40 text-amber-400">BET</span>
                      )}
                    </div>
                    <p className="font-body text-[10px] text-ch-muted mt-0.5">
                      {TIPOS.find(t => t.value === r.tipo)?.label} · {(r.rodaje as any)?.nombre}
                    </p>
                  </div>
                  <span className={`font-body text-[9px] tracking-wider px-2 py-0.5 border whitespace-nowrap ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-body text-base text-ch-cream font-mono">
                      ${r.monto.toLocaleString('es-CL')}
                    </span>
                    {retencion && retencion.retencion > 0 && (
                      <span className="font-body text-[10px] text-ch-muted ml-2">
                        → neto ${retencion.neto.toLocaleString('es-CL')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {r.foto_url && (
                      <a href={r.foto_url} target="_blank" rel="noopener noreferrer"
                        className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors">
                        Ver doc →
                      </a>
                    )}
                    {r.estado === 'pendiente' && (
                      <button onClick={() => startTransition(async () => {
                        await eliminarRendicion(r.id)
                        setRendiciones(prev => prev.filter(x => x.id !== r.id))
                      })} className="font-body text-[10px] text-ch-muted hover:text-red-400 transition-colors">
                        Eliminar
                      </button>
                    )}
                  </div>
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
      )}
    </div>
  )
}
