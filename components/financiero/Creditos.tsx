'use client'

import { useState, useTransition } from 'react'
import {
  crearGastoFijo, eliminarGastoFijo, toggleGastoFijoActivo,
  marcarCuotaPagada, desmarcarCuotaPagada,
} from '@/app/actions/financiero'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import type { GastoFijo, GastoFijoCuota, TipoGastoFijo } from '@/types'
import { formatCLP } from '@/types'
import { parseFechaLocal } from '@/lib/fechas'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<TipoGastoFijo, string> = {
  credito_bancario: 'Crédito bancario',
  prestamo_socio: 'Préstamo socio',
  otro: 'Otro',
}

const TIPOS_ORDEN: TipoGastoFijo[] = ['credito_bancario', 'prestamo_socio', 'otro']

function formatFecha(iso: string) {
  return parseFechaLocal(iso).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function proximaVencimiento(cuotas: GastoFijoCuota[]): string | null {
  const pendiente = cuotas.find(c => !c.pagada)
  return pendiente ? pendiente.fecha_vencimiento : null
}

// ─── Estado form ─────────────────────────────────────────────────────────────

const FORM_VACIO = {
  nombre: '', tipo: 'credito_bancario' as TipoGastoFijo,
  acreedor: '', descripcion: '',
  monto_total: '', monto_cuota: '', n_cuotas: '', dia_vencimiento: '10',
  fecha_inicio: '', tasa_interes: '',
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Creditos({ inicial }: { inicial: GastoFijo[] }) {
  const [isPending, startTransition] = useTransition()
  const [gastos, setGastos] = useState<GastoFijo[]>(inicial)
  const [formAbierto, setFormAbierto] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})
  const [confirmarEliminar, setConfirmarEliminar] = useState<string | null>(null)
  const [pagando, setPagando] = useState<{ cuotaId: string; fecha: string } | null>(null)

  const toggleExpand = (id: string) =>
    setExpandidos(p => ({ ...p, [id]: !p[id] }))

  // ── Crear ─────────────────────────────────────────────────────────────────
  const formValido =
    form.nombre.trim() && form.monto_cuota && form.n_cuotas &&
    form.dia_vencimiento && form.fecha_inicio

  const handleCrear = () => {
    if (!formValido) return
    startTransition(async () => {
      try {
        const nuevo = await crearGastoFijo({
          nombre: form.nombre.trim(),
          tipo: form.tipo,
          acreedor: form.acreedor.trim(),
          descripcion: form.descripcion.trim(),
          monto_total: Number(form.monto_total) || 0,
          monto_cuota: Number(form.monto_cuota),
          n_cuotas: Number(form.n_cuotas),
          dia_vencimiento: Number(form.dia_vencimiento),
          fecha_inicio: form.fecha_inicio,
          tasa_interes: form.tasa_interes ? Number(form.tasa_interes) : null,
        })
        setGastos(prev => [...prev, nuevo])
        setForm(FORM_VACIO)
        setFormAbierto(false)
        setExpandidos(p => ({ ...p, [nuevo.id]: true }))
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al crear crédito')
      }
    })
  }

  // ── Eliminar ──────────────────────────────────────────────────────────────
  const handleEliminar = (id: string) => {
    setConfirmarEliminar(null)
    setGastos(prev => prev.filter(g => g.id !== id))
    startTransition(async () => {
      try { await eliminarGastoFijo(id); momento('item.eliminado') } catch (e) { toastError(e instanceof Error ? e.message : 'Error al eliminar'); momento('error', { mensaje: 'Error al eliminar' }) }
    })
  }

  // ── Toggle activo ─────────────────────────────────────────────────────────
  const handleToggleActivo = (id: string, activo: boolean) => {
    setGastos(prev => prev.map(g => g.id === id ? { ...g, activo } : g))
    startTransition(async () => {
      try { await toggleGastoFijoActivo(id, activo); momento(activo ? 'toggle.on' : 'toggle.off') } catch (e) { toastError(e instanceof Error ? e.message : 'Error al actualizar'); momento('error', { mensaje: 'Error al actualizar' }) }
    })
  }

  // ── Marcar cuota pagada ───────────────────────────────────────────────────
  const handleMarcarPagada = (cuotaId: string, gastoId: string) => {
    if (!pagando || pagando.cuotaId !== cuotaId) return
    const fecha = pagando.fecha
    setPagando(null)
    startTransition(async () => {
      try {
        const updated = await marcarCuotaPagada(cuotaId, fecha)
        momento('gasto.pagado')
        setGastos(prev => prev.map(g => g.id !== gastoId ? g : {
          ...g,
          cuotas: (g.cuotas ?? []).map(c => c.id === cuotaId ? updated : c),
        }))
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al marcar cuota')
      }
    })
  }

  const handleDesmarcar = (cuotaId: string, gastoId: string) => {
    startTransition(async () => {
      try {
        const updated = await desmarcarCuotaPagada(cuotaId)
        momento('toggle.off')
        setGastos(prev => prev.map(g => g.id !== gastoId ? g : {
          ...g,
          cuotas: (g.cuotas ?? []).map(c => c.id === cuotaId ? updated : c),
        }))
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Error al desmarcar cuota')
      }
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-10">

      {/* Botón nuevo */}
      <div className="flex justify-end">
        <button onClick={() => setFormAbierto(v => !v)}
          className={`font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2.5 border transition-colors ${
            formAbierto
              ? 'border-ch-green/50 text-ch-green bg-ch-green/5'
              : 'border-ch-border text-ch-muted hover:text-ch-cream'
          }`}>
          {formAbierto ? '− Cancelar' : '+ Nuevo crédito / préstamo'}
        </button>
      </div>

      {/* Formulario nuevo */}
      {formAbierto && (
        <FormNuevo
          form={form}
          setForm={setForm}
          onCrear={handleCrear}
          onCancelar={() => { setFormAbierto(false); setForm(FORM_VACIO) }}
          isPending={isPending}
          valido={!!formValido}
        />
      )}

      {/* Grupos por tipo */}
      {TIPOS_ORDEN.map(tipo => {
        const grupo = gastos.filter(g => g.tipo === tipo)
        if (grupo.length === 0) return null
        return (
          <section key={tipo}>
            <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-4 pb-2 border-b border-ch-border/40">
              {TIPO_LABEL[tipo]}
            </p>
            <div className="space-y-3">
              {grupo.map(gasto => (
                <GastoFijoCard
                  key={gasto.id}
                  gasto={gasto}
                  expandido={expandidos[gasto.id] ?? false}
                  onToggleExpand={() => toggleExpand(gasto.id)}
                  confirmarEliminar={confirmarEliminar === gasto.id}
                  onConfirmarEliminar={() => setConfirmarEliminar(gasto.id)}
                  onCancelarEliminar={() => setConfirmarEliminar(null)}
                  onEliminar={() => handleEliminar(gasto.id)}
                  onToggleActivo={v => handleToggleActivo(gasto.id, v)}
                  pagando={pagando}
                  onIniciarPago={(cuotaId, fecha) => setPagando({ cuotaId, fecha })}
                  onCancelarPago={() => setPagando(null)}
                  onConfirmarPago={cuotaId => handleMarcarPagada(cuotaId, gasto.id)}
                  onDesmarcar={cuotaId => handleDesmarcar(cuotaId, gasto.id)}
                  isPending={isPending}
                />
              ))}
            </div>
          </section>
        )
      })}

      {gastos.length === 0 && !formAbierto && (
        <div className="border border-dashed border-ch-border/40 py-16 text-center">
          <p className="font-body text-sm text-ch-muted">
            No hay créditos ni préstamos registrados.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── GastoFijoCard ────────────────────────────────────────────────────────────

function GastoFijoCard({
  gasto, expandido, onToggleExpand,
  confirmarEliminar, onConfirmarEliminar, onCancelarEliminar, onEliminar,
  onToggleActivo,
  pagando, onIniciarPago, onCancelarPago, onConfirmarPago, onDesmarcar,
  isPending,
}: {
  gasto: GastoFijo
  expandido: boolean
  onToggleExpand: () => void
  confirmarEliminar: boolean
  onConfirmarEliminar: () => void
  onCancelarEliminar: () => void
  onEliminar: () => void
  onToggleActivo: (v: boolean) => void
  pagando: { cuotaId: string; fecha: string } | null
  onIniciarPago: (cuotaId: string, fecha: string) => void
  onCancelarPago: () => void
  onConfirmarPago: (cuotaId: string) => void
  onDesmarcar: (cuotaId: string) => void
  isPending: boolean
}) {
  const cuotas = gasto.cuotas ?? []
  const pagadas = cuotas.filter(c => c.pagada).length
  const proxFecha = proximaVencimiento(cuotas)

  return (
    <div className={`border ${gasto.activo ? 'border-ch-border/50' : 'border-ch-border/20 opacity-60'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        <button onClick={onToggleExpand}
          className="font-body text-[10px] text-ch-muted shrink-0">
          {expandido ? '▾' : '▸'}
        </button>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleExpand}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display italic text-lg text-ch-cream">{gasto.nombre}</span>
            {gasto.acreedor && (
              <span className="font-body text-[10px] text-ch-muted">{gasto.acreedor}</span>
            )}
            {!gasto.activo && (
              <span className="font-body text-[9px] px-1.5 border border-ch-border/40 text-ch-muted">Inactivo</span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-0.5 flex-wrap">
            <span className="font-mono text-sm text-ch-cream">{formatCLP(gasto.monto_cuota)}<span className="font-body text-[10px] text-ch-muted">/mes</span></span>
            <span className="font-body text-[10px] text-ch-muted">{pagadas}/{gasto.n_cuotas} pagadas</span>
            {proxFecha && (
              <span className="font-body text-[10px] text-ch-muted">
                Próx. venc: {formatFecha(proxFecha)}
              </span>
            )}
            {!proxFecha && pagadas === gasto.n_cuotas && (
              <span className="font-body text-[9px] px-1.5 border border-ch-green/40 text-ch-green">Saldado ✓</span>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Toggle activo */}
          <button
            type="button"
            onClick={() => onToggleActivo(!gasto.activo)}
            disabled={isPending}
            className={`w-7 h-3.5 rounded-full transition-colors relative disabled:opacity-50 ${gasto.activo ? 'bg-ch-green' : 'bg-ch-border'}`}
            title={gasto.activo ? 'Marcar inactivo' : 'Marcar activo'}>
            <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${gasto.activo ? 'left-[14px]' : 'left-0.5'}`} />
          </button>

          {/* Eliminar */}
          {!confirmarEliminar ? (
            <button onClick={onConfirmarEliminar} disabled={isPending}
              className="font-body text-[10px] text-ch-muted/40 hover:text-red-400 transition-colors disabled:opacity-30">
              ✕
            </button>
          ) : (
            <span className="flex items-center gap-1">
              <span className="font-body text-[10px] text-ch-muted">¿Eliminar?</span>
              <button onClick={onEliminar}
                className="font-body text-[10px] text-red-400 hover:text-red-300 px-1 transition-colors">Sí</button>
              <button onClick={onCancelarEliminar}
                className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1 transition-colors">No</button>
            </span>
          )}
        </div>
      </div>

      {/* Cuotas */}
      {expandido && (
        <div className="border-t border-ch-border/30 px-4 py-3">
          {cuotas.length === 0 ? (
            <p className="font-body text-xs text-ch-muted">Sin cuotas generadas.</p>
          ) : (
            <div className="space-y-1">
              {/* Header cuotas */}
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 pb-1 border-b border-ch-border/20">
                <span className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-muted">N°</span>
                <span className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-muted">Vencimiento</span>
                <span className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-muted text-right">Monto</span>
                <span className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-muted">Estado</span>
                <span />
              </div>

              {cuotas.map(cuota => {
                const esPagando = pagando?.cuotaId === cuota.id
                return (
                  <div key={cuota.id}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 items-center py-1.5">
                    <span className="font-mono text-[10px] text-ch-muted w-6 text-center">{cuota.numero_cuota}</span>
                    <span className="font-body text-xs text-ch-cream">{formatFecha(cuota.fecha_vencimiento)}</span>
                    <span className="font-mono text-xs text-ch-cream text-right">{formatCLP(cuota.monto)}</span>
                    <span>
                      {cuota.pagada ? (
                        <span className="font-body text-[9px] px-1.5 border border-ch-green/40 text-ch-green whitespace-nowrap">
                          ✓ {cuota.fecha_pago ? formatFecha(cuota.fecha_pago) : 'Pagada'}
                        </span>
                      ) : (
                        <span className="font-body text-[9px] text-ch-muted">Pendiente</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1 justify-end">
                      {!cuota.pagada && !esPagando && (
                        <button
                          onClick={() => onIniciarPago(cuota.id, new Date().toISOString().split('T')[0])}
                          disabled={isPending}
                          className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 border border-ch-border/50 text-ch-muted hover:text-ch-cream hover:border-ch-green/50 transition-colors disabled:opacity-30 whitespace-nowrap">
                          Marcar pagada
                        </button>
                      )}
                      {!cuota.pagada && esPagando && (
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <input
                            type="date"
                            value={pagando!.fecha}
                            onChange={e => onIniciarPago(cuota.id, e.target.value)}
                            className="input-ch text-[10px] py-0.5 px-1.5 w-32"
                          />
                          <button
                            onClick={() => onConfirmarPago(cuota.id)}
                            disabled={isPending || !pagando?.fecha}
                            className="font-body text-[9px] tracking-wider uppercase px-2 py-0.5 bg-ch-green text-ch-black transition-colors disabled:opacity-50">
                            ✓
                          </button>
                          <button onClick={onCancelarPago}
                            className="font-body text-[9px] text-ch-muted hover:text-ch-cream px-1 transition-colors">
                            ✕
                          </button>
                        </span>
                      )}
                      {cuota.pagada && (
                        <button
                          onClick={() => onDesmarcar(cuota.id)}
                          disabled={isPending}
                          className="font-body text-[9px] text-ch-muted/40 hover:text-ch-muted transition-colors disabled:opacity-30 px-1"
                          title="Desmarcar">
                          ↩
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── FormNuevo ────────────────────────────────────────────────────────────────

function FormNuevo({ form, setForm, onCrear, onCancelar, isPending, valido }: {
  form: typeof FORM_VACIO
  setForm: React.Dispatch<React.SetStateAction<typeof FORM_VACIO>>
  onCrear: () => void
  onCancelar: () => void
  isPending: boolean
  valido: boolean
}) {
  const set = (k: keyof typeof FORM_VACIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="border border-ch-border/60 p-5 space-y-4 bg-ch-surface/5">
      <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted">Nuevo crédito / préstamo</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Nombre *</label>
          <input type="text" value={form.nombre} onChange={set('nombre')}
            placeholder="Ej: Crédito BCI hipotecario" className="input-ch w-full" autoFocus />
        </div>
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Tipo *</label>
          <select value={form.tipo} onChange={set('tipo')} className="input-ch w-full">
            <option value="credito_bancario">Crédito bancario</option>
            <option value="prestamo_socio">Préstamo socio</option>
            <option value="otro">Otro</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Acreedor</label>
          <input type="text" value={form.acreedor} onChange={set('acreedor')}
            placeholder="Ej: Banco de Chile" className="input-ch w-full" />
        </div>
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Tasa interés anual (%)</label>
          <input type="number" value={form.tasa_interes} onChange={set('tasa_interes')}
            placeholder="Ej: 5.5" step="0.01" min="0" className="input-ch w-full font-mono" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Monto cuota *</label>
          <input type="number" value={form.monto_cuota} onChange={set('monto_cuota')}
            placeholder="0" min="0" className="input-ch w-full font-mono" />
        </div>
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">N° cuotas *</label>
          <input type="number" value={form.n_cuotas} onChange={set('n_cuotas')}
            placeholder="12" min="1" max="360" className="input-ch w-full font-mono" />
        </div>
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Día vencimiento *</label>
          <input type="number" value={form.dia_vencimiento} onChange={set('dia_vencimiento')}
            min="1" max="28" className="input-ch w-full font-mono" />
        </div>
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Fecha inicio *</label>
          <input type="date" value={form.fecha_inicio} onChange={set('fecha_inicio')}
            className="input-ch w-full" />
        </div>
      </div>

      <div>
        <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Monto total</label>
        <input type="number" value={form.monto_total} onChange={set('monto_total')}
          placeholder="0" min="0" className="input-ch w-44 font-mono" />
        <span className="font-body text-[9px] text-ch-muted/60 ml-2">opcional — calculado automáticamente si se omite</span>
      </div>

      <div className="flex gap-3 pt-1">
        <button onClick={onCrear} disabled={!valido || isPending}
          className="font-body text-[10px] tracking-[0.35em] uppercase px-6 py-2.5 bg-ch-green hover:bg-ch-green-light text-ch-black transition-colors disabled:opacity-50">
          {isPending ? 'Creando...' : 'Crear y generar cuotas'}
        </button>
        <button onClick={onCancelar}
          className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-3 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}
