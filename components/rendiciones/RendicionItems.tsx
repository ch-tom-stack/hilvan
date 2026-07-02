'use client'

import { useState, useTransition, useRef } from 'react'
import { toastError } from '@/lib/toast'
import { toggleItemCompletado } from '@/app/actions/rendiciones'
import { createClient } from '@/lib/supabase/client'
import { calcularRetencion } from '@/types'
import type { Rendicion, RendicionGasto } from '@/types'
import FormularioGasto from './FormularioGasto'
import NotasGlosa from './NotasGlosa'

const TIPO_LABEL: Record<string, string> = {
  honorarios: 'Honorarios', transporte: 'Transporte', alimentacion: 'Alimentación',
  arte: 'Arte / Props', insumos: 'Insumos', servicios: 'Servicios', viaticos: 'Viáticos', otro: 'Otro',
}

export interface Item {
  id: string
  nombre: string
  tipo: string
  precio_neto_proveedor: number
  cantidad: number
  rendicion_completada?: boolean
}

// ─── DepSection ───────────────────────────────────────────────────────────────

export function DepSection({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(true)
  return (
    <div>
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center gap-2 mb-3 pb-1 border-b border-ch-border/40 group">
        <span className="font-body text-[9px] text-ch-muted group-hover:text-ch-cream transition-colors">{abierto ? '▾' : '▸'}</span>
        <span className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted group-hover:text-ch-cream transition-colors flex-1 text-left">{nombre}</span>
      </button>
      {abierto && children}
    </div>
  )
}

// ─── ItemGlosaSection ─────────────────────────────────────────────────────────

export function ItemGlosaSection({
  rendicionId, item, gastos,
  onAgregarGasto,
  onAprobarContenido, onRechazar, onAprobarPago, onGenerarLink, onEliminarGasto,
  puedeAprobarPago, puedeGenerarLink, colaboradorId, isPending,
}: {
  rendicionId: string
  item: Item
  gastos: RendicionGasto[]
  onAgregarGasto: (g: RendicionGasto) => void
  onAprobarContenido: (gastoId: string) => void
  onRechazar: (gastoId: string) => void
  onAprobarPago: (gastoId: string, comprobante?: string) => void
  onGenerarLink: () => void
  onEliminarGasto: (gastoId: string) => void
  puedeAprobarPago: boolean
  puedeGenerarLink: boolean
  colaboradorId?: string
  isPending: boolean
}) {
  const [isPendingLocal, startTransitionLocal] = useTransition()
  const [completado, setCompletado] = useState(item.rendicion_completada ?? false)
  const [formAbierto, setFormAbierto] = useState(false)
  const [notasAbiertas, setNotasAbiertas] = useState(false)

  const presupuesto = item.precio_neto_proveedor * item.cantidad
  const rendido = gastos
    .filter(g => ['enviada', 'aprobada', 'pago_aprobado'].includes(g.estado))
    .reduce((s, g) => s + g.monto, 0)
  const diferencia = presupuesto - rendido
  const esPerdida = diferencia < 0

  const handleToggleCompletado = (v: boolean) => {
    setCompletado(v)
    startTransitionLocal(async () => {
      try { await toggleItemCompletado(item.id, v) } catch (e) { toastError(e instanceof Error ? e.message : 'Error al actualizar') }
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5">
        <span className="font-body text-xs text-ch-cream flex-1">{item.nombre}</span>
        <span className="font-body text-[10px] text-ch-muted font-mono whitespace-nowrap hidden sm:block">
          ${presupuesto.toLocaleString('es-CL')}
          {rendido > 0 && <> · rend ${rendido.toLocaleString('es-CL')}</>}
          {' · '}
          <span className={esPerdida ? 'text-red-400' : ''}>
            {esPerdida ? `−$${Math.abs(diferencia).toLocaleString('es-CL')}` : `disp $${diferencia.toLocaleString('es-CL')}`}
          </span>
        </span>
        <button onClick={() => setNotasAbiertas(v => !v)}
          className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1"
          title="Notas">📝</button>
        {puedeGenerarLink && (
          <button onClick={onGenerarLink}
            className="font-body text-[9px] text-ch-muted hover:text-blue-300 transition-colors px-2 py-0.5 border border-ch-border/40 hover:border-blue-500/40 whitespace-nowrap">
            Link →
          </button>
        )}
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={completado} disabled={isPendingLocal}
            onChange={e => handleToggleCompletado(e.target.checked)}
            className="accent-ch-green w-3 h-3" />
          <span className="font-body text-[9px] text-ch-muted">Rendido</span>
        </label>
        <button onClick={() => setFormAbierto(v => !v)}
          className={`font-body text-[9px] tracking-wider uppercase px-2.5 py-1 border transition-colors whitespace-nowrap ${
            formAbierto
              ? 'border-ch-green/50 text-ch-green bg-ch-green/5'
              : 'border-ch-border/50 text-ch-muted hover:text-ch-cream hover:border-ch-border'
          }`}>
          {formAbierto ? '− Cancelar' : '+ Gasto'}
        </button>
      </div>

      {notasAbiertas && <NotasGlosa cotizacionItemId={item.id} />}

      {formAbierto && (
        <div className="ml-2 mb-2">
          <FormularioGasto
            rendicionId={rendicionId}
            cotizacionItemId={item.id}
            itemTipo={item.tipo}
            colaboradorId={colaboradorId}
            esExterno={false}
            onSuccess={(gasto, continuar) => {
              onAgregarGasto(gasto)
              if (!continuar) setFormAbierto(false)
            }}
            onCancel={() => setFormAbierto(false)}
          />
        </div>
      )}

      {gastos.length > 0 && (
        <div className="ml-4 space-y-2 mt-1 mb-2">
          {gastos.map(g => (
            <GastoRow key={g.id} gasto={g}
              onAprobarContenido={() => onAprobarContenido(g.id)}
              onAprobarPago={comp => onAprobarPago(g.id, comp)}
              onRechazar={() => onRechazar(g.id)}
              onEliminar={() => onEliminarGasto(g.id)}
              puedeAprobarPago={puedeAprobarPago}
              isPending={isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── GastoRow ─────────────────────────────────────────────────────────────────

export function GastoRow({ gasto: g, onAprobarContenido, onAprobarPago, onRechazar, onEliminar, puedeAprobarPago: puedeAprobarPagoProp, isPending }: {
  gasto: RendicionGasto
  onAprobarContenido: () => void
  onAprobarPago: (comprobante?: string) => void
  onRechazar: () => void
  onEliminar?: () => void
  puedeAprobarPago: boolean
  isPending: boolean
}) {
  const [mostrarFormPago, setMostrarFormPago] = useState(false)
  const [subiendoPago, setSubiendoPago] = useState(false)
  const [comprobantePago, setComprobantePago] = useState<{ url: string; nombre: string } | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState(false)
  const fileRefPago = useRef<HTMLInputElement>(null)

  const retencion = g.tipo_documento ? calcularRetencion(g) : null
  const colNombre = (g.colaborador as any)?.nombre || g.nombre_libre || '—'
  const esExterno = g.origen === 'externo'
  const puedeAprobarPago = puedeAprobarPagoProp && ((g.estado === 'enviada' && !esExterno) || g.estado === 'aprobada')

  const subirComprobantePago = async (file: File) => {
    setSubiendoPago(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `rendiciones/pagos/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('rendiciones').upload(path, file)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('rendiciones').getPublicUrl(path)
      setComprobantePago({ url: publicUrl, nombre: file.name })
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al subir comprobante')
    } finally {
      setSubiendoPago(false)
    }
  }

  const ESTADO_BORDER: Record<string, string> = {
    borrador: 'border-ch-border/40',
    enviada: 'border-amber-500/20 bg-amber-500/5',
    aprobada: 'border-blue-500/20 bg-blue-500/5',
    rechazada: 'border-red-500/20 bg-red-500/5',
    pago_aprobado: 'border-ch-green/20 bg-ch-green/5',
  }

  return (
    <div className={`border p-3 ${ESTADO_BORDER[g.estado] || 'border-ch-border/40'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-body text-xs text-ch-cream">{colNombre}</span>
            <span className="font-body text-[9px] text-ch-muted">{TIPO_LABEL[g.tipo] || g.tipo}</span>
            {esExterno && <span className="font-body text-[9px] px-1.5 border border-blue-500/40 text-blue-400">Externo</span>}
            {g.tipo_documento === 'sin_documento' && (
              <span className="font-body text-[9px] px-1.5 border border-red-500/40 text-red-400">⚠ SIN DOC</span>
            )}
            {g.tipo_documento === 'boleta' && <span className="font-body text-[9px] text-ch-muted">Boleta</span>}
            {g.tipo_documento === 'factura' && <span className="font-body text-[9px] text-ch-muted">Factura</span>}
            {g.tipo_documento === 'exenta' && (
              <span className="font-body text-[9px] px-1.5 border border-ch-border/40 text-ch-muted">Exenta</span>
            )}
          </div>
          <p className="font-body text-[10px] text-ch-muted truncate">{g.descripcion}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="font-body text-sm text-ch-cream font-mono">${g.monto.toLocaleString('es-CL')}</span>
            {retencion && retencion.retencion > 0 && (
              <span className="font-body text-[10px] text-ch-muted font-mono">
                ret. ${retencion.retencion.toLocaleString('es-CL')} · neto ${retencion.neto.toLocaleString('es-CL')}
              </span>
            )}
          </div>
          {g.estado === 'rechazada' && g.motivo_rechazo && (
            <p className="font-body text-[10px] text-red-400 mt-1">Motivo: {g.motivo_rechazo}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {g.foto_url && (
            <a href={g.foto_url} target="_blank" rel="noopener noreferrer"
              className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors">
              Ver comprobante →
            </a>
          )}
          {g.comprobante_pago_url && (
            <a href={g.comprobante_pago_url} target="_blank" rel="noopener noreferrer"
              className="font-body text-[10px] text-ch-green hover:text-ch-green-light transition-colors">
              Ver comprobante pago →
            </a>
          )}

          {g.estado === 'enviada' && esExterno && (
            <div className="flex gap-1.5">
              <button onClick={onAprobarContenido} disabled={isPending}
                className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 transition-colors disabled:opacity-50">
                Aprobar
              </button>
              <button onClick={onRechazar} disabled={isPending}
                className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                Rechazar
              </button>
            </div>
          )}

          {g.estado === 'aprobada' && (
            <button onClick={onRechazar} disabled={isPending}
              className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 border border-red-500/30 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
              Rechazar
            </button>
          )}

          {puedeAprobarPago && !mostrarFormPago && (
            <button onClick={() => setMostrarFormPago(true)} disabled={isPending}
              className="font-body text-[10px] tracking-wider uppercase px-2.5 py-1 bg-ch-green hover:bg-ch-green-light text-ch-black transition-colors disabled:opacity-50">
              ✓ Pago
            </button>
          )}

          {/* Aprobación y PAGO son dimensiones independientes (ortogonales).
              'pago_aprobado' = aprobado PARA pago (no implica pagado); el pago real
              es g.pagado/g.fecha_pago (lo setea la conciliación / hilvan_pagar_gasto). */}
          {g.estado === 'pago_aprobado' && (
            <span className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-blue-500/30 text-blue-400">Aprobado p/pago</span>
          )}
          {g.pagado ? (
            <span title={g.fecha_pago ? `Pagado ${g.fecha_pago}` : 'Pagado'}
              className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-ch-green/40 text-ch-green">✓ Pagado</span>
          ) : g.estado === 'pago_aprobado' && (
            <span className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-ch-gold/30 text-ch-gold">Impaga</span>
          )}
          {/* Documento: aspecto independiente. Solo se muestra el AVISO cuando falta. */}
          {g.documento_recibido === false && (
            <span title="Documento (boleta/factura) pendiente de emisión"
              className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-ch-gold/40 text-ch-gold">Falta doc</span>
          )}
          {g.estado === 'rechazada' && (
            <span className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-red-500/30 text-red-400">Rechazada</span>
          )}
          {g.estado === 'borrador' && (
            <span className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-ch-border text-ch-muted">Borrador</span>
          )}
          {g.estado === 'aprobada' && !puedeAprobarPago && (
            <span className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-blue-500/30 text-blue-400">Aprobado</span>
          )}

          {onEliminar && !confirmEliminar && (
            <button onClick={() => setConfirmEliminar(true)} disabled={isPending}
              title="Eliminar gasto"
              className="font-body text-[10px] text-ch-muted/40 hover:text-red-400 transition-colors px-1 disabled:opacity-30">
              ✕
            </button>
          )}
          {onEliminar && confirmEliminar && (
            <span className="flex items-center gap-1">
              <span className="font-body text-[10px] text-ch-muted">¿Eliminar?</span>
              <button onClick={() => { setConfirmEliminar(false); onEliminar() }}
                className="font-body text-[10px] text-red-400 hover:text-red-300 px-1 transition-colors">
                Sí
              </button>
              <button onClick={() => setConfirmEliminar(false)}
                className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1 transition-colors">
                No
              </button>
            </span>
          )}
        </div>
      </div>

      {mostrarFormPago && (
        <div className="mt-3 pt-3 border-t border-ch-border/40 space-y-2">
          <p className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Comprobante de pago (opcional)</p>
          <input ref={fileRefPago} type="file" accept="image/*,application/pdf"
            onChange={e => { if (e.target.files?.[0]) subirComprobantePago(e.target.files[0]) }}
            className="hidden" />
          {comprobantePago ? (
            <div className="flex items-center gap-2 p-2 border border-ch-border/50">
              <span className="font-body text-[10px] text-ch-cream truncate flex-1">{comprobantePago.nombre}</span>
              <button onClick={() => setComprobantePago(null)} className="text-ch-muted hover:text-red-400 text-xs">✕</button>
            </div>
          ) : (
            <button onClick={() => fileRefPago.current?.click()} disabled={subiendoPago}
              className="w-full border border-dashed border-ch-border/50 text-ch-muted hover:text-ch-cream font-body text-[10px] py-2 transition-colors disabled:opacity-50">
              {subiendoPago ? 'Subiendo...' : '📎 Adjuntar comprobante'}
            </button>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { onAprobarPago(comprobantePago?.url); setMostrarFormPago(false); setComprobantePago(null) }}
              disabled={isPending || subiendoPago}
              className="flex-1 bg-ch-green hover:bg-ch-green-light text-ch-black font-body text-[10px] tracking-[0.35em] uppercase py-2 transition-colors disabled:opacity-50">
              {isPending ? 'Aprobando...' : 'Confirmar pago'}
            </button>
            <button onClick={() => { setMostrarFormPago(false); setComprobantePago(null) }}
              className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] px-3 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── FACTURA / PAGO BAR ───────────────────────────────────────────────────────

export function FacturaPagoBar({
  rendicion,
  onToggleFactura,
  onTogglePago,
  onAgregarArchivo,
  onEliminarArchivo,
}: {
  rendicion: Rendicion
  onToggleFactura: (v: boolean) => void
  onTogglePago: (v: boolean) => void
  onAgregarArchivo: (f: File) => Promise<void>
  onEliminarArchivo: (url: string) => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const archivos = rendicion.factura_archivos ?? []

  function nombreCorto(url: string) {
    const partes = url.split('/')
    return partes[partes.length - 1].slice(0, 28)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    try { await onAgregarArchivo(file) } finally { setSubiendo(false) }
    e.target.value = ''
  }

  return (
    <div className="border-t border-ch-border/30 px-4 py-3 flex items-start gap-6 flex-wrap bg-ch-black/40">
      <label className="flex items-center gap-2 cursor-pointer select-none group">
        <button
          type="button"
          role="checkbox"
          aria-checked={rendicion.factura_emitida}
          onClick={() => onToggleFactura(!rendicion.factura_emitida)}
          className={`w-8 h-4 rounded-full transition-colors relative ${rendicion.factura_emitida ? 'bg-ch-green' : 'bg-ch-border'}`}
        >
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${rendicion.factura_emitida ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
        <span className={`font-body text-[10px] tracking-[0.3em] uppercase transition-colors ${rendicion.factura_emitida ? 'text-ch-cream' : 'text-ch-muted group-hover:text-ch-cream'}`}>
          Factura emitida
        </span>
      </label>

      <div className="flex items-center gap-2 flex-wrap">
        {archivos.map(url => (
          <div key={url} className="flex items-center gap-1 border border-ch-border/50 px-2 py-1">
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="font-body text-[9px] text-blue-400 hover:underline truncate max-w-[140px]">
              {nombreCorto(url)}
            </a>
            <button onClick={() => onEliminarArchivo(url)}
              className="text-ch-border hover:text-red-400 transition-colors text-xs leading-none ml-0.5">×</button>
          </div>
        ))}
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleFile} className="hidden" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={subiendo}
          className="font-body text-[9px] tracking-widest uppercase px-2.5 py-1 border border-ch-border/50 text-ch-muted hover:text-ch-cream transition-colors disabled:opacity-50">
          {subiendo ? '...' : '+ Adjuntar'}
        </button>
      </div>

      <div className="hidden sm:block h-4 w-px bg-ch-border/30 self-center" />

      <label className="flex items-center gap-2 cursor-pointer select-none group">
        <button
          type="button"
          role="checkbox"
          aria-checked={rendicion.pago_recibido}
          onClick={() => onTogglePago(!rendicion.pago_recibido)}
          className={`w-8 h-4 rounded-full transition-colors relative ${rendicion.pago_recibido ? 'bg-ch-green' : 'bg-ch-border'}`}
        >
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${rendicion.pago_recibido ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
        <span className={`font-body text-[10px] tracking-[0.3em] uppercase transition-colors ${rendicion.pago_recibido ? 'text-ch-cream' : 'text-ch-muted group-hover:text-ch-cream'}`}>
          Pago recibido
        </span>
      </label>
    </div>
  )
}
