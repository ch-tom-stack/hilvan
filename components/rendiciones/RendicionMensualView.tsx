'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toastError } from '@/lib/toast'
import {
  agregarGastoMensual,
  eliminarGastoMensual,
  actualizarEstadoRendicionMensual,
  getOCrearRendicionMensual,
  exportarCSVGastosMensual,
} from '@/app/actions/rendiciones_mensuales'
import { RendicionMensual, RendicionMensualGasto, CATEGORIAS_RENDICION_MENSUAL, EstadoRendicionMensual, formatCLP } from '@/types'
import { parseFechaLocal } from '@/lib/fechas'
import { calcularRetencion, tasaRetencionBoleta } from '@/lib/rendiciones-calc'

const TASA_BOLETA = tasaRetencionBoleta() // tasa del año actual (Ley 21.133)

const TIPO_DOC_OPCIONES = [
  { value: 'boleta', label: 'Boleta de honorarios' },
  { value: 'factura', label: 'Factura' },
  { value: 'boleta_consumo', label: 'Boleta de consumo' },
  { value: 'exenta', label: 'Exenta' },
  { value: 'sin_documento', label: 'Sin documento' },
]

const ESTADO_LABELS: Record<EstadoRendicionMensual, string> = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  pagado: 'Pagado',
}

const ESTADO_COLORS: Record<EstadoRendicionMensual, string> = {
  pendiente: 'text-amber-400',
  aprobado: 'text-blue-400',
  pagado: 'text-green-400',
}

interface Props {
  rendicionActual: RendicionMensual | null
  historial: RendicionMensual[]
  periodoActual: string
  usuarioNombre: string
  usuarioId: string
  esAdmin: boolean
}

function formatPeriodo(iso: string) {
  return parseFechaLocal(iso).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
}

const formatMonto = formatCLP

