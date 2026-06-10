// lib/rendiciones-calc.ts
// Cálculos de rendiciones (CH-5) — retención de honorarios.
// Extraído de types/index.ts en T12 — la función no fue modificada.

const RETENCION_BOLETA = 0.154

export function calcularRetencion(rendicion: { monto: number; tipo_documento?: string | null }) {
  if (rendicion.tipo_documento === 'boleta') {
    const retencion = Math.round(rendicion.monto * RETENCION_BOLETA)
    return { bruto: rendicion.monto, retencion, neto: rendicion.monto - retencion, sinDocumento: false }
  }
  if (rendicion.tipo_documento === 'sin_documento') {
    return { bruto: rendicion.monto, retencion: 0, neto: rendicion.monto, sinDocumento: true }
  }
  // factura, exenta — pago bruto completo
  return { bruto: rendicion.monto, retencion: 0, neto: rendicion.monto, sinDocumento: false }
}
