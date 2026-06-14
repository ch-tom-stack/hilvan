import { describe, it, expect } from 'vitest'
import {
  calcularBruto,
  subtotalItem,
  subtotalSubgrupo,
  subtotalDepartamento,
  calcularTotales,
  type CotizacionItem,
  type CotizacionSubgrupo,
  type CotizacionDepartamento,
  type Cotizacion,
} from '@/types'

// ── Factories mínimas (solo campos que usan los cálculos) ─────────────────────

function item(overrides: Partial<CotizacionItem> = {}): CotizacionItem {
  return {
    id: 'i',
    cotizacion_id: 'c',
    departamento_id: 'd',
    subgrupo_id: null,
    tipo: 'equipo_ch',
    nombre: 'Item',
    con_boleta: false,
    tasa_boleta: 0,
    precio_neto_proveedor: 0,
    precio_bruto: 0,
    precio_cliente_personalizado: false,
    precio_cliente: 0,
    cantidad: 1,
    dias: 1,
    unidad: 'día',
    incluido: false,
    descuento_item: 0,
    descuento_item_tipo: 'porcentaje',
    orden: 0,
    created_at: '',
    ...overrides,
  }
}

function cotizacion(overrides: Partial<Cotizacion> = {}): Cotizacion {
  return {
    id: 'c',
    grupo_id: 'g',
    version: 1,
    nombre: 'Cot',
    estado: 'borrador',
    con_iva: false,
    formato_pdf: 'simple',
    descuento_global: 0,
    descuento_global_tipo: 'porcentaje',
    created_at: '',
    updated_at: '',
    departamentos: [],
    ...overrides,
  }
}

// ── calcularBruto ─────────────────────────────────────────────────────────────
describe('calcularBruto', () => {
  it('usa tasa por defecto 0.153: bruto = round(neto / (1 - 0.153))', () => {
    // 100000 / 0.847 = 118063.75... → 118064
    expect(calcularBruto(100000)).toBe(118064)
  })

  it('acepta tasa explícita', () => {
    // 100000 / (1 - 0.2) = 125000
    expect(calcularBruto(100000, 0.2)).toBe(125000)
  })

  it('neto 0 → 0', () => {
    expect(calcularBruto(0)).toBe(0)
  })

  it('redondea correctamente con tasa 0.1', () => {
    // 9999 / 0.9 = 11110 exacto
    expect(calcularBruto(9999, 0.1)).toBe(11110)
  })
})

// ── subtotalItem ──────────────────────────────────────────────────────────────
describe('subtotalItem', () => {
  it('item incluido (cortesía) → 0 sin importar precio', () => {
    expect(subtotalItem(item({ incluido: true, precio_cliente: 50000, cantidad: 3, dias: 2 }))).toBe(0)
  })

  it('precio * cantidad * dias sin descuento', () => {
    expect(subtotalItem(item({ precio_cliente: 10000, cantidad: 2, dias: 3 }))).toBe(60000)
  })

  it('descuento porcentaje', () => {
    // 100000 * (1 - 0.1) = 90000
    expect(subtotalItem(item({ precio_cliente: 100000, descuento_item: 10, descuento_item_tipo: 'porcentaje' }))).toBe(90000)
  })

  it('descuento monto fijo', () => {
    expect(subtotalItem(item({ precio_cliente: 100000, descuento_item: 15000, descuento_item_tipo: 'monto' }))).toBe(85000)
  })

  it('descuento porcentaje con redondeo CLP', () => {
    // 33333 * (1 - 0.15) = 28333.05 → 28333
    expect(subtotalItem(item({ precio_cliente: 33333, descuento_item: 15, descuento_item_tipo: 'porcentaje' }))).toBe(28333)
  })

  it('DUDOSO: descuento monto mayor que base produce subtotal negativo', () => {
    // No hay clamp a 0 — el comportamiento actual resta sin límite
    expect(subtotalItem(item({ precio_cliente: 1000, descuento_item: 5000, descuento_item_tipo: 'monto' }))).toBe(-4000)
  })

  it('DUDOSO: descuento porcentaje > 100 produce subtotal negativo', () => {
    // 1000 * (1 - 1.5) = -500
    expect(subtotalItem(item({ precio_cliente: 1000, descuento_item: 150, descuento_item_tipo: 'porcentaje' }))).toBe(-500)
  })
})

// ── subtotalSubgrupo ──────────────────────────────────────────────────────────
describe('subtotalSubgrupo', () => {
  it('suma items del subgrupo', () => {
    const sg: CotizacionSubgrupo = {
      id: 'sg', cotizacion_id: 'c', departamento_id: 'd', nombre: 'SG', orden: 0,
      items: [
        item({ precio_cliente: 10000 }),
        item({ precio_cliente: 20000, cantidad: 2 }),
      ],
    }
    expect(subtotalSubgrupo(sg)).toBe(50000)
  })

  it('subgrupo sin items → 0', () => {
    const sg: CotizacionSubgrupo = { id: 'sg', cotizacion_id: 'c', departamento_id: 'd', nombre: 'SG', orden: 0 }
    expect(subtotalSubgrupo(sg)).toBe(0)
  })
})

// ── subtotalDepartamento ──────────────────────────────────────────────────────
describe('subtotalDepartamento', () => {
  it('suma items directos + subgrupos', () => {
    const dep: CotizacionDepartamento = {
      id: 'd', cotizacion_id: 'c', nombre: 'Dep', orden: 0,
      items: [item({ precio_cliente: 5000 })],
      subgrupos: [
        { id: 'sg', cotizacion_id: 'c', departamento_id: 'd', nombre: 'SG', orden: 0, items: [item({ precio_cliente: 7000 })] },
      ],
    }
    expect(subtotalDepartamento(dep)).toBe(12000)
  })

  it('departamento vacío → 0', () => {
    const dep: CotizacionDepartamento = { id: 'd', cotizacion_id: 'c', nombre: 'Dep', orden: 0 }
    expect(subtotalDepartamento(dep)).toBe(0)
  })
})

