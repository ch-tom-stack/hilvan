'use client'

import { useState, useTransition, useRef } from 'react'
import { crearRendicion } from '@/app/actions/rendiciones'
import type { Rendicion, TipoRendicion, TipoDocRendicion } from '@/types'
import { createClient } from '@/lib/supabase/client'

const TIPO_ITEM_A_RENDICION: Record<string, TipoRendicion> = {
  rol: 'honorarios',
  equipo_ch: 'otro',
  equipo_externo: 'servicios',
  servicio: 'servicios',
  consumible: 'insumos',
  post_produccion: 'honorarios',
  locacion: 'servicios',
  cast: 'honorarios',
  otro: 'otro',
}

const TIPOS: { value: TipoRendicion; label: string }[] = [
  { value: 'honorarios', label: 'Honorarios' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'alimentacion', label: 'Alimentación' },
  { value: 'arte', label: 'Arte / Props' },
  { value: 'insumos', label: 'Insumos' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'viaticos', label: 'Viáticos' },
  { value: 'otro', label: 'Otro' },
]

interface CotizacionItem {
  id: string
  nombre: string
  tipo: string
  precio_neto_proveedor: number
  cantidad: number
  incluido?: boolean
  subgrupo_id?: string | null
  orden?: number
}

interface Subgrupo {
  id: string
  nombre: string
  orden: number
  items?: CotizacionItem[]
}

interface Departamento {
  id: string
  nombre: string
  orden: number
  subgrupos?: Subgrupo[]
  items?: CotizacionItem[]
}

interface CotizacionPara {
  id: string
  nombre: string
  estado: string
  grupo?: { numero_base: string }
  departamentos?: Departamento[]
}

interface Props {
  cotizaciones: CotizacionPara[]
  colaboradorId?: string
  rendicionesPorItem: Record<string, number>
  esExterno?: boolean
  onSuccess: (r: Rendicion) => void
  onCancel: () => void
}

