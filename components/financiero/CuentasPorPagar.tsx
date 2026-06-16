'use client'

import type { DatosPagar, FilaPagar } from '@/app/actions/financiero'
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

const TIPO_LABEL: Record<string, string> = {
  boleta: 'Boleta',
  factura: 'Factura',
  factura_exenta: 'Factura exenta',
  sin_documento: 'Sin doc.',
  nota_credito: 'Nota crédito',
}

interface Props {
  datos: DatosPagar
}

export default function CuentasPorPagar({ datos }: Props) {
  const { filas, total } = datos

  return (
    <div className="space-y-12">
      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-0.5">
              Pendiente de pago
            </p>
            <p className="font-body text-[10px] text-ch-muted">
              Gastos de proyecto esperando pago (interno enviado / externo aprobado), en neto. Misma base que Centro de costos.
            </p>
          </div>
          <span className="font-mono text-sm text-ch-cream">{formatCLP(total)}</span>
        </div>

        {/* Leyenda aging */}
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <span className="font-body text-[9px] text-ch-muted">Antigüedad:</span>
          <span className="font-body text-[9px] text-ch-cream">{'< 30 días'}</span>
          <span className="font-body text-[9px] text-amber-400">30–60 días</span>
          <span className="font-body text-[9px] text-red-400">{'> 60 días'}</span>
        </div>

        {filas.length === 0 ? (
          <EmptyState texto="No hay gastos pendientes de pago." />
        ) : (
          <div className="border border-ch-border/50">
            {/* Header */}
            <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-4 py-2 border-b border-ch-border/30 bg-ch-surface/20">
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Proveedor</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Contexto</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-right">Tipo</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-right">Neto</span>
              <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-right">Días</span>
            </div>

            {filas.map((fila, i) => (
              <FilaPorPagar key={fila.id} fila={fila} ultimo={i === filas.length - 1} />
            ))}

            {/* Total */}
            <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-4 py-3 border-t border-ch-border/50 bg-ch-surface/10">
              <span className="font-body text-[10px] text-ch-muted col-span-2">
                {filas.length} gasto{filas.length !== 1 ? 's' : ''}
              </span>
              <span />
              <span className="font-body text-sm font-mono text-ch-cream text-right">
                {formatCLP(total)}
              </span>
              <span />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Fila ─────────────────────────────────────────────────────────────────────
function FilaPorPagar({ fila, ultimo }: { fila: FilaPagar; ultimo: boolean }) {
  const dias = fila.dias_desde_documento ?? 0

  return (
    <div className={`grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-4 py-3 items-center ${!ultimo ? 'border-b border-ch-border/20' : ''}`}>
      <span className={`font-body text-xs truncate ${agingClass(dias)}`}>{fila.proveedor}</span>
      <div className="min-w-0">
        <span className="font-body text-xs text-ch-cream truncate block">{fila.contexto}</span>
        {fila.fecha_documento && (
          <span className="font-body text-[10px] text-ch-muted/70">
            Doc {formatFecha(fila.fecha_documento)}
          </span>
        )}
      </div>
      <span className="font-body text-[10px] font-mono text-ch-muted text-right whitespace-nowrap">
        {fila.tipo_documento ? (TIPO_LABEL[fila.tipo_documento] ?? fila.tipo_documento) : '—'}
      </span>
      <div className="text-right whitespace-nowrap">
        <span className={`font-body text-sm font-mono ${agingClass(dias)}`}>{formatCLP(fila.neto)}</span>
        {fila.bruto !== fila.neto && (
          <span className="block font-body text-[10px] text-ch-muted/70">bruto {formatCLP(fila.bruto)}</span>
        )}
      </div>
      <div className="text-right">
        {fila.dias_desde_documento !== undefined ? (
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

// ─── Empty ────────────────────────────────────────────────────────────────────
function EmptyState({ texto }: { texto: string }) {
  return (
    <div className="border border-dashed border-ch-border/40 py-8 text-center">
      <p className="font-body text-sm text-ch-muted">{texto}</p>
    </div>
  )
}
