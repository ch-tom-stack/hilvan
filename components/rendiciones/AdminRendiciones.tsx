'use client'

import { useState, useTransition, useRef } from 'react'
import { aprobarRendicion, rechazarRendicion, crearRendicion } from '@/app/actions/rendiciones'
import { calcularRetencion } from '@/types'
import type { Rendicion, TipoRendicion, TipoDocRendicion } from '@/types'
import { createClient } from '@/lib/supabase/client'

const TIPO_LABEL: Record<string, string> = {
  honorarios: 'Honorarios',
  transporte: 'Transporte',
  alimentacion: 'Alimentación',
  arte: 'Arte / Props',
  factura: 'Factura',
  otro: 'Otro',
}

const TIPOS_LISTA = Object.entries(TIPO_LABEL) as [TipoRendicion, string][]

interface Props {
  porRodaje: Record<string, { nombre: string; items: Rendicion[] }>
  rodajes: { id: string; nombre: string; fecha?: string }[]
  colaboradores: { id: string; nombre: string }[]
}

export default function AdminRendiciones({ porRodaje: inicial, rodajes, colaboradores }: Props) {
  const [porRodaje, setPorRodaje] = useState(inicial)
  const [isPending, startTransition] = useTransition()
  const [modalRechazo, setModalRechazo] = useState<{ id: string; rodajeId: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'aprobada' | 'rechazada'>('pendiente')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    rodaje_id: '', colaborador_id: '', tipo: '' as TipoRendicion | '',
    monto: '', descripcion: '', tipo_documento: '' as TipoDocRendicion | '',
    notas: '', foto_url: '',
  })
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const subirFoto = async (file: File) => {
    setSubiendo(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `rendiciones/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('rendiciones').upload(path, file)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('rendiciones').getPublicUrl(path)
      setF('foto_url', publicUrl)
      setFotoPreview(URL.createObjectURL(file))
    } finally {
      setSubiendo(false)
    }
  }

  const enviarNueva = () => {
    if (!form.rodaje_id || !form.colaborador_id || !form.tipo || !form.monto || !form.descripcion || !form.foto_url) return
    startTransition(async () => {
      const nueva = await crearRendicion({
        rodaje_id: form.rodaje_id,
        colaborador_id: form.colaborador_id,
        tipo: form.tipo as TipoRendicion,
        descripcion: form.descripcion,
        monto: parseInt(form.monto),
        foto_url: form.foto_url,
        tipo_documento: form.tipo_documento || undefined,
        notas: form.notas || undefined,
      })
      const rodajeId = nueva.rodaje_id
      const rodajeNombre = rodajes.find(r => r.id === rodajeId)?.nombre || 'Sin rodaje'
      setPorRodaje(prev => {
        const copia = { ...prev }
        if (!copia[rodajeId]) copia[rodajeId] = { nombre: rodajeNombre, items: [] }
        copia[rodajeId] = { ...copia[rodajeId], items: [nueva, ...copia[rodajeId].items] }
        return copia
      })
      setMostrarForm(false)
      setForm({ rodaje_id: '', colaborador_id: '', tipo: '', monto: '', descripcion: '', tipo_documento: '', notas: '', foto_url: '' })
      setFotoPreview(null)
    })
  }

  const actualizarRendicion = (rodajeId: string, id: string, cambios: Partial<Rendicion>) => {
    setPorRodaje(prev => {
      const copia = { ...prev }
      copia[rodajeId] = {
        ...copia[rodajeId],
        items: copia[rodajeId].items.map(r => r.id === id ? { ...r, ...cambios } : r),
      }
      return copia
    })
  }

  const aprobar = (r: Rendicion, rodajeId: string) => {
    startTransition(async () => {
      actualizarRendicion(rodajeId, r.id, { estado: 'aprobada' })
      await aprobarRendicion(r.id)
    })
  }

  const rechazar = () => {
    if (!modalRechazo || !motivo.trim()) return
    const { id, rodajeId } = modalRechazo
    startTransition(async () => {
      actualizarRendicion(rodajeId, id, { estado: 'rechazada', motivo_rechazo: motivo })
      await rechazarRendicion(id, motivo)
      setModalRechazo(null)
      setMotivo('')
    })
  }

  const rodajeIds = Object.keys(porRodaje)

  return (
    <div className="space-y-8">
      {/* Barra superior */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {(['todos', 'pendiente', 'aprobada', 'rechazada'] as const).map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={`font-body text-[10px] tracking-wider uppercase px-3 py-1.5 border transition-colors ${filtroEstado === e ? 'border-ch-green text-ch-cream' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`}>
              {e === 'todos' ? 'Todos' : e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => setMostrarForm(!mostrarForm)}
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-5 py-2.5 transition-colors">
          + Nueva rendición
        </button>
      </div>

      {/* Formulario nueva rendición (admin) */}
      {mostrarForm && (
        <div className="border border-ch-border bg-ch-surface/20 p-5 space-y-4">
          <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Nueva rendición</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Rodaje *</label>
              <select value={form.rodaje_id} onChange={e => setF('rodaje_id', e.target.value)} className="input-ch w-full">
                <option value="">— Seleccionar —</option>
                {rodajes.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Colaborador *</label>
              <select value={form.colaborador_id} onChange={e => setF('colaborador_id', e.target.value)} className="input-ch w-full">
                <option value="">— Seleccionar —</option>
                {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Tipo *</label>
              <select value={form.tipo} onChange={e => setF('tipo', e.target.value)} className="input-ch w-full">
                <option value="">— Seleccionar —</option>
                {TIPOS_LISTA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Monto CLP *</label>
              <input value={form.monto} onChange={e => setF('monto', e.target.value)} type="number" placeholder="150000" className="input-ch w-full font-mono" />
            </div>
          </div>
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Descripción *</label>
            <input value={form.descripcion} onChange={e => setF('descripcion', e.target.value)} placeholder="Ej: Gasolina ida/vuelta locación" className="input-ch w-full" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Tipo documento</label>
              <select value={form.tipo_documento} onChange={e => setF('tipo_documento', e.target.value)} className="input-ch w-full">
                <option value="">— Seleccionar —</option>
                <option value="boleta">Boleta</option>
                <option value="bet">BET</option>
                <option value="factura">Factura</option>
                <option value="sin_documento">Sin documento</option>
              </select>
            </div>
            <div>
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-widest block mb-1.5">Comprobante *</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={e => { if (e.target.files?.[0]) subirFoto(e.target.files[0]) }} className="hidden" />
              {fotoPreview
                ? <div className="relative h-10 flex items-center gap-2">
                    <img src={fotoPreview} alt="" className="h-10 w-10 object-cover border border-ch-border" />
                    <span className="font-body text-[10px] text-ch-green">Subido ✓</span>
                    <button onClick={() => { setFotoPreview(null); setF('foto_url', '') }} className="font-body text-[10px] text-ch-muted hover:text-red-400 ml-auto">✕</button>
                  </div>
                : <button onClick={() => fileRef.current?.click()} disabled={subiendo} className="w-full border border-dashed border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs py-2.5 transition-colors disabled:opacity-50">
                    {subiendo ? 'Subiendo...' : '📷 Subir comprobante'}
                  </button>
              }
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={enviarNueva}
              disabled={isPending || !form.rodaje_id || !form.colaborador_id || !form.tipo || !form.monto || !form.descripcion || !form.foto_url || subiendo}
              className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-2.5 transition-colors disabled:opacity-50">
              {isPending ? 'Creando...' : 'Crear rendición'}
            </button>
            <button onClick={() => setMostrarForm(false)} className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-4 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {rodajeIds.length === 0 && (
        <div className="border border-dashed border-ch-border p-12 text-center">
          <p className="text-ch-muted font-body text-sm">No hay rendiciones.</p>
        </div>
      )}

      {rodajeIds.map(rodajeId => {
        const { nombre, items } = porRodaje[rodajeId]
        const visibles = items.filter(r => filtroEstado === 'todos' || r.estado === filtroEstado)
        if (visibles.length === 0) return null

        const totalPendiente = visibles.filter(r => r.estado === 'pendiente').reduce((s, r) => s + r.monto, 0)

        return (
          <div key={rodajeId}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-display italic text-xl text-ch-cream">{nombre}</h2>
                {totalPendiente > 0 && (
                  <p className="font-body text-[10px] text-ch-muted tracking-wider">
                    ${totalPendiente.toLocaleString('es-CL')} pendiente
                  </p>
                )}
              </div>
              <span className="font-body text-[9px] tracking-[0.3em] text-ch-muted uppercase">
                {visibles.length} ítem{visibles.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-2">
              {visibles.map(r => {
                const retencion = r.tipo_documento ? calcularRetencion(r) : null
                const colNombre = (r.colaborador as any)?.nombre || r.nombre_libre || '—'

                return (
                  <div key={r.id} className={`border p-4 transition-colors ${r.estado === 'pendiente' ? 'border-amber-500/30 bg-amber-500/5' : r.estado === 'aprobada' ? 'border-ch-green/30 bg-ch-green/5' : 'border-red-500/30 bg-red-500/5'}`}>
                    <div className="flex items-start justify-between gap-4">
                      {/* Info principal */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-body text-sm text-ch-cream font-medium">{colNombre}</span>
                          <span className="font-body text-[9px] tracking-wider text-ch-muted uppercase">{TIPO_LABEL[r.tipo] || r.tipo}</span>
                          {r.tipo_documento === 'sin_documento' && (
                            <span className="font-body text-[9px] px-1.5 py-0.5 border border-red-500/40 text-red-400">⚠ SIN DOC</span>
                          )}
                          {r.tipo_documento === 'bet' && (
                            <span className="font-body text-[9px] px-1.5 py-0.5 border border-amber-500/40 text-amber-400">BET</span>
                          )}
                        </div>
                        <p className="font-body text-xs text-ch-muted mb-2 truncate">{r.descripcion}</p>

                        <div className="flex items-center gap-4 flex-wrap">
                          <div>
                            <span className="font-body text-base text-ch-cream font-mono">${r.monto.toLocaleString('es-CL')}</span>
                            {retencion && retencion.retencion > 0 && (
                              <span className="font-body text-[10px] text-ch-muted ml-2">
                                ret. ${retencion.retencion.toLocaleString('es-CL')} · neto ${retencion.neto.toLocaleString('es-CL')}
                              </span>
                            )}
                          </div>

                          {/* Datos bancarios */}
                          {(r.colaborador as any)?.banco && r.estado === 'aprobada' && (
                            <div className="font-body text-[10px] text-ch-muted">
                              {(r.colaborador as any).banco} · {(r.colaborador as any).tipo_cuenta} · {(r.colaborador as any).numero_cuenta}
                            </div>
                          )}
                        </div>

                        {r.estado === 'rechazada' && r.motivo_rechazo && (
                          <p className="font-body text-[10px] text-red-400 mt-2">Motivo: {r.motivo_rechazo}</p>
                        )}
                      </div>

                      {/* Acciones */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {r.foto_url && (
                          <a href={r.foto_url} target="_blank" rel="noopener noreferrer"
                            className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors">
                            Ver doc →
                          </a>
                        )}

                        {r.estado === 'pendiente' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => aprobar(r, rodajeId)}
                              disabled={isPending}
                              className="font-body text-[10px] tracking-wider uppercase px-3 py-1.5 bg-ch-green hover:bg-ch-green-light text-ch-black transition-colors disabled:opacity-50">
                              Aprobar
                            </button>
                            <button
                              onClick={() => { setModalRechazo({ id: r.id, rodajeId }); setMotivo('') }}
                              disabled={isPending}
                              className="font-body text-[10px] tracking-wider uppercase px-3 py-1.5 border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                              Rechazar
                            </button>
                          </div>
                        )}

                        {r.estado !== 'pendiente' && (
                          <span className={`font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border ${r.estado === 'aprobada' ? 'border-ch-green/30 text-ch-green' : 'border-red-500/30 text-red-400'}`}>
                            {r.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Modal rechazo */}
      {modalRechazo && (
        <div className="fixed inset-0 bg-ch-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-ch-dark border border-ch-border p-6 w-full max-w-md">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">Rendiciones · Admin</p>
            <h3 className="font-display italic text-2xl text-ch-cream mb-5">Motivo de rechazo</h3>

            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Ej: Documento ilegible, falta comprobante..."
              className="input-ch w-full resize-none mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={rechazar}
                disabled={isPending || !motivo.trim()}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-body text-[10px] tracking-[0.35em] uppercase py-3 transition-colors disabled:opacity-50">
                {isPending ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
              <button
                onClick={() => setModalRechazo(null)}
                className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-4 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