export default function FormularioRendicion({ cotizaciones, colaboradorId, rendicionesPorItem, esExterno = false, onSuccess, onCancel }: Props) {
  const [isPending, startTransition] = useTransition()
  const [subiendo, setSubiendo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [cotizacionId, setCotizacionId] = useState('')
  // undefined = no elegido aún, null = gasto no presupuestado, string = item elegido
  const [itemId, setItemId] = useState<string | null | undefined>(undefined)
  const [form, setForm] = useState({
    tipo: '' as TipoRendicion | '',
    monto: '',
    descripcion: '',
    tipo_documento: '' as TipoDocRendicion | '',
    foto_url: '',
  })
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null)
  const [inputEsBruto, setInputEsBruto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const cotizacionSel = cotizaciones.find(c => c.id === cotizacionId)

  const seleccionarCotizacion = (id: string) => {
    setCotizacionId(id)
    setItemId(undefined)
    set('tipo', '')
  }

  const seleccionarItem = (item: CotizacionItem) => {
    setItemId(item.id)
    set('tipo', TIPO_ITEM_A_RENDICION[item.tipo] || 'otro')
  }

  const disponible = (item: CotizacionItem) =>
    item.precio_neto_proveedor * item.cantidad - (rendicionesPorItem[item.id] || 0)

  const subirArchivo = async (file: File) => {
    setSubiendo(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `rendiciones/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('rendiciones').upload(path, file)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('rendiciones').getPublicUrl(path)
      set('foto_url', publicUrl)
      setArchivoNombre(file.name)
      if (file.type.startsWith('image/')) {
        setFotoPreview(URL.createObjectURL(file))
      } else {
        setFotoPreview(null)
      }
    } finally {
      setSubiendo(false)
    }
  }

  const puedeEnviar = cotizacionId && itemId !== undefined && form.tipo && form.monto && form.descripcion && form.foto_url && !subiendo
  const puedeBorrador = !esExterno && cotizacionId && itemId !== undefined && form.tipo && !subiendo

  const esBoleta = form.tipo_documento === 'boleta'
  const TASA = 0.154

  // Calcula bruto real a almacenar según el toggle
  const calcularMontos = (raw: string) => {
    const val = parseInt(raw)
    if (isNaN(val) || val <= 0) return null
    if (!esBoleta) return { bruto: val, retencion: 0, neto: val }
    if (inputEsBruto) {
      const retencion = Math.round(val * TASA)
      return { bruto: val, retencion, neto: val - retencion }
    } else {
      // neto ingresado → bruto = neto / (1 - tasa)
      const bruto = Math.round(val / (1 - TASA))
      const retencion = bruto - val
      return { bruto, retencion, neto: val }
    }
  }

  const montos = form.monto ? calcularMontos(form.monto) : null

  const enviar = (estadoTarget: 'enviada' | 'borrador' = 'enviada') => {
    if (estadoTarget === 'borrador' && !puedeBorrador) return
    if (estadoTarget === 'enviada' && !puedeEnviar) return
    setError(null)
    const montoFinal = montos?.bruto ?? (parseInt(form.monto) || 0)
    startTransition(async () => {
      try {
        const nueva = await crearRendicion({
          cotizacion_id: cotizacionId,
          cotizacion_item_id: itemId,
          colaborador_id: colaboradorId,
          origen: esExterno ? 'externo' : 'interno',
          tipo: form.tipo as TipoRendicion,
          descripcion: form.descripcion || '',
          monto: montoFinal,
          foto_url: form.foto_url || '',
          tipo_documento: form.tipo_documento || undefined,
          estado: estadoTarget,
        })
        onSuccess(nueva)
      } catch (e: any) {
        setError(e?.message || 'Error al guardar. Intenta de nuevo.')
      }
    })
  }

  return (
    <div className="space-y-5">

      {/* Cotización */}
      <div>
        <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Cotización *</label>
        <select value={cotizacionId} onChange={e => seleccionarCotizacion(e.target.value)} className="input-ch w-full">
          <option value="">— Seleccionar —</option>
          {cotizaciones.map(c => (
            <option key={c.id} value={c.id}>
              {c.grupo?.numero_base ? `${c.grupo.numero_base} · ` : ''}{c.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Ítem */}
      {cotizacionSel && (
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-2">Ítem de la cotización *</label>
          <div className="border border-ch-border max-h-60 overflow-y-auto p-3 space-y-3">
            {(cotizacionSel.departamentos ?? [])
              .slice()
              .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
              .map(dep => {
                const itemsDirectos = (dep.items ?? []).filter(i => !i.subgrupo_id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                const subgrupos = (dep.subgrupos ?? []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                if (itemsDirectos.length === 0 && subgrupos.length === 0) return null
                return (
                  <div key={dep.id}>
                    <p className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted mb-2">{dep.nombre}</p>
                    <div className="space-y-1">
                      {subgrupos.map(sg => (
                        <div key={sg.id} className="mb-1">
                          <p className="font-body text-[10px] text-ch-muted italic pl-1 mb-1">{sg.nombre}</p>
                          <div className="space-y-1 pl-2">
                            {(sg.items ?? []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map(item => {
                              const disp = disponible(item)
                              const sel = itemId === item.id
                              return (
                                <button key={item.id} type="button" onClick={() => seleccionarItem(item)}
                                  className={`w-full text-left px-3 py-2 border font-body text-xs transition-colors flex items-center justify-between gap-3 ${sel ? 'border-ch-green bg-ch-green/10 text-ch-cream' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`}>
                                  <span>{item.nombre}</span>
                                  <span className="text-[10px] whitespace-nowrap font-mono">
                                    Disp: ${disp.toLocaleString('es-CL')}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                      {itemsDirectos.map(item => {
                        const disp = disponible(item)
                        const sel = itemId === item.id
                        return (
                          <button key={item.id} type="button" onClick={() => seleccionarItem(item)}
                            className={`w-full text-left px-3 py-2 border font-body text-xs transition-colors flex items-center justify-between gap-3 ${sel ? 'border-ch-green bg-ch-green/10 text-ch-cream' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`}>
                            <span>{item.nombre}</span>
                            <span className="text-[10px] whitespace-nowrap font-mono">
                              Disp: ${disp.toLocaleString('es-CL')}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

            {/* Gasto no presupuestado */}
            <button type="button" onClick={() => { setItemId(null); set('tipo', '') }}
              className={`w-full text-left px-3 py-2 border font-body text-xs transition-colors ${itemId === null ? 'border-amber-500/50 bg-amber-500/5 text-amber-400' : 'border-ch-border border-dashed text-ch-muted hover:text-ch-cream'}`}>
              Gasto no presupuestado
            </button>
          </div>
        </div>
      )}

      {/* Detalles (aparecen tras seleccionar ítem) */}
      {itemId !== undefined && (
        <>
          {/* Tipo */}
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-2">Tipo *</label>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map(t => (
                <button key={t.value} type="button" onClick={() => set('tipo', t.value)}
                  className={`py-1.5 px-3 border font-body text-xs transition-colors ${form.tipo === t.value ? 'border-ch-green text-ch-cream bg-ch-green/10' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Monto */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em]">Monto CLP *</label>
              {esBoleta && (
                <div className="flex gap-0">
                  <button type="button" onClick={() => setInputEsBruto(false)}
                    className={`font-body text-[9px] px-2.5 py-1 border transition-colors ${!inputEsBruto ? 'border-ch-green text-ch-cream bg-ch-green/10' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`}>
                    Neto
                  </button>
                  <button type="button" onClick={() => setInputEsBruto(true)}
                    className={`font-body text-[9px] px-2.5 py-1 border border-l-0 transition-colors ${inputEsBruto ? 'border-ch-green text-ch-cream bg-ch-green/10' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`}>
                    Bruto
                  </button>
                </div>
              )}
            </div>
            <input value={form.monto} onChange={e => set('monto', e.target.value)}
              type="number" placeholder={esBoleta && !inputEsBruto ? 'Ej: 126900 (lo que recibes)' : '150000'}
              className="input-ch w-full font-mono text-lg" />
            {montos && esBoleta && (
              <div className="mt-1 font-body text-[10px] text-ch-muted font-mono">
                {inputEsBruto
                  ? `Retención ${(TASA * 100).toFixed(1)}% = $${montos.retencion.toLocaleString('es-CL')} · Neto = $${montos.neto.toLocaleString('es-CL')}`
                  : `Bruto boleta = $${montos.bruto.toLocaleString('es-CL')} · Retención = $${montos.retencion.toLocaleString('es-CL')}`
                }
              </div>
            )}
          </div>

          {/* Descripción */}
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Descripción *</label>
            <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
              rows={2} placeholder="Ej: Gasolina ida/vuelta locación" className="input-ch w-full resize-none" />
          </div>

          {/* Tipo documento */}
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Tipo documento</label>
            <select value={form.tipo_documento} onChange={e => set('tipo_documento', e.target.value)} className="input-ch w-full">
              <option value="">— Seleccionar —</option>
              <option value="boleta">Boleta de honorarios</option>
              <option value="factura">Factura</option>
              <option value="exenta">Boleta exenta / servicio sin IVA</option>
              <option value="sin_documento">Sin documento</option>
            </select>
            {form.tipo_documento === 'sin_documento' && (
              <p className="mt-1.5 font-body text-[10px] text-red-400">⚠ Requerirá justificación</p>
            )}
            {(form.tipo_documento === 'factura' || form.tipo_documento === 'exenta') && (
              <p className="mt-1.5 font-body text-[10px] text-ch-muted font-mono">Pago bruto completo</p>
            )}
          </div>

          {/* Comprobante */}
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Comprobante *</label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf"
              onChange={e => { if (e.target.files?.[0]) subirArchivo(e.target.files[0]) }}
              className="hidden" />
            {form.foto_url ? (
              <div className="border border-ch-border relative">
                {fotoPreview ? (
                  <img src={fotoPreview} alt="Comprobante" className="w-full max-h-48 object-cover" />
                ) : (
                  <div className="flex items-center gap-3 p-4">
                    <span className="text-2xl">📄</span>
                    <div className="min-w-0">
                      <p className="font-body text-xs text-ch-cream truncate">{archivoNombre}</p>
                      <a href={form.foto_url} target="_blank" rel="noopener noreferrer"
                        className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors">
                        Ver archivo →
                      </a>
                    </div>
                  </div>
                )}
                <button onClick={() => { setFotoPreview(null); setArchivoNombre(null); set('foto_url', '') }}
                  className="absolute top-2 right-2 bg-ch-surface border border-ch-border text-ch-muted font-body text-xs px-2 py-1 hover:text-red-400 transition-colors">
                  ✕
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={subiendo}
                className="w-full border border-dashed border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs py-6 transition-colors disabled:opacity-50">
                {subiendo ? 'Subiendo...' : '📎 Adjuntar imagen o PDF'}
              </button>
            )}
          </div>

          {error && (
            <p className="font-body text-[10px] text-red-400 border border-red-500/30 px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1 flex-wrap">
            <button onClick={() => enviar('enviada')} disabled={!puedeEnviar || isPending}
              className="flex-1 bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase py-3 transition-colors disabled:opacity-50">
              {isPending ? 'Enviando...' : 'Enviar rendición'}
            </button>
            {!esExterno && (
              <button onClick={() => enviar('borrador')} disabled={!puedeBorrador || isPending}
                className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-4 py-3 transition-colors disabled:opacity-50">
                Guardar borrador
              </button>
            )}
            <button onClick={onCancel}
              className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-4 transition-colors">
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
