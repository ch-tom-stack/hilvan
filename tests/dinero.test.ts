import { describe, it, expect } from 'vitest'
import {
  calcularRetencion,
  formatCLP,
  subtotalRentalItem,
  calcularTotalesRental,
  type RentalCotizacion,
  type RentalCotizacionItem,
} from '@/types'

// ── calcularRetencion ─────────────────────────────────────────────────────────
// Tasa vigente en el código: RETENCION_BOLETA = 0.154 (constante hardcodeada en types).
describe('calcularRetencion', () => {
  it('boleta: retiene 15.4% (tasa actual del código)', () => {
    const r = calcularRetencion({ monto: 100000, tipo_documento: 'boleta' })
    expect(r.retencion).toBe(15400)
    expect(r.bruto).toBe(100000)
    expect(r.neto).toBe(84600)
    expect(r.sinDocumento).toBe(false)
  })

  it('boleta: redondea la retención', () => {
    // 33333 * 0.154 = 5133.282 → 5133
    const r = calcularRetencion({ monto: 33333, tipo_documento: 'boleta' })
    expect(r.retencion).toBe(5133)
    expect(r.neto).toBe(33333 - 5133)
  })

  it('sin_documento: sin retención, marca sinDocumento', () => {
    const r = calcularRetencion({ monto: 50000, tipo_documento: 'sin_documento' })
    expect(r.retencion).toBe(0)
    expect(r.neto).toBe(50000)
    expect(r.sinDocumento).toBe(true)
  })

  it('factura: pago bruto completo, sin retención', () => {
    const r = calcularRetencion({ monto: 80000, tipo_documento: 'factura' })
    expect(r.retencion).toBe(0)
    expect(r.neto).toBe(80000)
    expect(r.sinDocumento).toBe(false)
  })

  it('exenta: pago bruto completo', () => {
    const r = calcularRetencion({ monto: 80000, tipo_documento: 'exenta' })
    expect(r.retencion).toBe(0)
    expect(r.neto).toBe(80000)
  })

  it('tipo_documento undefined → tratado como factura (sin retención)', () => {
    const r = calcularRetencion({ monto: 80000 })
    expect(r.retencion).toBe(0)
    expect(r.neto).toBe(80000)
    expect(r.sinDocumento).toBe(false)
  })

  it('tipo_documento null → sin retención', () => {
    const r = calcularRetencion({ monto: 80000, tipo_documento: null })
    expect(r.retencion).toBe(0)
  })

  it('monto 0 → todo 0', () => {
    const r = calcularRetencion({ monto: 0, tipo_documento: 'boleta' })
    expect(r.retencion).toBe(0)
    expect(r.neto).toBe(0)
  })
})

// ── formatCLP ─────────────────────────────────────────────────────────────────
describe('formatCLP', () => {
  it('cero', () => {
    expect(formatCLP(0)).toBe('$0')
  })

  it('miles con separador es-CL (punto)', () => {
    expect(formatCLP(1000)).toBe('$1.000')
    expect(formatCLP(1234567)).toBe('$1.234.567')
  })

  it('redondea decimales antes de formatear', () => {
    expect(formatCLP(1999.6)).toBe('$2.000')
    expect(formatCLP(1999.4)).toBe('$1.999')
  })

  it('negativos', () => {
    expect(formatCLP(-5000)).toBe('$-5.000')
  })
})

// ── Rental ────────────────────────────────────────────────────────────────────
function rItem(overrides: Partial<RentalCotizacionItem> = {}): RentalCotizacionItem {
  return {
    id: 'i',
    cotizacion_id: 'c',
    descripcion: 'Item',
    cantidad: 1,
    dias: 1,
    precio_unitario: 0,
    descuento: 0,
    descuento_tipo: 'porcentaje',
    incluido: false,
    orden: 0,
    created_at: '',
    ...overrides,
  }
}

function rCot(overrides: Partial<RentalCotizacion> = {}): RentalCotizacion {
  return {
    id: 'c',
    numero: 'R-1',
    reserva_id: null,
    cliente_id: null,
    estado: 'borrador',
    con_iva: false,
    descuento_global: 0,
    descuento_global_tipo: 'porcentaje',
    created_at: '',
    updated_at: '',
    secciones: [],
    ...overrides,
  }
}

describe('subtotalRentalItem', () => {
  it('incluido → 0', () => {
    expect(subtotalRentalItem(rItem({ incluido: true, precio_unitario: 5000 }))).toBe(0)
  })

  it('precio * cantidad * dias', () => {
    expect(subtotalRentalItem(rItem({ precio_unitario: 10000, cantidad: 2, dias: 3 }))).toBe(60000)
  })

  it('descuento porcentaje', () => {
    expect(subtotalRentalItem(rItem({ precio_unitario: 100000, descuento: 20, descuento_tipo: 'porcentaje' }))).toBe(80000)
  })

  it('descuento monto', () => {
    expect(subtotalRentalItem(rItem({ precio_unitario: 100000, descuento: 30000, descuento_tipo: 'monto' }))).toBe(70000)
  })
})

describe('calcularTotalesRental', () => {
  it('cotización vacía → 0', () => {
    expect(calcularTotalesRental(rCot())).toEqual({
      neto: 0, descuento_global_monto: 0, neto_con_descuento: 0, iva: 0, total: 0,
    })
  })

  it('suma secciones, aplica descuento global e IVA', () => {
    const t = calcularTotalesRental(rCot({
      con_iva: true,
      descuento_global: 10,
      descuento_global_tipo: 'porcentaje',
      secciones: [{
        id: 's', cotizacion_id: 'c', nombre: 'Sec', orden: 0,
        items: [rItem({ precio_unitario: 100000 }), rItem({ precio_unitario: 100000 })],
      }],
    }))
    expect(t.neto).toBe(200000)
    expect(t.descuento_global_monto).toBe(20000)
    expect(t.neto_con_descuento).toBe(180000)
    expect(t.iva).toBe(34200) // 180000 * 0.19
    expect(t.total).toBe(214200)
  })
})
