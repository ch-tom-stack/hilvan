'use client'

import { actualizarCotizacion } from '@/app/actions/cotizaciones'
import {
  subtotalDepartamento,
  formatCLP,
  type Cotizacion,
  type TotalesCotizacion,
} from '@/types'
import { EncargoPanel, NotasPanel } from './PanelesLateral'

// ─── PANEL TOTALES (columna derecha) ─────────────────────────────────────────

interface PanelTotalesProps {
  cot: Cotizacion
  setCot: React.Dispatch<React.SetStateAction<Cotizacion>>
  totales: TotalesCotizacion
  showInterno: boolean
  setShowInterno: React.Dispatch<React.SetStateAction<boolean>>
  editable: boolean
}

export default function PanelTotales({ cot, setCot, totales, showInterno, setShowInterno, editable }: PanelTotalesProps) {
  return (
    <div className="w-72 shrink-0 border-l border-ch-border overflow-y-auto p-5 space-y-5">

      {/* ── ENCARGO ── */}
      <EncargoPanel cot={cot} setCot={setCot} />

      <div className="border-t border-ch-border" />

      {/* Toggle interno */}
      <div className="flex items-center justify-between">
        <span className="font-body text-xs uppercase tracking-wider text-ch-muted">Resumen</span>
        <button
          onClick={() => setShowInterno(v => !v)}
          className={`font-body text-xs px-2 py-0.5 rounded transition-colors ${
            showInterno ? 'bg-ch-cream/10 text-ch-cream' : 'text-ch-muted hover:text-ch-cream'
          } ch-press`}
        >
          {showInterno ? 'Vista interna' : 'Ver márgenes'}
        </button>
      </div>

      {/* Subtotales por departamento */}
      <div className="space-y-2">
        {(cot.departamentos ?? []).map(dep => {
          const sub = subtotalDepartamento(dep)
          if (sub === 0) return null
          return (
            <div key={dep.id} className="flex justify-between items-baseline">
              <span className="font-body text-xs text-ch-muted truncate pr-2">{dep.nombre}</span>
              <span className="font-body text-xs text-ch-cream shrink-0">{formatCLP(sub)}</span>
            </div>
          )
        })}
      </div>

      <div className="border-t border-ch-border" />

      {/* Totales */}
      <div className="space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="font-body text-xs text-ch-muted">Subtotal neto</span>
          <span className="font-body text-sm text-ch-cream">{formatCLP(totales.neto)}</span>
        </div>

        {totales.descuento_global_monto > 0 && (
          <div className="flex justify-between items-baseline">
            <span className="font-body text-xs text-ch-muted">
              Descuento ({cot.descuento_global_tipo === 'porcentaje' ? `${cot.descuento_global}%` : 'monto'})
            </span>
            <span className="font-body text-sm text-red-400">
              -{formatCLP(totales.descuento_global_monto)}
            </span>
          </div>
        )}

        {cot.con_iva && (
          <div className="flex justify-between items-baseline">
            <span className="font-body text-xs text-ch-muted">IVA 19%</span>
            <span className="font-body text-sm text-ch-cream">{formatCLP(totales.iva)}</span>
          </div>
        )}

        <div className="flex justify-between items-baseline pt-1 border-t border-ch-border">
          <span className="font-body text-xs font-medium text-ch-cream">Total</span>
          <span className="font-display text-xl text-ch-cream">{formatCLP(totales.total)}</span>
        </div>
      </div>

      {/* Márgenes internos */}
      {showInterno && (
        <>
          <div className="border-t border-ch-border" />
          <div className="space-y-2">
            <p className="font-body text-[10px] uppercase tracking-wider text-ch-muted">Interno</p>
            <div className="flex justify-between items-baseline">
              <span className="font-body text-xs text-ch-muted">Costo real</span>
              <span className="font-body text-sm text-ch-cream">{formatCLP(totales.costo_real)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="font-body text-xs text-ch-muted">Margen</span>
              <span className={`font-body text-sm font-medium ${totales.margen >= 0 ? 'text-ch-green' : 'text-red-400'}`}>
                {formatCLP(totales.margen)}
              </span>
            </div>
            {totales.total > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="font-body text-xs text-ch-muted">% margen</span>
                <span className={`font-body text-sm font-medium ${totales.margen >= 0 ? 'text-ch-green' : 'text-red-400'}`}>
                  {Math.round((totales.margen / totales.total) * 100)}%
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── NOTAS AL CLIENTE ── */}
      <NotasPanel cot={cot} setCot={setCot} />

      {/* Config fiscal */}
      {editable && (
        <>
          <div className="border-t border-ch-border" />
          <div className="space-y-3">
            <p className="font-body text-[10px] uppercase tracking-wider text-ch-muted">Configuración</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cot.con_iva}
                onChange={async e => {
                  const v = e.target.checked
                  await actualizarCotizacion(cot.id, { con_iva: v })
                  setCot(c => ({ ...c, con_iva: v }))
                }}
                className="accent-ch-cream"
              />
              <span className="font-body text-xs text-ch-muted">Incluir IVA 19%</span>
            </label>

            {/* Descuento global */}
            <div>
              <p className="font-body text-xs text-ch-muted mb-1">Descuento global</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={cot.descuento_global || ''}
                  onChange={async e => {
                    const v = Number(e.target.value) || 0
                    await actualizarCotizacion(cot.id, { descuento_global: v })
                    setCot(c => ({ ...c, descuento_global: v }))
                  }}
                  placeholder="0"
                  className="w-24 bg-ch-dark border border-ch-border rounded px-2 py-1 font-body text-xs text-ch-cream focus:outline-none focus:border-ch-cream/40"
                />
                <select
                  value={cot.descuento_global_tipo}
                  onChange={async e => {
                    const v = e.target.value as 'porcentaje' | 'monto'
                    await actualizarCotizacion(cot.id, { descuento_global_tipo: v })
                    setCot(c => ({ ...c, descuento_global_tipo: v }))
                  }}
                  className="flex-1 bg-ch-dark border border-ch-border rounded px-2 py-1 font-body text-xs text-ch-cream focus:outline-none"
                >
                  <option value="porcentaje">%</option>
                  <option value="monto">$</option>
                </select>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
