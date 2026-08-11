'use client'

import { useState, useTransition } from 'react'
import { crearInversion, editarInversion } from '@/app/actions/inversiones'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import { formatCLP, CATEGORIAS_INVERSION } from '@/types'
import type { Inversion, CategoriaInversion, TratamientoContable, TipoDocInversion } from '@/types'

// ─── RUT helpers ─────────────────────────────────────────────────────────────

function formatRut(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, '')
  if (clean.length < 2) return clean
  const cuerpo = clean.slice(0, -1)
  const dv = clean.slice(-1).toUpperCase()
  const formatted = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formatted}-${dv}`
}

function validarRut(rut: string): boolean {
  const clean = rut.replace(/[^0-9kK]/g, '')
  if (clean.length < 2) return false
  const cuerpo = clean.slice(0, -1)
  const dvIngresado = clean.slice(-1).toUpperCase()
  let suma = 0
  let multiplo = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplo
    multiplo = multiplo === 7 ? 2 : multiplo + 1
  }
  const dvCalculado = 11 - (suma % 11)
  const dvEsperado =
    dvCalculado === 11 ? '0' : dvCalculado === 10 ? 'K' : String(dvCalculado)
  return dvIngresado === dvEsperado
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  inversion?: Inversion
  onGuardado: (inv: Inversion) => void
  onCancelar: () => void
}

const EMPTY: Omit<Inversion, 'id' | 'created_at' | 'created_by'> = {
  categoria: 'equipo_audiovisual',
  descripcion: '',
  fecha_compra: '',
  monto: 0,
  tratamiento_contable: 'gasto_directo',
  proveedor: null,
  rut_proveedor: null,
  tipo_documento: null,
  factura_casa_hiedra: false,
  comprobante_url: null,
  notas: null,
}

export default function FormularioInversion({ inversion, onGuardado, onCancelar }: Props) {
  const esEdicion = Boolean(inversion)

  const [campos, setCampos] = useState<Omit<Inversion, 'id' | 'created_at' | 'created_by'>>({
    categoria:             inversion?.categoria             ?? EMPTY.categoria,
    descripcion:           inversion?.descripcion           ?? EMPTY.descripcion,
    fecha_compra:          inversion?.fecha_compra          ?? EMPTY.fecha_compra,
    monto:                 inversion?.monto                 ?? EMPTY.monto,
    tratamiento_contable:  inversion?.tratamiento_contable  ?? EMPTY.tratamiento_contable,
    proveedor:             inversion?.proveedor             ?? EMPTY.proveedor,
    rut_proveedor:         inversion?.rut_proveedor         ?? EMPTY.rut_proveedor,
    tipo_documento:        inversion?.tipo_documento        ?? EMPTY.tipo_documento,
    factura_casa_hiedra:   inversion?.factura_casa_hiedra   ?? EMPTY.factura_casa_hiedra,
    comprobante_url:       inversion?.comprobante_url       ?? EMPTY.comprobante_url,
    notas:                 inversion?.notas                 ?? EMPTY.notas,
  })

  const [rutRaw, setRutRaw] = useState(inversion?.rut_proveedor ?? '')
  const [rutError, setRutError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isPending, startTransition] = useTransition()

  const set = <K extends keyof typeof campos>(k: K, v: typeof campos[K]) =>
    setCampos(prev => ({ ...prev, [k]: v }))

  // ─── Upload comprobante ───────────────────────────────────────────────────

  async function handleUpload(file: File) {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('carpeta', 'inversiones')
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) { toastError('Error al subir comprobante'); setUploading(false); return }
      const json = await res.json()
      if (json.url) set('comprobante_url', json.url)
      else setError('Error subiendo comprobante')
    } catch {
      setError('Error subiendo comprobante')
    } finally {
      setUploading(false)
    }
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // RUT opcional — validar sólo si hay algo
    if (rutRaw.trim()) {
      if (!validarRut(rutRaw)) {
        setRutError(true)
        return
      }
    }

    const payload = {
      ...campos,
      monto: Number(campos.monto),
      rut_proveedor: rutRaw.trim() ? formatRut(rutRaw) : null,
      proveedor: campos.proveedor?.trim() || null,
      notas: campos.notas?.trim() || null,
      factura_casa_hiedra: campos.tipo_documento === 'factura' ? campos.factura_casa_hiedra : false,
    }

    startTransition(async () => {
      if (esEdicion && inversion) {
        const result = await editarInversion(inversion.id, payload)
        if (!result?.error) momento('guardado')
        if (result.error) { setError(result.error); return }
        onGuardado({ ...inversion, ...payload })
      } else {
        const result = await crearInversion(payload)
        if (!result?.error) momento('creado', { mensaje: 'Inversión creada' })
        if (result.error) { setError(result.error); return }
        if (result.data) onGuardado(result.data)
      }
    })
  }

  const inputCls = 'w-full bg-transparent border border-ch-border text-ch-cream font-body text-sm px-3 py-2 focus:outline-none focus:border-ch-cream transition-colors placeholder:text-ch-muted'
  const labelCls = 'block font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Fila 1: Categoría + Descripción */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Categoría *</label>
          <select
            value={campos.categoria}
            onChange={e => set('categoria', e.target.value as CategoriaInversion)}
            className={inputCls}
            required
          >
            {(Object.entries(CATEGORIAS_INVERSION) as [CategoriaInversion, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label className={labelCls}>Descripción *</label>
          <input
            type="text"
            value={campos.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            placeholder="Ej: Cámara Sony FX3, Adobe CC anual..."
            className={inputCls}
            required
          />
        </div>
      </div>

      {/* Fila 2: Fecha + Monto */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Fecha de compra *</label>
          <input
            type="date"
            value={campos.fecha_compra}
            onChange={e => set('fecha_compra', e.target.value)}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Monto *</label>
          <input
            type="number"
            min={0}
            step={1}
            value={campos.monto || ''}
            onChange={e => set('monto', Number(e.target.value))}
            placeholder="0"
            className={inputCls}
            required
          />
          {campos.monto > 0 && (
            <p className="text-ch-muted font-body text-xs mt-1">{formatCLP(campos.monto)}</p>
          )}
        </div>
      </div>

      {/* Tratamiento contable */}
      <div>
        <label className={labelCls}>Tratamiento contable *</label>
        <div className="flex gap-3">
          {(['gasto_directo', 'activo_fijo'] as TratamientoContable[]).map(op => (
            <button
              key={op}
              type="button"
              onClick={() => set('tratamiento_contable', op)}
              className={`flex-1 border font-body text-[10px] tracking-[0.3em] uppercase px-4 py-3 transition-colors ${
                campos.tratamiento_contable === op
                  ? 'border-ch-cream text-ch-cream bg-ch-cream/10'
                  : 'border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-cream/50'
              }`}
            >
              {op === 'gasto_directo' ? 'Gasto directo del período' : 'Activo fijo (el contador lo deprecia)'}
            </button>
          ))}
        </div>
      </div>

      {/* Fila 3: Proveedor + RUT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Proveedor</label>
          <input
            type="text"
            value={campos.proveedor ?? ''}
            onChange={e => set('proveedor', e.target.value || null)}
            placeholder="Ej: Sony Chile, Adobe Inc."
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>RUT proveedor</label>
          <input
            type="text"
            value={rutRaw}
            onChange={e => {
              setRutRaw(e.target.value)
              setRutError(false)
            }}
            placeholder="Ej: 76.123.456-7"
            className={`${inputCls} ${rutError ? 'border-red-400' : ''}`}
          />
          {rutError && (
            <p className="text-red-400 font-body text-xs mt-1">RUT inválido</p>
          )}
        </div>
      </div>

      {/* Tipo documento + Crédito fiscal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Tipo de documento</label>
          <select
            value={campos.tipo_documento ?? ''}
            onChange={e => {
              const v = e.target.value as TipoDocInversion | ''
              set('tipo_documento', v === '' ? null : v)
              if (v !== 'factura') set('factura_casa_hiedra', false)
            }}
            className={inputCls}
          >
            <option value="">Sin especificar</option>
            <option value="factura">Factura</option>
            <option value="sin_documento">Sin documento</option>
          </select>
        </div>

        {campos.tipo_documento === 'factura' && (
          <div className="flex items-center gap-3 pt-5">
            <button
              type="button"
              role="switch"
              aria-checked={campos.factura_casa_hiedra}
              onClick={() => set('factura_casa_hiedra', !campos.factura_casa_hiedra)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                campos.factura_casa_hiedra ? 'bg-ch-cream' : 'bg-ch-border'
              }`}
            >
              <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-ch-dark shadow ring-0 transition-transform ${
                campos.factura_casa_hiedra ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
            <span className="font-body text-xs text-ch-muted leading-tight">
              Factura emitida a nombre de Casa Hiedra
              <br />
              <span className="text-ch-muted/70">(genera crédito fiscal IVA)</span>
            </span>
          </div>
        )}
      </div>

      {/* Comprobante */}
      <div>
        <label className={labelCls}>Comprobante (imagen o PDF)</label>
        {campos.comprobante_url ? (
          <div className="flex items-center gap-3">
            <a
              href={campos.comprobante_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ch-muted hover:text-ch-cream font-body text-xs underline transition-colors"
            >
              Ver comprobante adjunto
            </a>
            <button
              type="button"
              onClick={() => set('comprobante_url', null)}
              className="text-ch-muted hover:text-red-400 font-body text-[10px] tracking-widest uppercase transition-colors"
            >
              ✕ Quitar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <label className="cursor-pointer border border-dashed border-ch-border hover:border-ch-cream/50 text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.3em] uppercase px-4 py-2 transition-colors">
              {uploading ? 'Subiendo...' : '↑ Adjuntar'}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                disabled={uploading}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleUpload(file)
                }}
              />
            </label>
            {campos.comprobante_url === null && (
              <span className="text-ch-muted font-body text-xs">Opcional</span>
            )}
          </div>
        )}
      </div>

      {/* Notas */}
      <div>
        <label className={labelCls}>Notas</label>
        <textarea
          value={campos.notas ?? ''}
          onChange={e => set('notas', e.target.value || null)}
          rows={2}
          placeholder="Observaciones, contexto de la compra..."
          className={`${inputCls} resize-none`}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 font-body text-xs">{error}</p>
      )}

      {/* Botones */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={isPending || uploading}
          className="border border-ch-cream text-ch-cream hover:bg-ch-cream hover:text-ch-dark font-body text-[10px] tracking-[0.35em] uppercase px-8 py-3 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Guardando...' : 'Guardar inversión'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
