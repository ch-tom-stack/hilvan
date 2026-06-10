'use client'

import { useState } from 'react'
import { toastOk, toastError } from '@/lib/toast'
import {
  registrarFacturaCotizacion,
  registrarPagoCotizacion,
} from '@/app/actions/cotizaciones'
import type { Cotizacion } from '@/types'
import { parseFechaLocal } from '@/lib/fechas'

// ─── PANEL FACTURACIÓN ───────────────────────────────────────────────────────

export default function PanelFacturacion({ cot, setCot }: { cot: Cotizacion; setCot: React.Dispatch<React.SetStateAction<Cotizacion>> }) {
  const [facturaForm, setFacturaForm] = useState({
    fecha_factura_emitida: cot.fecha_factura_emitida?.slice(0, 10) ?? '',
    numero_factura: cot.numero_factura ?? '',
    fecha_pago_recibido: cot.fecha_pago_recibido?.slice(0, 10) ?? '',
  })
  const [guardandoFactura, setGuardandoFactura] = useState(false)
  const mostrarFacturacion = ['aprobada', 'en_produccion', 'cerrada'].includes(cot.estado)

  async function handleRegistrarFactura() {
    if (!facturaForm.fecha_factura_emitida) return
    setGuardandoFactura(true)
    try {
      await registrarFacturaCotizacion(cot.id, {
        fecha_factura_emitida: facturaForm.fecha_factura_emitida,
        numero_factura: facturaForm.numero_factura,
      })
      setCot(c => ({ ...c, fecha_factura_emitida: facturaForm.fecha_factura_emitida, numero_factura: facturaForm.numero_factura }))
      toastOk('Factura registrada')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al registrar factura')
    } finally {
      setGuardandoFactura(false)
    }
  }

  async function handleRegistrarPago() {
    if (!facturaForm.fecha_pago_recibido) return
    setGuardandoFactura(true)
    try {
      await registrarPagoCotizacion(cot.id, facturaForm.fecha_pago_recibido)
      setCot(c => ({ ...c, fecha_pago_recibido: facturaForm.fecha_pago_recibido }))
      toastOk('Pago registrado')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al registrar pago')
    } finally {
      setGuardandoFactura(false)
    }
  }

  if (!mostrarFacturacion) return null

  return (
    <div className="border border-ch-border rounded p-4 space-y-4">
      <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Facturación</p>

      {/* Factura emitida */}
      {cot.fecha_factura_emitida ? (
        <div className="space-y-1">
          <p className="font-body text-xs text-ch-green">✓ Factura emitida</p>
          <p className="font-body text-xs text-ch-muted">
            {parseFechaLocal(cot.fecha_factura_emitida).toLocaleDateString('es-CL')}
            {cot.numero_factura && ` · Folio ${cot.numero_factura}`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="font-body text-xs text-ch-muted">Registrar factura emitida al cliente</p>
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Fecha factura *</label>
              <input type="date" value={facturaForm.fecha_factura_emitida}
                onChange={e => setFacturaForm(f => ({ ...f, fecha_factura_emitida: e.target.value }))}
                className="input-ch w-full text-sm" />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Nº folio SII</label>
              <input type="text" value={facturaForm.numero_factura} placeholder="Ej: 123456"
                onChange={e => setFacturaForm(f => ({ ...f, numero_factura: e.target.value }))}
                className="input-ch w-full text-sm" />
            </div>
          </div>
          <button onClick={handleRegistrarFactura} disabled={!facturaForm.fecha_factura_emitida || guardandoFactura}
            className="border border-ch-green/60 text-ch-green hover:bg-ch-green/10 font-body text-[9px] tracking-[0.35em] uppercase px-4 py-2 transition-colors disabled:opacity-40">
            {guardandoFactura ? 'Guardando...' : 'Registrar factura'}
          </button>
        </div>
      )}

      {/* Pago recibido — solo aparece si ya hay factura */}
      {cot.fecha_factura_emitida && (
        cot.fecha_pago_recibido ? (
          <div className="space-y-1 border-t border-ch-border/40 pt-3">
            <p className="font-body text-xs text-ch-green">✓ Pago recibido</p>
            <p className="font-body text-xs text-ch-muted">
              {parseFechaLocal(cot.fecha_pago_recibido).toLocaleDateString('es-CL')}
            </p>
          </div>
        ) : (
          <div className="space-y-3 border-t border-ch-border/40 pt-3">
            <div className="flex-1 min-w-[140px]">
              <label className="font-body text-[9px] text-ch-muted uppercase tracking-[0.3em] block mb-1">Fecha de pago recibido</label>
              <input type="date" value={facturaForm.fecha_pago_recibido}
                onChange={e => setFacturaForm(f => ({ ...f, fecha_pago_recibido: e.target.value }))}
                className="input-ch w-full text-sm" />
            </div>
            <button onClick={handleRegistrarPago} disabled={!facturaForm.fecha_pago_recibido || guardandoFactura}
              className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-[0.35em] uppercase px-4 py-2 transition-colors disabled:opacity-40">
              {guardandoFactura ? 'Guardando...' : 'Registrar pago'}
            </button>
          </div>
        )
      )}
    </div>
  )
}
