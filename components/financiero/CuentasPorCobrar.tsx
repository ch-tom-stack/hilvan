'use client'

import type { DatosCobrar, FilaCobrar } from '@/app/actions/financiero'
import { formatCLP } from '@/types'
import { formatFecha as formatFechaHelper } from '@/lib/fechas'

// ─── aging ────────────────────────────────────────────────────────────────────
function agingClass(dias: number): string {
  if (dias > 60) return 'text-red-400'
  if (dias >= 30) return 'text-amber-400'
  return 'text-ch-cream'
}

function agingBadgeClass(dias: number): string {
  if (dias > 60) return 'border-red-500/40 text-red-400'
  if (dias >= 30) return 'border-amber-500/40 text-amber-400'
  return 'border-ch-border/50 text-ch-muted'
}

function formatFecha(iso: string): string {
  return formatFechaHelper(iso, { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  datos: DatosCobrar
}

export default function CuentasPorCobrar({ datos }: Props) {
  const { por_facturar, por_cobrar, total_por_facturar, total_por_cobrar } = datos

  return (
    <div className="space-y-12">

      {/* ── Por facturar ──────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-0.5">
              Pendiente de facturar
            </p>
            <p className="font-body text-[10px] text-ch-muted">
              Proyectos aprobados o en producción sin factura emitida
            </p>
          </div>
          <span className="font-mono text-sm text-ch-cream">
            {formatCLP(total_por_facturar)}
          </span>
        </div>

        {por_facturar.length === 0 ? (
          <EmptyState texto="No hay proyectos pendientes de facturar." />
        ) : (
          <div className="border border-ch-border/50">
            {/* Header */}
            <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-4 py-2 border-b border-ch-border/30 bg-ch-surface/20">
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Cliente</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Proyecto</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-right">Monto</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-right">Días</span>
            </div>

            {por_facturar.map((fila, i) => (
              <FilaPorFacturar key={fila.id} fila={fila} ultimo={i === por_facturar.length - 1} />
            ))}

            {/* Total */}
            <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-4 py-3 border-t border-ch-border/50 bg-ch-surface/10">
              <span className="font-body text-[10px] text-ch-muted col-span-2">
                {por_facturar.length} proyecto{por_facturar.length !== 1 ? 's' : ''}
              </span>
              <span className="font-body text-sm font-mono text-ch-cream text-right">
                {formatCLP(total_por_facturar)}
              </span>
              <span />
            </div>
          </div>
        )}
      </section>

      {/* ── Por cobrar ────────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-0.5">
              Pendiente de cobro
            </p>
            <p className="font-body text-[10px] text-ch-muted">
              Facturas emitidas sin pago recibido
            </p>
          </div>
          <span className="font-mono text-sm text-ch-cream">
            {formatCLP(total_por_cobrar)}
          </span>
        </div>

        {/* Leyenda aging */}
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <span className="font-body text-[9px] text-ch-muted">Aging:</span>
          <span className="font-body text-[9px] text-ch-cream">{'< 30 días'}</span>
          <span className="font-body text-[9px] text-amber-400">30–60 días</span>
          <span className="font-body text-[9px] text-red-400">{'> 60 días'}</span>
        </div>

        {por_cobrar.length === 0 ? (
          <EmptyState texto="No hay facturas pendientes de cobro." />
        ) : (
          <div className="border border-ch-border/50">
            {/* Header */}
            <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-4 py-2 border-b border-ch-border/30 bg-ch-surface/20">
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Cliente</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Proyecto</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-right">N° Factura</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-right">Monto</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-right">Días</span>
            </div>

            {por_cobrar.map((fila, i) => (
              <FilaPorCobrar key={fila.id} fila={fila} ultimo={i === por_cobrar.length - 1} />
            ))}

            {/* Total */}
            <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-4 py-3 border-t border-ch-border/50 bg-ch-surface/10">
              <span className="font-body text-[10px] text-ch-muted col-span-2">
                {por_cobrar.length} factura{por_cobrar.length !== 1 ? 's' : ''}
              </span>
              <span />
              <span className="font-body text-sm font-mono text-ch-cream text-right">
                {formatCLP(total_por_cobrar)}
              </span>
              <span />
            </div>
          </div>
        )}
      </section>

    </div>
  )
}

// ─── Filas ────────────────────────────────────────────────────────────────────

function FilaPorFacturar({ fila, ultimo }: { fila: FilaCobrar; ultimo: boolean }) {
  const dias = fila.dias_desde_aprobacion

  return (
    <div className={`grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-4 py-3 items-center ${!ultimo ? 'border-b border-ch-border/20' : ''}`}>
      <span className="font-body text-xs text-ch-muted truncate">{fila.cliente}</span>
      <div className="min-w-0">
        <span className="font-body text-xs text-ch-cream truncate block">{fila.nombre}</span>
        {fila.fecha_aprobacion && (
          <span className="font-body text-[10px] text-ch-muted/70">
            Aprobado {formatFecha(fila.fecha_aprobacion)}
          </span>
        )}
      </div>
      <span className="font-body text-sm font-mono text-ch-cream text-right whitespace-nowrap">
        {formatCLP(fila.total)}
      </span>
      <div className="text-right">
        {dias !== undefined ? (
          <span className={`font-body text-[10px] font-mono px-1.5 py-0.5 border ${agingBadgeClass(dias)}`}>
            {dias}d
          </span>
        ) : (
          <span className="font-body text-[10px] text-ch-muted/40">—</span>
        )}
      </div>
    </div>
  )
}

function FilaPorCobrar({ fila, ultimo }: { fila: FilaCobrar; ultimo: boolean }) {
  const dias = fila.dias_desde_factura ?? 0

  return (
    <div className={`grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-4 py-3 items-center ${!ultimo ? 'border-b border-ch-border/20' : ''}`}>
      <span className="font-body text-xs text-ch-muted truncate">{fila.cliente}</span>
      <div className="min-w-0">
        <span className={`font-body text-xs truncate block ${agingClass(dias)}`}>{fila.nombre}</span>
        {fila.fecha_factura && (
          <span className="font-body text-[10px] text-ch-muted/70">
            Facturado {formatFecha(fila.fecha_factura)}
          </span>
        )}
      </div>
      <span className="font-body text-[10px] font-mono text-ch-muted text-right whitespace-nowrap">
        {fila.numero_factura ?? '—'}
      </span>
      <span className={`font-body text-sm font-mono text-right whitespace-nowrap ${agingClass(dias)}`}>
        {formatCLP(fila.total)}
      </span>
      <div className="text-right">
        <span className={`font-body text-[10px] font-mono px-1.5 py-0.5 border ${agingBadgeClass(dias)}`}>
          {dias}d
        </span>
      </div>
    </div>
  )
}

// ─── Empty ────────────────────────────────────────────────────────────────────
function EmptyState({ texto }: { texto: string }) {
  return (
    <div className="border border-dashed border-ch-border/40 py-8 text-center">
      <p className="font-body text-sm text-ch-muted">{texto}</p>
    </div>
  )
}
