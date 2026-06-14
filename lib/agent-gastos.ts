// lib/agent-gastos.ts
// Lógica de cálculo compartida por los endpoints de carga de gastos del agente
// (gasto-mensual, gasto-proyecto y crear-gastos-bulk). Se persiste SIEMPRE el
// monto BRUTO; para boletas de honorarios con monto neto se calcula el bruto
// con la tasa de retención del año del documento (Ley 21.133).

import { calcularRetencion, tasaRetencionBoleta } from '@/lib/rendiciones-calc'

/**
 * A partir de un monto y si viene neto o bruto, devuelve el monto bruto a
 * persistir, más su retención y neto. La tasa de retención depende del `year`
 * (año de la boleta). Solo las boletas con monto_es='neto' se grossean.
 */
export function calcularMontoBruto(opts: {
  monto: number
  monto_es: 'neto' | 'bruto'
  tipo_documento: string
  year: number
}): { montoBruto: number; retencion: number; neto: number } {
  const { monto, monto_es, tipo_documento, year } = opts
  const tasa = tasaRetencionBoleta(year)
  const montoBruto =
    tipo_documento === 'boleta' && monto_es === 'neto'
      ? Math.round(monto / (1 - tasa))
      : Math.round(monto)
  const { retencion, neto } = calcularRetencion({ monto: montoBruto, tipo_documento, year })
  return { montoBruto, retencion, neto }
}

/**
 * Año a usar para la tasa de retención: el de `fecha_documento` (YYYY-MM-DD) si
 * viene; si no, el de `periodo` (YYYY-MM) si viene; si no, el año actual.
 */
export function yearParaRetencion(fecha_documento?: string | null, periodo?: string | null): number {
  if (fecha_documento) return Number(fecha_documento.slice(0, 4))
  if (periodo) return Number(periodo.slice(0, 4))
  return new Date().getFullYear()
}
