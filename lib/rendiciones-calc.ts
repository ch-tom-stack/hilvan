// lib/rendiciones-calc.ts
// Cálculos de rendiciones (CH-5) — retención de honorarios.

// Tasa de retención de boletas de honorarios — aumento gradual de la Ley 21.133
// (sube ~0,75 pts cada año hasta 17% en 2028). La tasa aplicable depende del
// AÑO de emisión de la boleta.
const TASAS_RETENCION: Record<number, number> = {
  2020: 0.1075,
  2021: 0.115,
  2022: 0.1225,
  2023: 0.13,
  2024: 0.1375,
  2025: 0.145,
  2026: 0.1525,
  2027: 0.16,
  2028: 0.17, // tope final
}
const TASA_TOPE = 0.17

/**
 * Tasa de retención de honorarios para un año dado (default: año actual).
 * 2028 en adelante usa el tope (17%); años previos a 2020 usan 2020.
 */
export function tasaRetencionBoleta(year?: number): number {
  const y = year ?? new Date().getFullYear()
  if (TASAS_RETENCION[y] != null) return TASAS_RETENCION[y]
  if (y < 2020) return TASAS_RETENCION[2020]
  return TASA_TOPE
}

/**
 * Calcula retención y neto de un monto BRUTO según el tipo de documento.
 * Para boletas, la tasa depende del año (pasa `fecha` YYYY-MM-DD o un objeto
 * con `year`; si no, usa el año actual).
 */
export function calcularRetencion(rendicion: {
  monto: number
  tipo_documento?: string | null
  fecha?: string | null
  year?: number
}) {
  if (rendicion.tipo_documento === 'boleta') {
    const year =
      rendicion.year ??
      (rendicion.fecha ? Number(rendicion.fecha.slice(0, 4)) : undefined)
    const tasa = tasaRetencionBoleta(Number.isFinite(year) ? year : undefined)
    const retencion = Math.round(rendicion.monto * tasa)
    return { bruto: rendicion.monto, retencion, neto: rendicion.monto - retencion, sinDocumento: false }
  }
  if (rendicion.tipo_documento === 'sin_documento') {
    return { bruto: rendicion.monto, retencion: 0, neto: rendicion.monto, sinDocumento: true }
  }
  // factura, exenta — pago bruto completo
  return { bruto: rendicion.monto, retencion: 0, neto: rendicion.monto, sinDocumento: false }
}
