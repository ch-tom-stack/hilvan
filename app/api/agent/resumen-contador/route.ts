import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  COT_FINANCIERO_SELECT,
  calcularTotalCot,
  inicioPeriodo,
  finPeriodo,
} from '@/app/actions/financiero-helpers'
import {
  _getPPMTasa,
  _getPreviredMensual,
  _getIUSCMensual,
  _getHonorariosContador,
} from '@/app/actions/financiero-config'
import { calcularRetencion } from '@/types'
import { normalizarPeriodo, periodoActual } from '@/lib/agent-estado-financiero'
import { ensamblarResumenContador } from '@/lib/agent-resumen-contador'

export const runtime = 'nodejs'

// GET /api/agent/resumen-contador?periodo=YYYY-MM&honorarios=N
//
// ESTIMACIÓN de lo que la empresa deberá transferir/declarar en el mes para el
// contador (Juan Carlos): IVA a pagar, retención de honorarios, PPM, Previred,
// IUSC y los honorarios del propio contador. Sirve para anticipar "cuánto me va
// a salir" — NO es el F29 oficial (eso lo arma el contador).
//
// Reusa EXACTAMENTE el cálculo tributario del estado de resultados
// (app/actions/financiero-resultados.ts, bloque `tributario`). Si esa lógica
// cambia, este endpoint debe mantenerse en sync.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const periodo = normalizarPeriodo(searchParams.get('periodo')) ?? periodoActual()
  const inicio = inicioPeriodo(periodo)
  const fin = finPeriodo(periodo)
  const finTs = `${fin}T23:59:59`

  const honorariosParam = searchParams.get('honorarios')
  const honorariosOverride =
    honorariosParam != null && Number.isFinite(parseFloat(honorariosParam))
      ? Math.round(parseFloat(honorariosParam))
      : null

  const admin = createAdminClient()

  const [
    { data: cotFacturado, error: eCot },
    { data: gastosProy, error: eGP },
    { data: gastosOp, error: eGO },
    { data: inversiones, error: eInv },
    ppmTasa,
    previred,
    iusc,
    honorariosConfig,
  ] = await Promise.all([
    // Ventas facturadas en el período (devengado) → IVA débito + PPM.
    admin
      .from('cotizaciones')
      .select(COT_FINANCIERO_SELECT)
      .gte('fecha_factura_emitida', inicio)
      .lte('fecha_factura_emitida', fin),
    // Gastos de proyecto aprobados en el período → retención + IVA crédito.
    admin
      .from('rendicion_gastos')
      .select('monto, tipo_documento, factura_casa_hiedra')
      .in('estado', ['aprobada', 'pago_aprobado'])
      .gte('created_at', inicio)
      .lte('created_at', finTs),
    // Gastos operacionales del período.
    admin
      .from('rendicion_mensual_gastos')
      .select('monto, tipo_documento, factura_casa_hiedra, rendicion_mensual:rendiciones_mensuales!inner(periodo)')
      .eq('rendicion_mensual.periodo', inicio),
    // Inversiones del período → IVA crédito de inversiones.
    admin
      .from('inversiones')
      .select('monto, tipo_documento, factura_casa_hiedra')
      .gte('fecha_compra', inicio)
      .lte('fecha_compra', fin),
    _getPPMTasa(),
    _getPreviredMensual(),
    _getIUSCMensual(),
    _getHonorariosContador(),
  ])

  const firstErr = eCot || eGP || eGO || eInv
  if (firstErr) return NextResponse.json({ error: firstErr.message }, { status: 500 })

  const todosGastos = [...((gastosProy ?? []) as any[]), ...((gastosOp ?? []) as any[])]

  // ── Cálculo tributario (idéntico a financiero-resultados.ts) ────────────────
  const retenciones_bh = todosGastos
    .filter((g) => g.tipo_documento === 'boleta')
    .reduce((s, g) => s + calcularRetencion({ monto: g.monto, tipo_documento: g.tipo_documento }).retencion, 0)

  const iva_debito = ((cotFacturado ?? []) as any[]).reduce((s, c) => {
    if (!c.con_iva) return s
    const neto = Math.round(calcularTotalCot(c) / 1.19)
    return s + Math.round(neto * 0.19)
  }, 0)

  const iva_credito_gastos = todosGastos
    .filter((g) => g.factura_casa_hiedra && g.tipo_documento === 'factura')
    .reduce((s, g) => s + Math.round((g.monto * 0.19) / 1.19), 0)

  const iva_credito_inversiones = ((inversiones ?? []) as any[]).reduce((s, inv) => {
    const tieneIVA = inv.factura_casa_hiedra && inv.tipo_documento === 'factura'
    return s + (tieneIVA ? inv.monto - Math.round(inv.monto / 1.19) : 0)
  }, 0)

  const iva_credito = iva_credito_gastos + iva_credito_inversiones
  const saldo_iva = iva_debito - iva_credito

  const neto_facturado_sin_iva = ((cotFacturado ?? []) as any[]).reduce((s, c) => {
    const tot = calcularTotalCot(c)
    return s + (c.con_iva ? Math.round(tot / 1.19) : tot)
  }, 0)
  const ppm_estimado = Math.round(neto_facturado_sin_iva * ppmTasa)

  const honorarios_contador = honorariosOverride ?? honorariosConfig

  const resumen = ensamblarResumenContador({
    saldo_iva,
    retencion_honorarios: retenciones_bh,
    ppm: ppm_estimado,
    previred,
    iusc,
    honorarios_contador,
  })

  return NextResponse.json({
    periodo,
    es_estimacion: true,
    aviso:
      'Estimación interna para anticipar el pago al contador — NO es el F29 oficial. El monto definitivo lo determina el contador (Juan Carlos).',
    ...resumen,
    detalle: {
      iva_debito: Math.round(iva_debito),
      iva_credito: Math.round(iva_credito),
      saldo_iva: Math.round(saldo_iva),
      neto_facturado_sin_iva: Math.round(neto_facturado_sin_iva),
      ppm_tasa: ppmTasa,
      boletas_con_retencion: todosGastos.filter((g) => g.tipo_documento === 'boleta').length,
      honorarios_contador_fuente: honorariosOverride != null ? 'parametro' : 'config',
    },
  })
}
