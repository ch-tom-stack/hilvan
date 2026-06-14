import { describe, it, expect } from 'vitest'
import { calcularMontoBruto, yearParaRetencion } from '@/lib/agent-gastos'

// ── calcularMontoBruto ────────────────────────────────────────────────────────
// Reglas: se persiste SIEMPRE el bruto. Solo las boletas con monto_es='neto' se
// "grossean" usando la tasa del año (Ley 21.133). Factura/exenta/sin_documento
// y boletas ya en bruto se redondean tal cual.
describe('calcularMontoBruto', () => {
  it('boleta neto 2026: grossea con tasa 15,25%', () => {
    const r = calcularMontoBruto({ monto: 84750, monto_es: 'neto', tipo_documento: 'boleta', year: 2026 })
    // 84750 / (1 - 0.1525) = 100000
    expect(r.montoBruto).toBe(100000)
    expect(r.retencion).toBe(15250)
    expect(r.neto).toBe(84750)
  })

  it('boleta bruto: no grossea, retiene sobre el bruto', () => {
    const r = calcularMontoBruto({ monto: 100000, monto_es: 'bruto', tipo_documento: 'boleta', year: 2026 })
    expect(r.montoBruto).toBe(100000)
    expect(r.retencion).toBe(15250)
    expect(r.neto).toBe(84750)
  })

  it('factura neto: NO grossea (sin retención), bruto = monto', () => {
    const r = calcularMontoBruto({ monto: 100000, monto_es: 'neto', tipo_documento: 'factura', year: 2026 })
    expect(r.montoBruto).toBe(100000)
    expect(r.retencion).toBe(0)
    expect(r.neto).toBe(100000)
  })

  it('sin_documento: bruto = monto, retención 0', () => {
    const r = calcularMontoBruto({ monto: 50000, monto_es: 'bruto', tipo_documento: 'sin_documento', year: 2027 })
    expect(r.montoBruto).toBe(50000)
    expect(r.retencion).toBe(0)
  })

  it('boleta neto distinto año cambia la tasa', () => {
    const r2025 = calcularMontoBruto({ monto: 85500, monto_es: 'neto', tipo_documento: 'boleta', year: 2025 })
    // 85500 / (1 - 0.145) = 100000
    expect(r2025.montoBruto).toBe(100000)
  })
})

// ── yearParaRetencion ─────────────────────────────────────────────────────────
describe('yearParaRetencion', () => {
  it('prioriza fecha_documento', () => {
    expect(yearParaRetencion('2024-03-15', '2026-01')).toBe(2024)
  })
  it('usa periodo si no hay fecha_documento', () => {
    expect(yearParaRetencion(null, '2025-07')).toBe(2025)
    expect(yearParaRetencion(undefined, '2025-07')).toBe(2025)
  })
  it('usa el año actual si no hay nada', () => {
    expect(yearParaRetencion()).toBe(new Date().getFullYear())
  })
})