// ── calcularTotales ───────────────────────────────────────────────────────────
describe('calcularTotales', () => {
  it('cotización vacía → todos los totales en 0', () => {
    const t = calcularTotales(cotizacion())
    expect(t).toEqual({
      neto: 0,
      descuento_global_monto: 0,
      neto_con_descuento: 0,
      iva: 0,
      total: 0,
      costo_real: 0,
      margen: 0,
    })
  })

  it('neto sin IVA ni descuento global', () => {
    const t = calcularTotales(cotizacion({
      departamentos: [{
        id: 'd', cotizacion_id: 'c', nombre: 'Dep', orden: 0,
        items: [item({ precio_cliente: 100000 })],
      }],
    }))
    expect(t.neto).toBe(100000)
    expect(t.iva).toBe(0)
    expect(t.total).toBe(100000)
  })

  it('aplica IVA 19% sobre neto con descuento', () => {
    const t = calcularTotales(cotizacion({
      con_iva: true,
      departamentos: [{
        id: 'd', cotizacion_id: 'c', nombre: 'Dep', orden: 0,
        items: [item({ precio_cliente: 100000 })],
      }],
    }))
    expect(t.iva).toBe(19000)
    expect(t.total).toBe(119000)
  })

  it('descuento global porcentaje', () => {
    const t = calcularTotales(cotizacion({
      descuento_global: 10,
      descuento_global_tipo: 'porcentaje',
      departamentos: [{
        id: 'd', cotizacion_id: 'c', nombre: 'Dep', orden: 0,
        items: [item({ precio_cliente: 100000 })],
      }],
    }))
    expect(t.descuento_global_monto).toBe(10000)
    expect(t.neto_con_descuento).toBe(90000)
    expect(t.total).toBe(90000)
  })

  it('descuento global monto fijo', () => {
    const t = calcularTotales(cotizacion({
      descuento_global: 25000,
      descuento_global_tipo: 'monto',
      departamentos: [{
        id: 'd', cotizacion_id: 'c', nombre: 'Dep', orden: 0,
        items: [item({ precio_cliente: 100000 })],
      }],
    }))
    expect(t.descuento_global_monto).toBe(25000)
    expect(t.neto_con_descuento).toBe(75000)
  })

  it('costo_real y margen usan precio_bruto', () => {
    const t = calcularTotales(cotizacion({
      con_iva: false,
      departamentos: [{
        id: 'd', cotizacion_id: 'c', nombre: 'Dep', orden: 0,
        items: [item({ precio_cliente: 100000, precio_bruto: 60000, cantidad: 1, dias: 1 })],
      }],
    }))
    expect(t.costo_real).toBe(60000)
    expect(t.margen).toBe(40000) // total 100000 - costo 60000
  })

  it('costo_real cuenta items incluidos (cortesía) aunque no aporten al neto', () => {
    // subtotalItem de incluido = 0, pero costo_real recorre TODOS los items
    const t = calcularTotales(cotizacion({
      departamentos: [{
        id: 'd', cotizacion_id: 'c', nombre: 'Dep', orden: 0,
        items: [item({ incluido: true, precio_cliente: 100000, precio_bruto: 30000 })],
      }],
    }))
    expect(t.neto).toBe(0)
    expect(t.costo_real).toBe(30000)
    // DUDOSO: margen negativo porque el ítem de cortesía suma costo pero no ingreso
    expect(t.margen).toBe(-30000)
  })

  it('IVA con descuento global y redondeo', () => {
    // neto 333333, desc 10% = 33333 (round), neto_cd = 300000, iva = 57000
    const t = calcularTotales(cotizacion({
      con_iva: true,
      descuento_global: 10,
      descuento_global_tipo: 'porcentaje',
      departamentos: [{
        id: 'd', cotizacion_id: 'c', nombre: 'Dep', orden: 0,
        items: [item({ precio_cliente: 333333 })],
      }],
    }))
    expect(t.neto).toBe(333333)
    expect(t.descuento_global_monto).toBe(33333)
    expect(t.neto_con_descuento).toBe(300000)
    expect(t.iva).toBe(57000)
    expect(t.total).toBe(357000)
  })

  it('descuento_global negativo se ignora (guard > 0), no suma', () => {
    const t = calcularTotales(cotizacion({
      descuento_global: -5000,
      descuento_global_tipo: 'monto',
      departamentos: [{
        id: 'd', cotizacion_id: 'c', nombre: 'Dep', orden: 0,
        items: [item({ precio_cliente: 100000 })],
      }],
    }))
    expect(t.descuento_global_monto).toBe(0)
    expect(t.neto_con_descuento).toBe(100000)
  })

  it('descuento_global mayor que el neto se topa en el neto (total nunca negativo)', () => {
    const t = calcularTotales(cotizacion({
      descuento_global: 999999,
      descuento_global_tipo: 'monto',
      departamentos: [{
        id: 'd', cotizacion_id: 'c', nombre: 'Dep', orden: 0,
        items: [item({ precio_cliente: 100000 })],
      }],
    }))
    expect(t.descuento_global_monto).toBe(100000)
    expect(t.neto_con_descuento).toBe(0)
    expect(t.total).toBeGreaterThanOrEqual(0)
  })
})
