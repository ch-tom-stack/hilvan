'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { DatosFinancieros, ResumenPeriodo, FilaCotizacion, FilaGasto, FilaCuota, FilaInversion } from '@/app/actions/financiero'
import { setPPMTasa, setPreviredMensual, setIUSCMensual, setNomina } from '@/app/actions/financiero'
import type { PersonaNomina } from '@/app/actions/financiero'
import { generarZIPContador } from '@/lib/exportar-contador'
import { toastOk, toastError } from '@/lib/toast'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function clp(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

function formatMes(mes: string) {
  const [y, m] = mes.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
}

function formatFecha(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL')
}

function variacion(actual: number, anterior: number): { pct: number; color: string; flecha: string } | null {
  if (anterior === 0) return null
  const pct = Math.round(((actual - anterior) / Math.abs(anterior)) * 100)
  const color = pct >= 0 ? 'text-ch-green' : 'text-red-400'
  const flecha = pct >= 0 ? '↑' : '↓'
  return { pct: Math.abs(pct), color, flecha }
}

function agingColor(dias: number) {
  if (dias > 60) return 'text-red-400'
  if (dias > 30) return 'text-amber-400'
  return 'text-ch-muted'
}

// ─── COMPONENTES INTERNOS ─────────────────────────────────────────────────────

function Separador() {
  return <div className="border-t border-ch-border/40 my-1" />
}

function FilaNumero({ label, valor, sub, bold, color }: {
  label: string; valor: number; sub?: string; bold?: boolean; color?: string
}) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <div>
        <span className={`font-body text-xs ${bold ? 'text-ch-cream' : 'text-ch-muted'}`}>{label}</span>
        {sub && <span className="font-body text-[9px] text-ch-subtle ml-2">{sub}</span>}
      </div>
      <span className={`font-mono text-sm tabular-nums ${color ?? (bold ? 'text-ch-cream' : 'text-ch-muted')}`}>
        {clp(valor)}
      </span>
    </div>
  )
}

function SeccionHeader({ titulo, total, color }: { titulo: string; total: number; color?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">{titulo}</p>
      <span className={`font-mono text-sm font-medium tabular-nums ${color ?? 'text-ch-cream'}`}>{clp(total)}</span>
    </div>
  )
}

function VariacionBadge({ actual, anterior, label }: { actual: number; anterior: number; label: string }) {
  const v = variacion(actual, anterior)
  if (!v) return <span className="font-body text-[9px] text-ch-subtle">{label} —</span>
  return (
    <span className={`font-body text-[9px] ${v.color}`}>
      {v.flecha} {v.pct}% vs {label}
    </span>
  )
}

// ─── NAVEGACIÓN DE PERÍODO ────────────────────────────────────────────────────

