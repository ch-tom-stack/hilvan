'use client'

import { useState, useTransition, useRef } from 'react'
import { crearGasto } from '@/app/actions/rendiciones'
import type { RendicionGasto, TipoRendicion, TipoDocRendicion } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { tasaRetencionBoleta } from '@/lib/rendiciones-calc'

interface DatosFactura {
  rut_emisor: string | null
  razon_social: string | null
  monto: number | null
  folio: string | null
  fecha: string | null
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

const TIPO_ITEM_A_RENDICION: Record<string, TipoRendicion> = {
  rol: 'honorarios', equipo_ch: 'otro', equipo_externo: 'servicios',
  servicio: 'servicios', consumible: 'insumos', post_produccion: 'honorarios',
  locacion: 'servicios', cast: 'honorarios', otro: 'otro',
}

interface Props {
  rendicionId: string
  cotizacionItemId: string | null
  itemTipo?: string
  colaboradorId?: string | null
  esExterno?: boolean
  onSuccess: (gasto: RendicionGasto, continuar?: boolean) => void
  onCancel: () => void
}

const TASA = tasaRetencionBoleta() // tasa del año actual (Ley 21.133)

export default function FormularioGasto({
  rendicionId, cotizacionItemId, itemTipo, colaboradorId, esExterno = false, onSuccess, onCancel,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [subiendo, setSubiendo] = useState(false)
  const [parseando, setParseando] = useState(false)
  const [datosDetectados, setDatosDetectados] = useState<DatosFactura | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const tipoInicial = itemTipo ? (TIPO_ITEM_A_RENDICION[itemTipo] || 'otro') : ''

  const [form, setForm] = useState({
    tipo: tipoInicial as TipoRendicion | '',
    monto: '',
    descripcion: '',
    tipo_documento: '' as TipoDocRendicion | '',
    foto_url: '',
    rut_emisor: '',
    razon_social_emisor: '',
    factura_casa_hiedra: false,
    documento_recibido: true,
    fecha_documento: '',
  })
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null)
  const [inputEsBruto, setInputEsBruto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const esBoleta = form.tipo_documento === 'boleta'

  // La tasa de retención depende del año de la boleta (Ley 21.133): usar el año
  // de `fecha_documento` si está; si no, el año actual.
  const tasa = form.fecha_documento
    ? tasaRetencionBoleta(Number(form.fecha_documento.slice(0, 4)))
    : TASA

  const calcularMontos = (raw: string) => {
    const val = parseInt(raw)
    if (isNaN(val) || val <= 0) return null
    if (!esBoleta) return { bruto: val, retencion: 0, neto: val }
    if (inputEsBruto) {
      const retencion = Math.round(val * tasa)
      return { bruto: val, retencion, neto: val - retencion }
    } else {
      const bruto = Math.round(val / (1 - tasa))
      return { bruto, retencion: bruto - val, neto: val }
    }
  }

  const montos = form.monto ? calcularMontos(form.monto) : null
  const comprobanteOk = true
  const puedeGuardar = form.tipo && form.monto && comprobanteOk && !subiendo && !isPending

  const parsearPDF = async (file: File) => {
    setParseando(true)
    setDatosDetectados(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/parse-factura', { method: 'POST', body: fd })
      if (!res.ok) return
      const datos: DatosFactura = await res.json()
      // Solo mostrar si encontramos algo útil
      if (datos.rut_emisor || datos.razon_social || datos.monto) {
        setDatosDetectados(datos)
      }
    } catch {
      // Silencioso — el parse es best-effort
    } finally {
      setParseando(false)
    }
  }

  const aplicarDatosDetectados = () => {
    if (!datosDetectados) return
    setForm(prev => ({
      ...prev,
      tipo_documento: 'factura' as TipoDocRendicion,
      rut_emisor:          datosDetectados.rut_emisor          ?? prev.rut_emisor,
      razon_social_emisor: datosDetectados.razon_social        ?? prev.razon_social_emisor,
      monto:               datosDetectados.monto != null ? String(datosDetectados.monto) : prev.monto,
    }))
    setDatosDetectados(null)
  }

  const subirArchivo = async (file: File) => {
    setSubiendo(true)
    // Si es PDF, intentar parsear en paralelo
    const esPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (esPDF) parsearPDF(file)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `rendiciones/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('rendiciones').upload(path, file)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('rendiciones').getPublicUrl(path)
      set('foto_url', publicUrl)
      setArchivoNombre(file.name)
      if (file.type.startsWith('image/')) setFotoPreview(URL.createObjectURL(file))
      else setFotoPreview(null)
    } catch (e: any) {
      setError(e?.message || 'Error al subir archivo')
    } finally {
      setSubiendo(false)
    }
  }

  const resetForm = () => {
    setForm({ tipo: tipoInicial as TipoRendicion | '', monto: '', descripcion: '', tipo_documento: '' as TipoDocRendicion | '', foto_url: '', rut_emisor: '', razon_social_emisor: '', factura_casa_hiedra: false, documento_recibido: true, fecha_documento: '' })
    setFotoPreview(null)
    setArchivoNombre(null)
    setInputEsBruto(false)
    setDatosDetectados(null)
  }

  const guardar = (continuar = false) => {
    if (!puedeGuardar) return
    setError(null)
    const montoFinal = montos?.bruto ?? (parseInt(form.monto) || 0)
    startTransition(async () => {
      try {
        const nuevo = await crearGasto({
          rendicion_id: rendicionId,
          cotizacion_item_id: cotizacionItemId,
          colaborador_id: colaboradorId ?? null,
          origen: esExterno ? 'externo' : 'interno',
          tipo: form.tipo as TipoRendicion,
          descripcion: form.descripcion || null,
          monto: montoFinal,
          tipo_documento: (form.tipo_documento || null) as TipoDocRendicion | null,
          foto_url: form.foto_url || null,
          estado: 'enviada',
          rut_emisor: form.rut_emisor || null,
          razon_social_emisor: form.razon_social_emisor || null,
          factura_casa_hiedra: form.factura_casa_hiedra,
          documento_recibido: form.documento_recibido,
          fecha_documento: form.fecha_documento || null,
        })
        if (continuar) {
          onSuccess(nuevo, true)
          resetForm()
        } else {
          onSuccess(nuevo, false)
        }
      } catch (e: any) {
        setError(e?.message || 'Error al guardar. Intenta de nuevo.')
      }
    })
  }

  return (
    <div className="space-y-4 p-4 border border-ch-border/60 bg-ch-surface/30">

      {/* Tipo */}
      <div>
        <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-2">Tipo *</label>
        <div className="flex flex-wrap gap-1.5">
          {TIPOS.map(t => (
            <button key={t.value} type="button" onClick={() => set('tipo', t.value)}
              className={`py-1 px-2.5 border font-body text-xs transition-colors ${form.tipo === t.value ? 'border-ch-green text-ch-cream bg-ch-green/10' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tipo documento */}
      <div>
        <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Tipo documento</label>
        <select value={form.tipo_documento} onChange={e => { set('tipo_documento', e.target.value); setInputEsBruto(false) }} className="input-ch w-full">
          <option value="">— Seleccionar —</option>
          <option value="boleta">Boleta de honorarios</option>
          <option value="boleta_consumo">Boleta / Ticket (con IVA)</option>
          <option value="factura">Factura</option>
          <option value="exenta">Boleta exenta / sin IVA</option>
          <option value="sin_documento">Sin documento</option>
        </select>
        {form.tipo_documento === 'sin_documento' && (
          <p className="mt-1 font-body text-[10px] text-red-400">⚠ Requerirá justificación</p>
        )}
      </div>

      {/* Campos de factura */}
      {form.tipo_documento === 'factura' && (
        <div className="space-y-3 border-l-2 border-ch-green/30 pl-3">
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">RUT Emisor</label>
            <input value={form.rut_emisor} onChange={e => set('rut_emisor', e.target.value)}
              type="text" placeholder="Ej: 76.123.456-7" className="input-ch w-full" />
          </div>
          <div>
            <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Razón Social</label>
            <input value={form.razon_social_emisor} onChange={e => set('razon_social_emisor', e.target.value)}
              type="text" placeholder="Nombre del emisor" className="input-ch w-full" />
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.factura_casa_hiedra}
              onChange={e => set('factura_casa_hiedra', e.target.checked)}
              className="w-4 h-4 accent-ch-green" />
            <span className="font-body text-xs text-ch-cream">Factura emitida a nombre de Casa Hiedra</span>
            <span className="font-body text-[9px] text-ch-muted">(crédito fiscal IVA)</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={!form.documento_recibido}
              onChange={e => set('documento_recibido', !e.target.checked)}
              className="w-4 h-4 accent-ch-gold" />
            <span className="font-body text-xs text-ch-cream">Documento pendiente</span>
            <span className="font-body text-[9px] text-ch-muted">(boleta/factura aún no emitida)</span>
          </label>
        </div>
      )}

      {/* Monto */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em]">Monto CLP *</label>
          {esBoleta && (
            <div className="flex">
              <button type="button" onClick={() => setInputEsBruto(false)}
                className={`font-body text-[9px] px-2.5 py-1 border transition-colors ${!inputEsBruto ? 'border-ch-green text-ch-cream bg-ch-green/10' : 'border-ch-border text-ch-muted'}`}>
                Neto
              </button>
              <button type="button" onClick={() => setInputEsBruto(true)}
                className={`font-body text-[9px] px-2.5 py-1 border border-l-0 transition-colors ${inputEsBruto ? 'border-ch-green text-ch-cream bg-ch-green/10' : 'border-ch-border text-ch-muted'}`}>
                Bruto
              </button>
            </div>
          )}
        </div>
        <input value={form.monto} onChange={e => set('monto', e.target.value)}
          type="number" placeholder={esBoleta && !inputEsBruto ? 'Ej: 126900 (lo que recibes)' : '150000'}
          className="input-ch w-full font-mono text-lg" />
        {montos && esBoleta && (
          <p className="mt-1 font-body text-[10px] text-ch-muted font-mono">
            {inputEsBruto
              ? `Retención ${(tasa * 100).toFixed(2).replace(/\.?0+$/, '')}% = $${montos.retencion.toLocaleString('es-CL')} · Neto = $${montos.neto.toLocaleString('es-CL')}`
              : `Bruto = $${montos.bruto.toLocaleString('es-CL')} · Retención = $${montos.retencion.toLocaleString('es-CL')}`
            }
          </p>
        )}
      </div>

      {/* Fecha del documento */}
      <div>
        <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Fecha del documento (opcional)</label>
        <input value={form.fecha_documento} onChange={e => set('fecha_documento', e.target.value)}
          type="date" className="input-ch w-full" />
        <p className="mt-1 font-body text-[10px] text-ch-subtle">Fecha real de la boleta/documento — define el mes y el año de retención.</p>
      </div>

      {/* Descripción */}
      <div>
        <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">Descripción</label>
        <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
          rows={2} placeholder="Ej: Gasolina ida/vuelta locación" className="input-ch w-full resize-none" />
      </div>

      {/* Comprobante */}
      <div>
        <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1.5">
          Comprobante (opcional)
        </label>
        <input ref={fileRef} type="file" accept="image/*,application/pdf"
          onChange={e => { if (e.target.files?.[0]) subirArchivo(e.target.files[0]) }}
          className="hidden" />
        {form.foto_url ? (
          <div className="border border-ch-border relative">
            {fotoPreview
              ? <img src={fotoPreview} alt="Comprobante" className="w-full max-h-40 object-cover" />
              : <div className="flex items-center gap-3 p-3">
                  <span className="text-xl">📄</span>
                  <div className="min-w-0">
                    <p className="font-body text-xs text-ch-cream truncate">{archivoNombre}</p>
                    <a href={form.foto_url} target="_blank" rel="noopener noreferrer"
                      className="font-body text-[10px] text-ch-muted hover:text-ch-cream">Ver archivo →</a>
                  </div>
                </div>
            }
            <button onClick={() => { setFotoPreview(null); setArchivoNombre(null); set('foto_url', '') }}
              className="absolute top-2 right-2 bg-ch-surface border border-ch-border text-ch-muted font-body text-xs px-2 py-1 hover:text-red-400 transition-colors">
              ✕
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} disabled={subiendo}
            className="w-full border border-dashed border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs py-4 transition-colors disabled:opacity-50">
            {subiendo ? 'Subiendo...' : '📎 Adjuntar imagen o PDF'}
          </button>
        )}
      </div>

      {/* Banner de datos detectados por parser PDF */}
      {parseando && (
        <p className="font-body text-[10px] text-ch-muted animate-pulse">
          Analizando factura…
        </p>
      )}
      {datosDetectados && !parseando && (
        <div className="border border-ch-green/40 bg-ch-green/5 p-3 space-y-1.5">
          <p className="font-body text-[9px] uppercase tracking-[0.35em] text-ch-green mb-2">
            Datos detectados en el PDF
          </p>
          {datosDetectados.rut_emisor && (
            <p className="font-body text-xs text-ch-cream font-mono">RUT: {datosDetectados.rut_emisor}</p>
          )}
          {datosDetectados.razon_social && (
            <p className="font-body text-xs text-ch-cream">{datosDetectados.razon_social}</p>
          )}
          {datosDetectados.monto && (
            <p className="font-body text-xs text-ch-cream font-mono">
              Total: ${datosDetectados.monto.toLocaleString('es-CL')}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={aplicarDatosDetectados}
              className="font-body text-[9px] uppercase tracking-[0.3em] bg-ch-green text-ch-black px-3 py-1.5 hover:bg-ch-green-light transition-colors"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={() => setDatosDetectados(null)}
              className="font-body text-[9px] text-ch-muted hover:text-ch-cream transition-colors px-2"
            >
              Ignorar
            </button>
          </div>
        </div>
      )}

      {error && <p className="font-body text-[10px] text-red-400 border border-red-500/30 px-3 py-2">{error}</p>}

      <div className="flex gap-2 flex-wrap pt-1">
        <button onClick={() => guardar(true)} disabled={!puedeGuardar}
          className="flex-1 bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase py-2.5 transition-colors disabled:opacity-40">
          {isPending ? 'Guardando...' : '+ Guardar y agregar otro'}
        </button>
        <button onClick={() => guardar(false)} disabled={!puedeGuardar}
          className="border border-ch-green/60 text-ch-green hover:bg-ch-green/10 font-body text-[10px] tracking-[0.35em] uppercase px-3 py-2.5 transition-colors disabled:opacity-40">
          {isPending ? '...' : 'Guardar y cerrar'}
        </button>
        <button onClick={onCancel}
          className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-3 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}
