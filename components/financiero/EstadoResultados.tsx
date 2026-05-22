'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { DatosFinancieros, ResumenPeriodo, FilaCotizacion, FilaGasto, FilaCuota } from '@/app/actions/financiero'
import { generarZIPContador } from '@/lib/exportar-contador'

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
}

export default function EstadoResultados({ datos, anterior, añoAnterior }: Props) {
  const { ingresos, egresos, tributario, totales } = datos

  const totalPorFacturar = ingresos.por_facturar.reduce((s, c) => s + c.total, 0)
  const totalPorCobrar = ingresos.por_cobrar.reduce((s, c) => s + c.total, 0)
  const totalCobrado = totales.ingresos_cobrados

  const totalGastosProyectos = egresos.gastos_proyectos.reduce((s, g) => s + g.monto, 0)
  const totalGastosOp = egresos.gastos_operacionales.reduce((s, g) => s + g.monto, 0)
  const totalCuotas = egresos.cuotas_creditos.reduce((s, c) => s + c.monto, 0)
  const totalEgresos = totalGastosProyectos + totalGastosOp + totalCuotas

  const [exportando, setExportando] = useState(false)
  const [errorExport, setErrorExport] = useState<string | null>(null)

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
        <div className="border border-ch-border p-5 space-y-5">

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
              <VariacionBadge actual={totalCobrado} anterior={anterior.cobrado} label="mes anterior" />
              <VariacionBadge actual={totalCobrado} anterior={añoAnterior.cobrado} label="año anterior" />
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

          {/* Total egresos con comparativa */}
          <Separador />
          <div>
            <FilaNumero label="Total egresos" valor={totalEgresos} bold color="text-red-400" />
            <div className="flex items-center gap-4 mt-1">
              <VariacionBadge actual={totalEgresos} anterior={anterior.egresos} label="mes anterior" />
              <VariacionBadge actual={totalEgresos} anterior={añoAnterior.egresos} label="año anterior" />
            </div>
          </div>
        </div>

        {/* ═══ COLUMNA TRIBUTARIO + RESULTADO ═══ */}
        <div className="space-y-4">

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
            <FilaNumero label="PPM estimado (1.6%)" valor={tributario.ppm_estimado} color="text-amber-400" />

            {/* Total obligaciones */}
            <div className="mt-3 pt-2 border-t border-ch-border/40">
              <FilaNumero
                label="Total obligaciones"
                valor={tributario.retenciones_bh + Math.max(0, tributario.saldo_iva) + tributario.ppm_estimado}
                bold
                color="text-amber-400"
              />
            </div>
          </div>

          {/* Resultado */}
          <div className="border border-ch-border p-5">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-4">Resultado</p>

            <FilaNumero label="Ingresos cobrados" valor={totales.ingresos_cobrados} color="text-ch-green" />
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

          {/* Leyenda crédito fiscal */}
          <p className="font-body text-[9px] text-ch-subtle px-1">
            CF = crédito fiscal IVA · Gastos con factura a nombre de Casa Hiedra
          </p>
        </div>
      </div>
    </div>
  )
}