function NavPeriodo({ mes }: { mes: string }) {
  const router = useRouter()
  const [y, m] = mes.split('-').map(Number)

  function navMes(delta: number) {
    const d = new Date(y, m - 1 + delta, 1)
    const nuevo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    router.push(`/financiero?mes=${nuevo}`)
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={() => navMes(-1)}
        className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-3 py-1.5 transition-colors">
        ← anterior
      </button>
      <span className="font-body text-sm text-ch-cream capitalize">{formatMes(mes)}</span>
      <button onClick={() => navMes(1)}
        className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-xs px-3 py-1.5 transition-colors">
        siguiente →
      </button>
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

interface Props {
  datos: DatosFinancieros
  anterior: ResumenPeriodo
  añoAnterior: ResumenPeriodo
  ppmTasa: number
  previredMensual: number
  iuscMensual: number
  nominaInicial: PersonaNomina[]
}

export default function EstadoResultados({ datos, anterior, añoAnterior, ppmTasa: ppmTasaInicial, previredMensual: previredInicial, iuscMensual: iuscInicial, nominaInicial }: Props) {
  const { ingresos, egresos, inversiones, tributario, totales } = datos

  const totalPorFacturar = ingresos.por_facturar.reduce((s, c) => s + c.total, 0)
  const totalPorCobrar = ingresos.por_cobrar.reduce((s, c) => s + c.total, 0)
  const totalCobrado = ingresos.cobrado.reduce((s, c) => s + c.total, 0)

  const totalGastosProyectos = egresos.gastos_proyectos.reduce((s, g) => s + g.monto, 0)
  const totalGastosOp = egresos.gastos_operacionales.reduce((s, g) => s + g.monto, 0)
  const totalCuotas = egresos.cuotas_creditos.reduce((s, c) => s + c.monto, 0)
  const totalEgresos = totalGastosProyectos + totalGastosOp + totalCuotas
  const totalInversiones = inversiones.reduce((s, i) => s + i.monto, 0)
  const totalIVACreditoInversiones = inversiones.reduce((s, i) => s + i.iva_credito, 0)

  const [exportando, setExportando] = useState(false)
  const [errorExport, setErrorExport] = useState<string | null>(null)

  // ── PPM editable ──────────────────────────────────────────────────────────
  const [ppmTasa, setPpmTasaLocal] = useState(ppmTasaInicial)
  const [editandoPPM, setEditandoPPM] = useState(false)
  const [ppmInput, setPpmInput] = useState(String(Math.round(ppmTasaInicial * 10000) / 100))
  const [ppmPending, startPPMTransition] = useTransition()

  // Recalcular PPM con la tasa local
  const neto_cobrado_sin_iva = datos.ingresos.cobrado.reduce((s, _c) => s, 0) // placeholder, usamos tributario
  const ppm_estimado_local = Math.round(tributario.ppm_estimado / ppmTasaInicial * ppmTasa) || tributario.ppm_estimado

  // ── Previred editable ─────────────────────────────────────────────────────
  const [previred, setPreviredLocal] = useState(previredInicial)
  const [editandoPrevired, setEditandoPrevired] = useState(false)
  const [previredInput, setPreviredInput] = useState(String(previredInicial))
  const [previredPending, startPreviredTransition] = useTransition()

  // ── IUSC editable ─────────────────────────────────────────────────────────
  const [iusc, setIuscLocal] = useState(iuscInicial)
  const [editandoIUSC, setEditandoIUSC] = useState(false)
  const [iuscInput, setIuscInput] = useState(String(iuscInicial))
  const [iuscPending, startIUSCTransition] = useTransition()

  // ── Nómina editable ───────────────────────────────────────────────────────
  const [nomina, setNominaLocal] = useState<PersonaNomina[]>(nominaInicial)
  const [editandoNomina, setEditandoNomina] = useState(false)
  const [nominaEdit, setNominaEdit] = useState<PersonaNomina[]>(nominaInicial)
  const [nominaPending, startNominaTransition] = useTransition()
  const totalNomina = nomina.reduce((s, p) => s + p.monto, 0)

  function handleGuardarNomina() {
    startNominaTransition(async () => {
      const result = await setNomina(nominaEdit)
      if (result.error) {
        toastError(result.error)
      } else {
        setNominaLocal(nominaEdit)
        setEditandoNomina(false)
        toastOk('Nómina actualizada')
      }
    })
  }

  function handleGuardarPrevired() {
    const nuevo = parseInt(previredInput.replace(/\./g, '').replace(',', ''), 10)
    if (isNaN(nuevo) || nuevo < 0) {
      toastError('Monto inválido')
      return
    }
    startPreviredTransition(async () => {
      const result = await setPreviredMensual(nuevo)
      if (result.error) {
        toastError(result.error)
      } else {
        setPreviredLocal(nuevo)
        setEditandoPrevired(false)
        toastOk('Monto Previred actualizado')
      }
    })
  }

  function handleGuardarIUSC() {
    const nuevo = parseInt(iuscInput.replace(/\./g, '').replace(',', ''), 10)
    if (isNaN(nuevo) || nuevo < 0) {
      toastError('Monto inválido')
      return
    }
    startIUSCTransition(async () => {
      const result = await setIUSCMensual(nuevo)
      if (result.error) {
        toastError(result.error)
      } else {
        setIuscLocal(nuevo)
        setEditandoIUSC(false)
        toastOk('Monto IUSC actualizado')
      }
    })
  }

  function handleGuardarPPM() {
    const nueva = parseFloat(ppmInput.replace(',', '.'))
    if (isNaN(nueva) || nueva < 0 || nueva > 100) {
      toastError('Tasa inválida (0–100%)')
      return
    }
    const tasaDecimal = nueva / 100
    startPPMTransition(async () => {
      const result = await setPPMTasa(tasaDecimal)
      if (result.error) {
        toastError(result.error)
      } else {
        setPpmTasaLocal(tasaDecimal)
        setEditandoPPM(false)
        toastOk('Tasa PPM actualizada')
      }
    })
  }

  const [añoNum, mesNum] = datos.periodo.split('-').map(Number)

  async function handleExportar() {
    setExportando(true)
    setErrorExport(null)
    try {
      await generarZIPContador(mesNum, añoNum)
    } catch {
      setErrorExport('Error al generar el paquete. Intenta nuevamente.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-8">

      {/* ── Navegación período + Exportar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <NavPeriodo mes={datos.periodo} />
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleExportar}
            disabled={exportando}
            className="border border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-cream/50 font-body text-[10px] tracking-[0.35em] uppercase px-5 py-2.5 transition-colors disabled:opacity-50"
          >
            {exportando ? 'Generando…' : 'Exportar para contador →'}
          </button>
          {errorExport && (
            <p className="text-red-400 font-body text-xs">{errorExport}</p>
          )}
        </div>
      </div>

      {/* ── Grid principal ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ═══ COLUMNA INGRESOS ═══ */}
        <div className="border border-ch-border p-5 space-y-5 self-start">

          {/* Por facturar */}
          <div>
            <SeccionHeader titulo="Por facturar" total={totalPorFacturar} color="text-zinc-400" />
            {ingresos.por_facturar.length === 0
              ? <p className="font-body text-xs text-ch-subtle border border-dashed border-ch-border rounded-[2px] px-4 py-3 text-center">Sin cotizaciones pendientes</p>
              : ingresos.por_facturar.map(c => (
                <div key={c.id} className="flex justify-between py-1 border-b border-ch-border/20 last:border-0">
                  <div className="min-w-0 pr-2">
                    <p className="font-body text-xs text-ch-cream truncate">{c.nombre}</p>
                    <p className="font-body text-[9px] text-ch-muted">{c.cliente}</p>
                  </div>
                  <span className="font-mono text-xs text-zinc-400 shrink-0">{clp(c.total)}</span>
                </div>
              ))
            }
          </div>

          <Separador />

          {/* Por cobrar */}
          <div>
            <SeccionHeader titulo="Por cobrar" total={totalPorCobrar} color="text-amber-400" />
            {ingresos.por_cobrar.length === 0
              ? <p className="font-body text-xs text-ch-subtle border border-dashed border-ch-border rounded-[2px] px-4 py-3 text-center">Sin facturas pendientes</p>
              : ingresos.por_cobrar.map(c => (
                <div key={c.id} className="flex justify-between py-1 border-b border-ch-border/20 last:border-0">
                  <div className="min-w-0 pr-2">
                    <p className="font-body text-xs text-ch-cream truncate">{c.nombre}</p>
                    <div className="flex items-center gap-2">
                      <p className="font-body text-[9px] text-ch-muted">{c.cliente}</p>
                      {c.dias_transcurridos !== undefined && (
                        <span className={`font-body text-[9px] ${agingColor(c.dias_transcurridos)}`}>
                          {c.dias_transcurridos}d
                        </span>
                      )}
                    </div>
                    {c.numero_factura && (
                      <p className="font-body text-[9px] text-ch-subtle">Folio {c.numero_factura}</p>
                    )}
                  </div>
                  <span className="font-mono text-xs text-amber-400 shrink-0">{clp(c.total)}</span>
                </div>
              ))
            }
          </div>

          <Separador />

          {/* Cobrado */}
          <div>
            <SeccionHeader titulo={`Cobrado · ${formatMes(datos.periodo)}`} total={totalCobrado} color="text-ch-green" />
            {ingresos.cobrado.length === 0
              ? <p className="font-body text-xs text-ch-subtle border border-dashed border-ch-border rounded-[2px] px-4 py-3 text-center">Sin cobros este período</p>
              : ingresos.cobrado.map(c => (
                <div key={c.id} className="flex justify-between py-1 border-b border-ch-border/20 last:border-0">
                  <div className="min-w-0 pr-2">
                    <p className="font-body text-xs text-ch-cream truncate">{c.nombre}</p>
                    <p className="font-body text-[9px] text-ch-muted">{c.cliente} · {formatFecha(c.fecha_pago)}</p>
                  </div>
                  <span className="font-mono text-xs text-ch-green shrink-0">{clp(c.total)}</span>
                </div>
              ))
            }
            {/* Comparativa */}
            <div className="flex items-center gap-4 mt-3 pt-2 border-t border-ch-border/20">
              <VariacionBadge actual={totales.ingresos_facturados} anterior={anterior.facturado} label="mes anterior" />
              <VariacionBadge actual={totales.ingresos_facturados} anterior={añoAnterior.facturado} label="año anterior" />
            </div>
          </div>
        </div>

        {/* ═══ COLUMNA EGRESOS ═══ */}
        <div className="border border-ch-border p-5 space-y-5">

          {/* Gastos proyectos */}
          <div>
            <SeccionHeader titulo="Gastos de proyectos" total={totalGastosProyectos} color="text-red-400" />
            {egresos.gastos_proyectos.length === 0
              ? <p className="font-body text-xs text-ch-subtle border border-dashed border-ch-border rounded-[2px] px-4 py-3 text-center">Sin gastos este período</p>
              : egresos.gastos_proyectos.map(g => (
                <div key={g.id} className="flex justify-between py-1 border-b border-ch-border/20 last:border-0">
                  <div className="min-w-0 pr-2">
                    <p className="font-body text-xs text-ch-cream truncate">{g.descripcion}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="font-body text-[9px] text-ch-muted">{g.contexto}</p>
                      {g.tipo_documento && (
                        <span className="font-body text-[9px] text-ch-subtle uppercase">{g.tipo_documento.replace('_', ' ')}</span>
                      )}
                      {g.factura_casa_hiedra && (
                        <span className="font-body text-[9px] text-ch-green">CF</span>
                      )}
                    </div>
                  </div>
                  <span className="font-mono text-xs text-red-400 shrink-0">{clp(g.monto)}</span>
                </div>
              ))
            }
          </div>

          <Separador />

          {/* Gastos operacionales */}
          <div>
            <SeccionHeader titulo="Gastos operacionales" total={totalGastosOp} color="text-orange-400" />
            {egresos.gastos_operacionales.length === 0
              ? <p className="font-body text-xs text-ch-subtle border border-dashed border-ch-border rounded-[2px] px-4 py-3 text-center">Sin gastos este período</p>
              : egresos.gastos_operacionales.map(g => (
                <div key={g.id} className="flex justify-between py-1 border-b border-ch-border/20 last:border-0">
                  <div className="min-w-0 pr-2">
                    <p className="font-body text-xs text-ch-cream truncate">{g.descripcion}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="font-body text-[9px] text-ch-muted">{g.contexto}</p>
                      {g.factura_casa_hiedra && (
                        <span className="font-body text-[9px] text-ch-green">CF</span>
                      )}
                    </div>
                  </div>
                  <span className="font-mono text-xs text-orange-400 shrink-0">{clp(g.monto)}</span>
                </div>
              ))
            }
          </div>

          <Separador />

          {/* Cuotas créditos */}
          <div>
            <SeccionHeader titulo="Cuotas de créditos" total={totalCuotas} color="text-purple-400" />
            {egresos.cuotas_creditos.length === 0
              ? <p className="font-body text-xs text-ch-subtle border border-dashed border-ch-border rounded-[2px] px-4 py-3 text-center">Sin cuotas este período</p>
              : egresos.cuotas_creditos.map(c => (
                <div key={c.id} className="flex justify-between py-1 border-b border-ch-border/20 last:border-0">
                  <div className="min-w-0 pr-2">
                    <p className="font-body text-xs text-ch-cream truncate">{c.nombre_credito}</p>
                    <div className="flex items-center gap-2">
                      <p className="font-body text-[9px] text-ch-muted">Cuota {c.numero_cuota} · {formatFecha(c.fecha_vencimiento)}</p>
                      <span className={`font-body text-[9px] ${c.pagada ? 'text-ch-green' : 'text-amber-400'}`}>
                        {c.pagada ? '✓ pagada' : 'pendiente'}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-xs text-purple-400 shrink-0">{clp(c.monto)}</span>
                </div>
              ))
            }
          </div>

          <Separador />

          {/* Nómina */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Nómina</p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium tabular-nums text-red-400">{clp(totalNomina)}</span>
                {!editandoNomina ? (
                  <button
                    onClick={() => { setNominaEdit(nomina.map(p => ({ ...p }))); setEditandoNomina(true) }}
                    className="text-ch-subtle hover:text-ch-cream font-body text-[10px] transition-colors"
                    title="Editar nómina"
                  >✎</button>
                ) : (
                  <div className="flex items-center gap-1">
                    <button onClick={handleGuardarNomina} disabled={nominaPending}
                      className="text-ch-green hover:text-ch-green-light font-body text-[10px] transition-colors disabled:opacity-50">✓</button>
                    <button onClick={() => setEditandoNomina(false)}
                      className="text-ch-subtle hover:text-ch-cream font-body text-[10px] transition-colors">✕</button>
                  </div>
                )}
              </div>
            </div>

            {!editandoNomina ? (
              nomina.map((p, i) => (
                <div key={i} className="flex justify-between items-baseline py-1 border-b border-ch-border/20 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-body text-xs text-ch-cream">{p.nombre}</span>
                    <span className={`font-body text-[9px] uppercase tracking-wider ${p.tipo === 'contrato' ? 'text-ch-green' : 'text-ch-muted'}`}>
                      {p.tipo === 'contrato' ? 'contrato' : 'BH'}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-red-400 shrink-0">{clp(p.monto)}</span>
                </div>
              ))
            ) : (
              <div className="space-y-1.5">
                {nominaEdit.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={p.nombre}
                      onChange={e => setNominaEdit(prev => prev.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                      className="flex-1 min-w-0 bg-ch-dark border border-ch-border px-1.5 py-0.5 font-body text-[10px] text-ch-cream focus:outline-none focus:border-ch-green"
                    />
                    <select
                      value={p.tipo}
                      onChange={e => setNominaEdit(prev => prev.map((x, j) => j === i ? { ...x, tipo: e.target.value as 'contrato' | 'honorarios' } : x))}
                      className="bg-ch-dark border border-ch-border px-1 py-0.5 font-body text-[10px] text-ch-muted focus:outline-none focus:border-ch-green"
                    >
                      <option value="contrato">contrato</option>
                      <option value="honorarios">BH</option>
                    </select>
                    <input
                      type="text"
                      value={p.monto}
                      onChange={e => {
                        const v = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0
                        setNominaEdit(prev => prev.map((x, j) => j === i ? { ...x, monto: v } : x))
                      }}
                      className="w-24 bg-ch-dark border border-ch-border px-1.5 py-0.5 font-mono text-[10px] text-ch-cream text-right focus:outline-none focus:border-ch-green"
                    />
                    <button
                      onClick={() => setNominaEdit(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-400/60 hover:text-red-400 font-body text-[10px] transition-colors"
                    >✕</button>
                  </div>
                ))}
                <button
                  onClick={() => setNominaEdit(prev => [...prev, { nombre: '', monto: 0, tipo: 'honorarios' }])}
                  className="font-body text-[9px] text-ch-subtle hover:text-ch-cream transition-colors mt-1"
                >+ agregar persona</button>
              </div>
            )}
          </div>

          {/* Total egresos con comparativa */}
          <Separador />
          <div>
            <FilaNumero label="Total egresos" valor={totalEgresos + totalNomina} bold color="text-red-400" />
            <div className="flex items-center gap-4 mt-1">
              <VariacionBadge actual={totalEgresos} anterior={anterior.egresos} label="mes anterior" />
              <VariacionBadge actual={totalEgresos} anterior={añoAnterior.egresos} label="año anterior" />
            </div>
          </div>
        </div>

        {/* ═══ COLUMNA TRIBUTARIO + RESULTADO ═══ */}
        <div className="space-y-4 self-start">

          {/* Obligaciones tributarias */}
          <div className="border border-ch-border p-5">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-4">Obligaciones tributarias</p>

            <FilaNumero label="Retenciones BH por pagar" valor={tributario.retenciones_bh} color="text-amber-400" />
            <Separador />
            <FilaNumero label="IVA débito (facturas al cliente)" valor={tributario.iva_debito} color="text-red-400" />
            <FilaNumero label="IVA crédito (fact. CH)" valor={tributario.iva_credito} color="text-ch-green" />
            <div className="flex items-baseline justify-between py-1.5 border-t border-ch-border/40 mt-1">
              <span className="font-body text-xs text-ch-cream font-medium">Saldo IVA a pagar</span>
              <span className={`font-mono text-sm tabular-nums font-medium ${tributario.saldo_iva >= 0 ? 'text-red-400' : 'text-ch-green'}`}>
                {clp(Math.abs(tributario.saldo_iva))}
                <span className="font-body text-[9px] ml-1">{tributario.saldo_iva < 0 ? '(CF)' : ''}</span>
              </span>
            </div>
            <Separador />
            {/* PPM editable */}
            <div className="flex items-baseline justify-between py-1.5">
              <div className="flex items-center gap-2">
                <span className="font-body text-xs text-ch-muted">
                  PPM estimado ({(ppmTasa * 100).toLocaleString('es-CL', { maximumFractionDigits: 2 })}%)
                </span>
                {!editandoPPM ? (
                  <button
                    onClick={() => {
                      setPpmInput(String(Math.round(ppmTasa * 10000) / 100))
                      setEditandoPPM(true)
                    }}
                    className="text-ch-subtle hover:text-ch-cream font-body text-[10px] transition-colors"
                    title="Editar tasa PPM"
                  >
                    ✎
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={ppmInput}
                      onChange={e => setPpmInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleGuardarPPM()
                        if (e.key === 'Escape') setEditandoPPM(false)
                      }}
                      className="w-14 bg-ch-dark border border-ch-green px-1.5 py-0.5 font-mono text-[10px] text-ch-cream text-right focus:outline-none"
                      autoFocus
                    />
                    <span className="font-body text-[10px] text-ch-muted">%</span>
                    <button
                      onClick={handleGuardarPPM}
                      disabled={ppmPending}
                      className="text-ch-green hover:text-ch-green-light font-body text-[10px] transition-colors disabled:opacity-50"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setEditandoPPM(false)}
                      className="text-ch-subtle hover:text-ch-cream font-body text-[10px] transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              <span className="font-mono text-sm tabular-nums text-amber-400">
                {clp(ppm_estimado_local)}
              </span>
            </div>

            <Separador />
            {/* Previred editable */}
            <div className="flex items-baseline justify-between py-1.5">
              <div className="flex items-center gap-2">
                <span className="font-body text-xs text-ch-muted">Previred (cotizaciones)</span>
                {!editandoPrevired ? (
                  <button
                    onClick={() => {
                      setPreviredInput(String(previred))
                      setEditandoPrevired(true)
                    }}
                    className="text-ch-subtle hover:text-ch-cream font-body text-[10px] transition-colors"
                    title="Editar monto Previred"
                  >
                    ✎
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={previredInput}
                      onChange={e => setPreviredInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleGuardarPrevired()
                        if (e.key === 'Escape') setEditandoPrevired(false)
                      }}
                      className="w-24 bg-ch-dark border border-ch-green px-1.5 py-0.5 font-mono text-[10px] text-ch-cream text-right focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleGuardarPrevired}
                      disabled={previredPending}
                      className="text-ch-green hover:text-ch-green-light font-body text-[10px] transition-colors disabled:opacity-50"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setEditandoPrevired(false)}
                      className="text-ch-subtle hover:text-ch-cream font-body text-[10px] transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              <span className="font-mono text-sm tabular-nums text-amber-400">
                {clp(previred)}
              </span>
            </div>

            <Separador />
            {/* IUSC editable */}
            <div className="flex items-baseline justify-between py-1.5">
              <div className="flex items-center gap-2">
                <span className="font-body text-xs text-ch-muted">IUSC (imp. único 2ª categoría)</span>
                {!editandoIUSC ? (
                  <button
                    onClick={() => {
                      setIuscInput(String(iusc))
                      setEditandoIUSC(true)
                    }}
                    className="text-ch-subtle hover:text-ch-cream font-body text-[10px] transition-colors"
                    title="Editar monto IUSC"
                  >
                    ✎
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={iuscInput}
                      onChange={e => setIuscInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleGuardarIUSC()
                        if (e.key === 'Escape') setEditandoIUSC(false)
                      }}
                      className="w-24 bg-ch-dark border border-ch-green px-1.5 py-0.5 font-mono text-[10px] text-ch-cream text-right focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleGuardarIUSC}
                      disabled={iuscPending}
                      className="text-ch-green hover:text-ch-green-light font-body text-[10px] transition-colors disabled:opacity-50"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setEditandoIUSC(false)}
                      className="text-ch-subtle hover:text-ch-cream font-body text-[10px] transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              <span className="font-mono text-sm tabular-nums text-amber-400">
                {clp(iusc)}
              </span>
            </div>

            {/* Total obligaciones */}
            <div className="mt-3 pt-2 border-t border-ch-border/40">
              <FilaNumero
                label="Total obligaciones"
                valor={tributario.retenciones_bh + Math.max(0, tributario.saldo_iva) + ppm_estimado_local + previred + iusc}
                bold
                color="text-amber-400"
              />
            </div>
          </div>

          {/* Resultado */}
          <div className="border border-ch-border p-5">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-4">Resultado</p>

            <FilaNumero label="Ingresos facturados" valor={totales.ingresos_facturados} color="text-ch-green" />
            <FilaNumero label="Egresos confirmados" valor={totales.egresos_confirmados} color="text-red-400" />
            <Separador />

            <div className="flex items-baseline justify-between py-2">
              <span className="font-body text-sm text-ch-cream font-medium">Utilidad bruta</span>
              <span className={`font-display text-2xl tabular-nums ${totales.utilidad_bruta >= 0 ? 'text-ch-green' : 'text-red-400'}`}>
                {clp(totales.utilidad_bruta)}
              </span>
            </div>

            {/* Comparativa */}
            <div className="mt-3 pt-3 border-t border-ch-border/40 flex items-center gap-4">
              <VariacionBadge actual={totales.utilidad_bruta} anterior={anterior.utilidad} label="mes ant." />
              <VariacionBadge actual={totales.utilidad_bruta} anterior={añoAnterior.utilidad} label="año ant." />
            </div>
          </div>

          {/* ── Inversiones del período ── */}
          {inversiones.length > 0 && (
            <div className="border border-ch-border p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-0.5">Inversiones del período</p>
                  <p className="font-body text-[9px] text-ch-subtle">Activos fijos — no incluidos en egresos operacionales</p>
                </div>
                <div className="text-right">
                  <p className="font-body text-[9px] text-ch-muted mb-0.5">Total invertido</p>
                  <span className="font-mono text-lg font-medium tabular-nums text-amber-400">{clp(totalInversiones)}</span>
                </div>
              </div>

              <div className="space-y-0">
                {inversiones.map((inv: FilaInversion) => (
                  <div key={inv.id} className="flex justify-between py-2 border-b border-ch-border/20 last:border-0">
                    <div className="min-w-0 pr-4">
                      <p className="font-body text-xs text-ch-cream truncate">{inv.descripcion}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-body text-[9px] text-ch-muted capitalize">{inv.categoria.replace(/_/g, ' ')}</span>
                        {inv.iva_credito > 0 && (
                          <span className="font-body text-[9px] text-ch-green">CF {clp(inv.iva_credito)}</span>
                        )}
                        <span className="font-body text-[9px] text-ch-subtle">activo fijo</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-xs text-amber-400">{clp(inv.monto)}</p>
                      {inv.iva_credito > 0 && (
                        <p className="font-mono text-[9px] text-ch-subtle">neto {clp(inv.monto_neto)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {totalIVACreditoInversiones > 0 && (
                <div className="mt-4 pt-3 border-t border-ch-border/40 flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="font-body text-[9px] text-ch-subtle mb-0.5">IVA crédito fiscal recuperable</p>
                      <span className="font-mono text-sm text-ch-green">{clp(totalIVACreditoInversiones)}</span>
                    </div>
                    <div>
                      <p className="font-body text-[9px] text-ch-subtle mb-0.5">Salida neta de capital</p>
                      <span className="font-mono text-sm text-ch-cream">{clp(totalInversiones - totalIVACreditoInversiones)}</span>
                    </div>
                  </div>
                  <p className="font-body text-[9px] text-ch-subtle">CF incluido en saldo IVA del período</p>
                </div>
              )}
            </div>
          )}

          {/* Leyenda crédito fiscal */}
          <p className="font-body text-[9px] text-ch-subtle px-1">
            CF = crédito fiscal IVA · Gastos con factura a nombre de Casa Hiedra
          </p>
        </div>
      </div>

    </div>
  )
}