export default function RendicionMensualView({
  rendicionActual: rendicionInicial,
  historial,
  periodoActual,
  usuarioNombre,
  usuarioId,
  esAdmin,
}: Props) {
  const router = useRouter()
  const [rendicion, setRendicion] = useState<RendicionMensual | null>(rendicionInicial)
  const [isPending, startTransition] = useTransition()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [inicializando, setInicializando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Form state
  const [form, setForm] = useState({
    descripcion: '',
    monto: '',
    categoria: '',
    categoriaOtros: '',
    tipo_documento: '',
    archivo_url: '',
    rut_emisor: '',
    razon_social_emisor: '',
    factura_casa_hiedra: false,
    documento_recibido: true,
    fecha_documento: '',
  })
  const [uploadingFile, setUploadingFile] = useState(false)
  const [formError, setFormError] = useState('')
  const [inputEsBruto, setInputEsBruto] = useState(false)

  // Boleta de honorarios: el monto puede ingresarse como neto o bruto.
  // Internamente SIEMPRE se guarda el bruto (igual que en gastos de proyecto).
  const esBoleta = form.tipo_documento === 'boleta'
  // La tasa de retención depende del año de la boleta (Ley 21.133): usar el año
  // de `fecha_documento` si está; si no, el año actual.
  const tasaBoleta = form.fecha_documento
    ? tasaRetencionBoleta(Number(form.fecha_documento.slice(0, 4)))
    : TASA_BOLETA
  const montosBoleta = (() => {
    const val = parseInt(form.monto.replace(/\D/g, ''), 10)
    if (!esBoleta || !val || val <= 0) return null
    if (inputEsBruto) {
      const retencion = Math.round(val * tasaBoleta)
      return { bruto: val, retencion, neto: val - retencion }
    }
    const bruto = Math.round(val / (1 - tasaBoleta))
    return { bruto, retencion: bruto - val, neto: val }
  })()

  async function iniciarRendicion() {
    setInicializando(true)
    try {
      const r = await getOCrearRendicionMensual(periodoActual)
      setRendicion({ ...r, gastos: [] })
      router.refresh()
    } finally {
      setInicializando(false)
    }
  }

  async function handleFileUpload(file: File) {
    setUploadingFile(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('carpeta', 'rendicion-mensual')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Error subiendo archivo')
      const { url } = await res.json()
      setForm(f => ({ ...f, archivo_url: url }))
    } catch (e: any) {
      setFormError(e.message)
    } finally {
      setUploadingFile(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rendicion) return
    setFormError('')

    const categoriaFinal = form.categoria === 'Otros' ? (form.categoriaOtros.trim() || 'Otros') : form.categoria
    const montoIngresado = parseInt(form.monto.replace(/\D/g, ''), 10)
    if (!form.descripcion.trim()) return setFormError('La descripción es requerida')
    if (!montoIngresado || montoIngresado <= 0) return setFormError('El monto debe ser mayor a 0')
    // Boleta: persistir SIEMPRE el bruto (retención se calcula a partir de él).
    const monto = montosBoleta ? montosBoleta.bruto : montoIngresado

    startTransition(async () => {
      try {
        const gasto = await agregarGastoMensual({
          rendicion_mensual_id: rendicion.id,
          descripcion: form.descripcion.trim(),
          monto,
          categoria: categoriaFinal || null,
          archivo_url: form.archivo_url || null,
          tipo_documento: form.tipo_documento || null,
          cargado_por: usuarioNombre,
          cargado_por_id: usuarioId,
          rut_emisor: form.rut_emisor || null,
          razon_social_emisor: form.razon_social_emisor || null,
          factura_casa_hiedra: form.factura_casa_hiedra,
          documento_recibido: form.documento_recibido,
          fecha_documento: form.fecha_documento || null,
        })
        setRendicion(r => r ? { ...r, gastos: [...(r.gastos ?? []), gasto] } : r)
        setForm({ descripcion: '', monto: '', categoria: '', categoriaOtros: '', tipo_documento: '', archivo_url: '', rut_emisor: '', razon_social_emisor: '', factura_casa_hiedra: false, documento_recibido: true, fecha_documento: '' })
        setInputEsBruto(false)
        setModalAbierto(false)
        router.refresh()
      } catch (err: any) {
        setFormError(err.message)
      }
    })
  }

  async function handleEliminar(id: string) {
    startTransition(async () => {
      try {
        await eliminarGastoMensual(id)
        setRendicion(r => r ? { ...r, gastos: (r.gastos ?? []).filter(g => g.id !== id) } : r)
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al eliminar gasto')
      }
    })
  }

  async function handleEstado(estado: EstadoRendicionMensual) {
    if (!rendicion) return
    startTransition(async () => {
      try {
        await actualizarEstadoRendicionMensual(rendicion.id, estado)
        setRendicion(r => r ? { ...r, estado } : r)
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al actualizar estado')
      }
    })
  }

  async function handleExportar() {
    if (!rendicion) return
    const csv = await exportarCSVGastosMensual(rendicion.id)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gastos-${rendicion.periodo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const gastos = rendicion?.gastos ?? []
  const totalGastado = gastos.reduce((s, g) => s + g.monto, 0)
  const presupuesto = rendicion?.presupuesto ?? 100000
  const pct = Math.min(100, Math.round((totalGastado / presupuesto) * 100))
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-green-500'

  return (
    <div>
      {/* Mes actual */}
      <div className="border border-ch-border p-6 mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">
              {formatPeriodo(periodoActual)}
            </p>
            {rendicion ? (
              <p className={`font-body text-xs tracking-widest uppercase ${ESTADO_COLORS[rendicion.estado]}`}>
                {ESTADO_LABELS[rendicion.estado]}
              </p>
            ) : (
              <p className="text-ch-muted text-xs">No hay rendición este mes</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {rendicion && esAdmin && (
              <>
                {rendicion.estado === 'pendiente' && (
                  <button onClick={() => handleEstado('aprobado')} disabled={isPending}
                    className="border border-blue-700 text-blue-400 hover:bg-blue-900/20 font-body text-[9px] tracking-[0.35em] uppercase px-4 py-2 transition-colors disabled:opacity-50">
                    Aprobar
                  </button>
                )}
                {rendicion.estado === 'aprobado' && (
                  <button onClick={() => handleEstado('pagado')} disabled={isPending}
                    className="border border-green-700 text-green-400 hover:bg-green-900/20 font-body text-[9px] tracking-[0.35em] uppercase px-4 py-2 transition-colors disabled:opacity-50">
                    Marcar pagado
                  </button>
                )}
                <button onClick={handleExportar}
                  className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-[0.35em] uppercase px-4 py-2 transition-colors">
                  Exportar CSV
                </button>
              </>
            )}
            {!rendicion ? (
              <button onClick={iniciarRendicion} disabled={inicializando}
                className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-[0.35em] uppercase px-4 py-2 transition-colors">
                {inicializando ? 'Creando...' : 'Iniciar mes'}
              </button>
            ) : (
              <button onClick={() => setModalAbierto(true)}
                className="border border-ch-border text-ch-cream hover:bg-ch-dark font-body text-[9px] tracking-[0.35em] uppercase px-4 py-2 transition-colors">
                + Agregar gasto
              </button>
            )}
          </div>
        </div>

        {rendicion && (
          <>
            {/* Presupuesto */}
            <div className="mb-6">
              <div className="flex justify-between text-xs text-ch-muted mb-1">
                <span>Presupuesto mensual</span>
                <span>{formatMonto(totalGastado)} / {formatMonto(presupuesto)} ({pct}%)</span>
              </div>
              <div className="h-1.5 bg-ch-dark rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Lista de gastos */}
            {gastos.length === 0 ? (
              <p className="text-ch-muted text-sm text-center py-8">Sin gastos registrados este mes</p>
            ) : (
              <div className="divide-y divide-ch-border border-t border-ch-border">
                {gastos.map(g => (
                  <GastoRow key={g.id} gasto={g} onEliminar={handleEliminar} isPending={isPending} esAdmin={esAdmin} usuarioId={usuarioId} />
                ))}
              </div>
            )}

            {gastos.length > 0 && (
              <div className="flex justify-end mt-4 pt-3 border-t border-ch-border">
                <p className="font-body text-sm text-ch-cream font-mono">
                  Total: {formatMonto(totalGastado)}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Historial */}
      {historial.length > 0 && (
        <div>
          <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-4">Historial</p>
          <div className="space-y-2">
            {historial.map(r => {
              const total = (r.gastos ?? []).reduce((s, g) => s + g.monto, 0)
              return (
                <div key={r.id} className="border border-ch-border p-4 flex items-center justify-between">
                  <div>
                    <p className="text-ch-cream text-sm capitalize">{formatPeriodo(r.periodo)}</p>
                    <p className={`text-xs ${ESTADO_COLORS[r.estado]}`}>{ESTADO_LABELS[r.estado]}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-ch-cream">{formatMonto(total)}</p>
                    <p className="text-xs text-ch-muted">{(r.gastos ?? []).length} gasto{(r.gastos ?? []).length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalAbierto(false) }}>
          <div className="bg-ch-black border border-ch-border w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Nuevo gasto</p>
              <button onClick={() => setModalAbierto(false)} className="text-ch-muted hover:text-ch-cream text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">Descripción *</label>
                <input
                  type="text"
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Ej: Taxi a locación, café reunión..."
                  className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green placeholder:text-ch-subtle"
                />
              </div>

              <div>
                <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">Fecha del documento (opcional)</label>
                <input
                  type="date"
                  value={form.fecha_documento}
                  onChange={e => setForm(f => ({ ...f, fecha_documento: e.target.value }))}
                  className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green"
                />
                <p className="mt-1 font-body text-[10px] text-ch-subtle">Fecha real de la boleta/documento — define el mes y el año de retención.</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] tracking-widest uppercase text-ch-muted">Monto *</label>
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
                <input
                  type="number"
                  value={form.monto}
                  onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                  placeholder={esBoleta && !inputEsBruto ? 'Ej: 126900 (lo que recibe)' : '0'}
                  min="1"
                  className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green placeholder:text-ch-subtle"
                />
                {montosBoleta && (
                  <p className="mt-1 font-body text-[10px] text-ch-muted font-mono">
                    {inputEsBruto
                      ? `Retención ${(tasaBoleta * 100).toFixed(2).replace(/\.?0+$/, '')}% = ${formatCLP(montosBoleta.retencion)} · Neto = ${formatCLP(montosBoleta.neto)}`
                      : `Bruto = ${formatCLP(montosBoleta.bruto)} · Retención = ${formatCLP(montosBoleta.retencion)}`}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-2">Categoría</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {CATEGORIAS_RENDICION_MENSUAL.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, categoria: cat }))}
                      className={`font-body text-[9px] tracking-widest uppercase px-3 py-1.5 border transition-colors ${
                        form.categoria === cat
                          ? 'border-ch-cream text-ch-cream bg-ch-dark'
                          : 'border-ch-border text-ch-muted hover:text-ch-cream'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {form.categoria === 'Otros' && (
                  <input
                    type="text"
                    value={form.categoriaOtros}
                    onChange={e => setForm(f => ({ ...f, categoriaOtros: e.target.value }))}
                    placeholder="Especificar categoría..."
                    className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green placeholder:text-ch-subtle"
                  />
                )}
              </div>

              <div>
                <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">Tipo de documento</label>
                <select
                  value={form.tipo_documento}
                  onChange={e => { setForm(f => ({ ...f, tipo_documento: e.target.value })); setInputEsBruto(false) }}
                  className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green"
                >
                  <option value="">— Sin especificar</option>
                  {TIPO_DOC_OPCIONES.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Datos del emisor — para boleta de honorarios y factura */}
              {(form.tipo_documento === 'factura' || form.tipo_documento === 'boleta') && (
                <div className="space-y-3 border-l-2 border-ch-green/30 pl-3">
                  <div>
                    <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">RUT Emisor</label>
                    <input type="text" value={form.rut_emisor}
                      onChange={e => setForm(f => ({ ...f, rut_emisor: e.target.value }))}
                      placeholder="Ej: 16.123.456-7"
                      className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green placeholder:text-ch-subtle" />
                  </div>
                  <div>
                    <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">{form.tipo_documento === 'boleta' ? 'Nombre del emisor' : 'Razón Social'}</label>
                    <input type="text" value={form.razon_social_emisor}
                      onChange={e => setForm(f => ({ ...f, razon_social_emisor: e.target.value }))}
                      placeholder={form.tipo_documento === 'boleta' ? 'Ej: Josué de la Fuente' : 'Nombre del emisor'}
                      className="w-full bg-ch-surface border border-ch-border text-ch-cream text-sm px-3 py-2 focus:outline-none focus:border-ch-green placeholder:text-ch-subtle" />
                  </div>
                  {form.tipo_documento === 'factura' && (
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={form.factura_casa_hiedra}
                        onChange={e => setForm(f => ({ ...f, factura_casa_hiedra: e.target.checked }))}
                        className="w-4 h-4 accent-ch-green" />
                      <span className="text-xs text-ch-cream">Factura emitida a nombre de Casa Hiedra</span>
                      <span className="text-[9px] text-ch-muted">(crédito fiscal IVA)</span>
                    </label>
                  )}
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={!form.documento_recibido}
                      onChange={e => setForm(f => ({ ...f, documento_recibido: !e.target.checked }))}
                      className="w-4 h-4 accent-ch-gold" />
                    <span className="text-xs text-ch-cream">Documento pendiente</span>
                    <span className="text-[9px] text-ch-muted">(boleta/factura aún no emitida)</span>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-[10px] tracking-widest uppercase text-ch-muted mb-1">Archivo / Foto</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]) }}
                  className="hidden"
                />
                {form.archivo_url ? (
                  <div className="flex items-center gap-2">
                    <a href={form.archivo_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 underline truncate max-w-[200px]">
                      Archivo adjunto
                    </a>
                    <button type="button" onClick={() => setForm(f => ({ ...f, archivo_url: '' }))}
                      className="text-ch-muted hover:text-red-400 text-xs">✕</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingFile}
                    className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-widest uppercase px-4 py-2 transition-colors disabled:opacity-50">
                    {uploadingFile ? 'Subiendo...' : 'Adjuntar archivo'}
                  </button>
                )}
              </div>

              {formError && (
                <p className="text-red-400 text-xs">{formError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalAbierto(false)}
                  className="flex-1 border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-[0.35em] uppercase py-3 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={isPending}
                  className="flex-1 border border-ch-cream text-ch-cream hover:bg-ch-dark font-body text-[9px] tracking-[0.35em] uppercase py-3 transition-colors disabled:opacity-50">
                  {isPending ? 'Guardando...' : 'Guardar gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function GastoRow({ gasto, onEliminar, isPending, esAdmin, usuarioId }: {
  gasto: RendicionMensualGasto
  onEliminar: (id: string) => void
  isPending: boolean
  esAdmin: boolean
  usuarioId: string
}) {
  const puedeEliminar = esAdmin || gasto.cargado_por_id === usuarioId

  return (
    <div className="py-3 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-ch-cream text-sm">{gasto.descripcion}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {gasto.categoria && (
            <span className="font-body text-[9px] tracking-widest uppercase text-ch-subtle">{gasto.categoria}</span>
          )}
          {gasto.tipo_documento && (
            <span className="font-body text-[9px] tracking-widest uppercase text-ch-subtle">{gasto.tipo_documento}</span>
          )}
          <span className="text-ch-subtle text-[9px]">{gasto.cargado_por}</span>
        </div>
        {gasto.archivo_url && (
          <a href={gasto.archivo_url} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-blue-400 underline mt-0.5 inline-block">
            Ver adjunto
          </a>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <span className="font-mono text-sm text-ch-cream">{formatMonto(gasto.monto)}</span>
          {gasto.tipo_documento === 'boleta' && (() => {
            const r = calcularRetencion({ monto: gasto.monto, tipo_documento: gasto.tipo_documento })
            return <p className="font-body text-[9px] text-ch-subtle font-mono">ret. {formatMonto(r.retencion)} · neto {formatMonto(r.neto)}</p>
          })()}
        </div>
        {puedeEliminar && (
          <button onClick={() => onEliminar(gasto.id)} disabled={isPending}
            className="text-ch-subtle hover:text-red-400 transition-colors text-sm disabled:opacity-50">
            ×
          </button>
        )}
      </div>
    </div>
  )
}
