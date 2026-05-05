'use client'

import { useState, useTransition } from 'react'
import {
  upsertAperturaCaja, cerrarPeriodoCaja,
  agregarMovimientoFlujo, editarMovimientoFlujo, eliminarMovimientoFlujo,
} from '@/app/actions/financiero'
import type { DatosFlujo, MovimientoFlujo, CierreMesAnterior } from '@/app/actions/financiero'
import { formatCLP } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFechaCorta(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short',
  })
}

function nombreMes(periodo: string): string {
  const [y, m] = periodo.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-CL', {
    month: 'long', year: 'numeric',
  })
}

const ORIGEN_ICON: Record<string, string> = {
  cobro_estimado: '📥',
  cuota_credito: '🏦',
  tributario: '📋',
  manual: '✎',
}

// ─── Estado del formulario de movimiento ─────────────────────────────────────

interface FormMovState {
  open: boolean
  editingId?: string
  tipo: 'entrada' | 'salida'
  descripcion: string
  monto: string
  fecha: string
}

const formVacio = (hoy: string): FormMovState => ({
  open: false, tipo: 'entrada', descripcion: '', monto: '', fecha: hoy,
})

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props { datos: DatosFlujo }

export default function FlujoCaja({ datos }: Props) {
  const [isPending, startTransition] = useTransition()

  // ── Apertura ────────────────────────────────────────────────────────────────
  const [saldoApertura, setSaldoApertura] = useState(datos.saldo_apertura)
  const [editandoApertura, setEditandoApertura] = useState(false)
  const [aperturaInput, setAperturaInput] = useState(String(datos.saldo_apertura))

  const guardarApertura = () => {
    const val = Number(aperturaInput.replace(/\./g, '').replace(',', '.'))
    if (isNaN(val)) return
    setSaldoApertura(val)
    setEditandoApertura(false)
    startTransition(() => upsertAperturaCaja(datos.periodo_actual, val))
  }

  // ── Movimientos ─────────────────────────────────────────────────────────────
  const [movimientos, setMovimientos] = useState<MovimientoFlujo[]>(datos.movimientos)
  const [confirmarEliminar, setConfirmarEliminar] = useState<string | null>(null)
  const [form, setForm] = useState<FormMovState>(formVacio(datos.hoy))

  const abrirNuevo = () => setForm({ ...formVacio(datos.hoy), open: true })
  const abrirEditar = (m: MovimientoFlujo) => setForm({
    open: true, editingId: m.id,
    tipo: m.tipo, descripcion: m.descripcion,
    monto: String(m.monto), fecha: m.fecha,
  })
  const cerrarForm = () => setForm(formVacio(datos.hoy))

  const guardarMovimiento = () => {
    const monto = Number(form.monto.replace(/\./g, '').replace(',', '.'))
    if (!form.descripcion.trim() || isNaN(monto) || monto <= 0 || !form.fecha) return
    const payload = { tipo: form.tipo, descripcion: form.descripcion.trim(), monto, fecha: form.fecha }

    if (form.editingId) {
      const id = form.editingId
      setMovimientos(prev => prev.map(m => m.id === id ? { ...m, ...payload } : m))
      cerrarForm()
      startTransition(async () => {
        await editarMovimientoFlujo(id, payload)
      })
    } else {
      cerrarForm()
      startTransition(async () => {
        const nuevo = await agregarMovimientoFlujo(payload)
        setMovimientos(prev => [...prev, nuevo].sort((a, b) => a.fecha.localeCompare(b.fecha)))
      })
    }
  }

  const eliminarMovimiento = (id: string) => {
    setConfirmarEliminar(null)
    setMovimientos(prev => prev.filter(m => m.id !== id))
    startTransition(() => eliminarMovimientoFlujo(id))
  }

  // ── Saldo acumulado ─────────────────────────────────────────────────────────
  const movimientosConSaldo = movimientos.reduce<Array<MovimientoFlujo & { saldo_acumulado: number }>>(
    (acc, m) => {
      const prev = acc[acc.length - 1]?.saldo_acumulado ?? saldoApertura
      return [...acc, { ...m, saldo_acumulado: m.tipo === 'entrada' ? prev + m.monto : prev - m.monto }]
    }, []
  )

  const saldoFinal = movimientosConSaldo[movimientosConSaldo.length - 1]?.saldo_acumulado ?? saldoApertura

  // ── Cierre ──────────────────────────────────────────────────────────────────
  const [cierre, setCierre] = useState<CierreMesAnterior>(datos.cierre_anterior)
  const [cierreInput, setCierreInput] = useState(String(cierre.saldo_cierre_real ?? ''))
  const [cierreNotas, setCierreNotas] = useState(cierre.notas_cierre ?? '')
  const [guardandoCierre, setGuardandoCierre] = useState(false)

  const guardarCierre = async () => {
    const val = Number(cierreInput.replace(/\./g, '').replace(',', '.'))
    if (isNaN(val)) return
    setGuardandoCierre(true)
    try {
      await cerrarPeriodoCaja(cierre.periodo, val, cierreNotas)
      setCierre(prev => ({ ...prev, cerrado: true, saldo_cierre_real: val, notas_cierre: cierreNotas }))
    } finally {
      setGuardandoCierre(false)
    }
  }

  return (
    <div className="space-y-10">

      {/* ── Saldo inicial ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 flex-wrap">
        <div>
          <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-1">
            Saldo inicial · {nombreMes(datos.periodo_actual)}
          </p>
          {editandoApertura ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={aperturaInput}
                onChange={e => setAperturaInput(e.target.value)}
                className="input-ch w-44 font-mono text-sm"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') guardarApertura(); if (e.key === 'Escape') setEditandoApertura(false) }}
              />
              <button onClick={guardarApertura} disabled={isPending}
                className="font-body text-[10px] tracking-wider uppercase px-3 py-1.5 bg-ch-green hover:bg-ch-green-light text-ch-black transition-colors disabled:opacity-50">
                Guardar
              </button>
              <button onClick={() => setEditandoApertura(false)}
                className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-2">
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl text-ch-cream">{formatCLP(saldoApertura)}</span>
              <button onClick={() => { setAperturaInput(String(saldoApertura)); setEditandoApertura(true) }}
                className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors">
                ✎ Editar
              </button>
            </div>
          )}
        </div>

        <div className="hidden sm:block h-8 w-px bg-ch-border/40" />

        <div>
          <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-1">
            Saldo proyectado en 60 días
          </p>
          <span className={`font-mono text-2xl ${saldoFinal >= 0 ? 'text-ch-green' : 'text-red-400'}`}>
            {formatCLP(saldoFinal)}
          </span>
        </div>
      </div>

      {/* ── Tabla de movimientos ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted">
            Próximos 60 días — {datos.hoy} → {datos.fin_ventana}
          </p>
          <button onClick={abrirNuevo}
            className="font-body text-[10px] tracking-[0.35em] uppercase px-4 py-2 border border-ch-border text-ch-muted hover:text-ch-cream transition-colors">
            + Movimiento
          </button>
        </div>

        {/* Formulario inline */}
        {form.open && (
          <FormMovimiento
            form={form}
            setForm={setForm}
            onGuardar={guardarMovimiento}
            onCancelar={cerrarForm}
            isPending={isPending}
          />
        )}

        {movimientosConSaldo.length === 0 ? (
          <div className="border border-dashed border-ch-border/40 py-10 text-center">
            <p className="font-body text-sm text-ch-muted">
              Sin movimientos comprometidos en los próximos 60 días.
            </p>
          </div>
        ) : (
          <div className="border border-ch-border/50">
            {/* Header */}
            <div className="grid grid-cols-[auto_auto_1fr_auto_auto] gap-3 px-4 py-2 border-b border-ch-border/30 bg-ch-surface/20">
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Fecha</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Tipo</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Descripción</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-right">Monto</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-right">Saldo</span>
            </div>

            {movimientosConSaldo.map((m, i) => (
              <FilaMovimiento
                key={m.id}
                m={m}
                ultimo={i === movimientosConSaldo.length - 1}
                editando={form.open && form.editingId === m.id}
                confirmando={confirmarEliminar === m.id}
                onEditar={() => abrirEditar(m)}
                onConfirmarEliminar={() => setConfirmarEliminar(m.id)}
                onCancelarEliminar={() => setConfirmarEliminar(null)}
                onEliminar={() => eliminarMovimiento(m.id)}
                isPending={isPending}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Cierre mes anterior ────────────────────────────────────────────── */}
      <section className="border border-ch-border/40 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted">
            Cierre · {nombreMes(cierre.periodo)}
          </p>
          {cierre.cerrado && (
            <span className="font-body text-[9px] px-2 py-0.5 border border-ch-green/40 text-ch-green">
              Cerrado
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="font-body text-[9px] text-ch-muted mb-0.5">Saldo apertura</p>
            <p className="font-mono text-sm text-ch-cream">{formatCLP(cierre.saldo_apertura)}</p>
          </div>
          <div>
            <p className="font-body text-[9px] text-ch-muted mb-0.5">Saldo calculado</p>
            <p className="font-mono text-sm text-ch-cream">{formatCLP(cierre.saldo_calculado)}</p>
            <p className="font-body text-[9px] text-ch-muted/60">apertura + movs. manuales</p>
          </div>
          {cierre.cerrado && cierre.saldo_cierre_real !== null && (
            <div>
              <p className="font-body text-[9px] text-ch-muted mb-0.5">Saldo real ingresado</p>
              <p className="font-mono text-sm text-ch-cream">{formatCLP(cierre.saldo_cierre_real)}</p>
            </div>
          )}
        </div>

        {cierre.cerrado ? (
          <CierreResumen cierre={cierre} />
        ) : (
          <CierreForm
            cierreInput={cierreInput}
            setCierreInput={setCierreInput}
            cierreNotas={cierreNotas}
            setCierreNotas={setCierreNotas}
            onGuardar={guardarCierre}
            guardando={guardandoCierre}
          />
        )}
      </section>
    </div>
  )
}

// ─── FilaMovimiento ───────────────────────────────────────────────────────────

function FilaMovimiento({
  m, ultimo, editando, confirmando,
  onEditar, onConfirmarEliminar, onCancelarEliminar, onEliminar,
  isPending,
}: {
  m: MovimientoFlujo & { saldo_acumulado: number }
  ultimo: boolean
  editando: boolean
  confirmando: boolean
  onEditar: () => void
  onConfirmarEliminar: () => void
  onCancelarEliminar: () => void
  onEliminar: () => void
  isPending: boolean
}) {
  return (
    <div className={`grid grid-cols-[auto_auto_1fr_auto_auto] gap-3 px-4 py-2.5 items-center
      ${!ultimo ? 'border-b border-ch-border/20' : ''}
      ${editando ? 'bg-ch-surface/20' : ''}`}>
      <span className="font-body text-[10px] text-ch-muted whitespace-nowrap">
        {formatFechaCorta(m.fecha)}
      </span>
      <span title={m.origen} className="text-sm leading-none">{ORIGEN_ICON[m.origen]}</span>
      <div className="min-w-0 flex items-center gap-2">
        <span className="font-body text-xs text-ch-cream truncate">{m.descripcion}</span>
        {m.editable && (
          <span className="flex items-center gap-1 shrink-0">
            {!confirmando ? (
              <>
                <button onClick={onEditar} disabled={isPending}
                  className="font-body text-[10px] text-ch-muted/50 hover:text-ch-cream transition-colors px-0.5 disabled:opacity-30">
                  ✎
                </button>
                <button onClick={onConfirmarEliminar} disabled={isPending}
                  className="font-body text-[10px] text-ch-muted/40 hover:text-red-400 transition-colors px-0.5 disabled:opacity-30">
                  ✕
                </button>
              </>
            ) : (
              <>
                <span className="font-body text-[10px] text-ch-muted">¿Eliminar?</span>
                <button onClick={onEliminar}
                  className="font-body text-[10px] text-red-400 hover:text-red-300 px-1 transition-colors">
                  Sí
                </button>
                <button onClick={onCancelarEliminar}
                  className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1 transition-colors">
                  No
                </button>
              </>
            )}
          </span>
        )}
      </div>
      <span className={`font-mono text-xs text-right whitespace-nowrap ${m.tipo === 'entrada' ? 'text-ch-green' : 'text-red-400'}`}>
        {m.tipo === 'entrada' ? '+' : '−'}{formatCLP(m.monto)}
      </span>
      <span className={`font-mono text-xs text-right whitespace-nowrap ${m.saldo_acumulado >= 0 ? 'text-ch-cream' : 'text-red-400'}`}>
        {formatCLP(m.saldo_acumulado)}
      </span>
    </div>
  )
}

// ─── FormMovimiento ───────────────────────────────────────────────────────────

function FormMovimiento({ form, setForm, onGuardar, onCancelar, isPending }: {
  form: FormMovState
  setForm: React.Dispatch<React.SetStateAction<FormMovState>>
  onGuardar: () => void
  onCancelar: () => void
  isPending: boolean
}) {
  const valido = form.descripcion.trim().length > 0 &&
    Number(form.monto.replace(/\./g, '').replace(',', '.')) > 0 &&
    form.fecha.length === 10

  return (
    <div className="border border-ch-border/60 p-4 mb-3 bg-ch-surface/10 space-y-3">
      <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">
        {form.editingId ? 'Editar movimiento' : 'Nuevo movimiento'}
      </p>

      {/* Tipo toggle */}
      <div className="flex gap-2">
        {(['entrada', 'salida'] as const).map(t => (
          <button key={t} onClick={() => setForm(p => ({ ...p, tipo: t }))}
            className={`font-body text-[10px] tracking-wider uppercase px-4 py-1.5 border transition-colors ${
              form.tipo === t
                ? t === 'entrada' ? 'bg-ch-green/20 border-ch-green/60 text-ch-green' : 'bg-red-500/10 border-red-500/50 text-red-400'
                : 'border-ch-border/40 text-ch-muted hover:text-ch-cream'
            }`}>
            {t === 'entrada' ? '↑ Entrada' : '↓ Salida'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Fecha</label>
          <input type="date" value={form.fecha}
            onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
            className="input-ch w-full" />
        </div>
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Monto</label>
          <input type="text" inputMode="numeric" value={form.monto}
            onChange={e => setForm(p => ({ ...p, monto: e.target.value }))}
            placeholder="0" className="input-ch w-full font-mono" />
        </div>
        <div className="sm:col-span-1">
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Descripción</label>
          <input type="text" value={form.descripcion}
            onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter' && valido) onGuardar() }}
            placeholder="Ej: Pago proveedor XYZ" className="input-ch w-full" autoFocus={!form.editingId} />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onGuardar} disabled={!valido || isPending}
          className="font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2 bg-ch-green hover:bg-ch-green-light text-ch-black transition-colors disabled:opacity-50">
          {isPending ? 'Guardando...' : form.editingId ? 'Actualizar' : 'Agregar'}
        </button>
        <button onClick={onCancelar}
          className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-3 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── CierreForm ───────────────────────────────────────────────────────────────

function CierreForm({ cierreInput, setCierreInput, cierreNotas, setCierreNotas, onGuardar, guardando }: {
  cierreInput: string
  setCierreInput: (v: string) => void
  cierreNotas: string
  setCierreNotas: (v: string) => void
  onGuardar: () => void
  guardando: boolean
}) {
  const valido = Number(cierreInput.replace(/\./g, '').replace(',', '.')) >= 0

  return (
    <div className="space-y-3 pt-2 border-t border-ch-border/30">
      <p className="font-body text-[10px] text-ch-muted">
        Ingresa el saldo real en caja al cierre del período para dejar registro de desbalances.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">
            Saldo real al cierre
          </label>
          <input type="text" inputMode="numeric" value={cierreInput}
            onChange={e => setCierreInput(e.target.value)}
            placeholder="0" className="input-ch w-full font-mono" />
        </div>
        <div>
          <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">
            Notas (opcional)
          </label>
          <input type="text" value={cierreNotas}
            onChange={e => setCierreNotas(e.target.value)}
            placeholder="Ej: Diferencia por gastos sin comprobante"
            className="input-ch w-full" />
        </div>
      </div>
      <button onClick={onGuardar} disabled={!valido || guardando}
        className="font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2 border border-ch-border text-ch-muted hover:text-ch-cream transition-colors disabled:opacity-50">
        {guardando ? 'Guardando...' : 'Cerrar período'}
      </button>
    </div>
  )
}

// ─── CierreResumen ────────────────────────────────────────────────────────────

function CierreResumen({ cierre }: { cierre: CierreMesAnterior }) {
  if (cierre.saldo_cierre_real === null) return null
  const desbalance = cierre.saldo_cierre_real - cierre.saldo_calculado
  const hayDesbalance = desbalance !== 0

  return (
    <div className="space-y-2 pt-2 border-t border-ch-border/30">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <p className="font-body text-[9px] text-ch-muted mb-0.5">Desbalance</p>
          <p className={`font-mono text-sm ${hayDesbalance ? (desbalance > 0 ? 'text-ch-green' : 'text-red-400') : 'text-ch-cream'}`}>
            {desbalance >= 0 ? '+' : ''}{formatCLP(desbalance)}
          </p>
        </div>
        {!hayDesbalance && (
          <span className="font-body text-[9px] px-2 py-0.5 border border-ch-green/30 text-ch-green">
            Sin desbalance ✓
          </span>
        )}
      </div>
      {cierre.notas_cierre && (
        <p className="font-body text-[10px] text-ch-muted italic">{cierre.notas_cierre}</p>
      )}
    </div>
  )
}
