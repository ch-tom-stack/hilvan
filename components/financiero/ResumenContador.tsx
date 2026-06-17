'use client'

import type { ResumenContadorEstimado } from '@/app/actions/financiero'
import { formatCLP } from '@/types'

interface Props {
  datos: ResumenContadorEstimado
}

export default function ResumenContador({ datos }: Props) {
  const { lineas, total_estimado, iva_a_favor, detalle } = datos

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Aviso de estimación */}
      <div className="border border-ch-gold/30 bg-ch-gold/5 px-4 py-3">
        <p className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-gold mb-1">Estimación</p>
        <p className="font-body text-xs text-ch-muted">
          Anticipo de lo que deberás transferir/declarar este mes. <strong className="text-ch-cream">No es el F29 oficial</strong> — el
          monto definitivo lo determina el contador.
        </p>
      </div>

      {/* Desglose */}
      <div className="border border-ch-border/50">
        <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-2 border-b border-ch-border/30 bg-ch-surface/20">
          <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted">Concepto</span>
          <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-muted text-right">Monto</span>
        </div>

        {lineas.map((l, i) => (
          <div
            key={l.concepto}
            className={`grid grid-cols-[1fr_auto] gap-4 px-5 py-3 items-baseline ${
              i < lineas.length - 1 ? 'border-b border-ch-border/20' : ''
            }`}
          >
            <div className="min-w-0">
              <span className="font-body text-sm text-ch-cream">{l.concepto}</span>
              {l.nota && <span className="block font-body text-[10px] text-ch-gold/80 mt-0.5">{l.nota}</span>}
            </div>
            <span className="font-body text-sm font-mono text-ch-cream text-right whitespace-nowrap">
              {formatCLP(l.monto)}
            </span>
          </div>
        ))}

        {/* Total */}
        <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 border-t border-ch-border/50 bg-ch-surface/10 items-baseline">
          <span className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted">Total estimado a transferir</span>
          <span className="font-display italic text-2xl text-ch-green text-right whitespace-nowrap">
            {formatCLP(total_estimado)}
          </span>
        </div>
      </div>

      {/* Detalle del IVA */}
      <div>
        <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-2">Detalle del IVA</p>
        <div className="border border-ch-border/40 px-5 py-4 space-y-1.5">
          <Fila label="IVA débito (ventas facturadas)" valor={detalle.iva_debito} />
          <Fila label="IVA crédito (compras + inversiones)" valor={-detalle.iva_credito} />
          <div className="border-t border-ch-border/30 pt-1.5 mt-1.5">
            <Fila
              label={detalle.saldo_iva >= 0 ? 'Saldo IVA a pagar' : 'Saldo IVA a favor'}
              valor={detalle.saldo_iva}
              resaltar
            />
          </div>
          {iva_a_favor > 0 && (
            <p className="font-body text-[10px] text-ch-gold/80 pt-1">
              El crédito de {formatCLP(iva_a_favor)} se arrastra al mes siguiente (no se paga este mes).
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Fila({ label, valor, resaltar = false }: { label: string; valor: number; resaltar?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-4">
      <span className={`font-body text-xs ${resaltar ? 'text-ch-cream' : 'text-ch-muted'}`}>{label}</span>
      <span className={`font-mono text-xs text-right whitespace-nowrap ${resaltar ? 'text-ch-cream' : 'text-ch-muted'}`}>
        {formatCLP(valor)}
      </span>
    </div>
  )
}
