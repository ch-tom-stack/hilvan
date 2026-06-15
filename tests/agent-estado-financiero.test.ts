import { describe, it, expect } from 'vitest'
import {
  normalizarPeriodo,
  periodoActual,
  rangoPeriodo,
  fechaDentroDePeriodo,
  fechaTributariaGasto,
  agregarPorCategoria,
} from '@/lib/agent-estado-financiero'

describe('normalizarPeriodo', () => {
  it('acepta YYYY-MM válido', () => {
    expect(normalizarPeriodo('2026-06')).toBe('2026-06')
    expect(normalizarPeriodo('  2026-06  ')).toBe('2026-06')
  })
  it('rechaza formatos inválidos', () => {
    expect(normalizarPeriodo('2026-6')).toBeNull()
    expect(normalizarPeriodo('2026/06')).toBeNull()
    expect(normalizarPeriodo('')).toBeNull()
    expect(normalizarPeriodo(null)).toBeNull()
    expect(normalizarPeriodo(undefined)).toBeNull()
  })
})

describe('periodoActual', () => {
  it('formatea YYYY-MM con padding', () => {
    expect(periodoActual(new Date(2026, 0, 15))).toBe('2026-01')
    expect(periodoActual(new Date(2026, 11, 1))).toBe('2026-12')
  })
})

describe('rangoPeriodo', () => {
  it('fin exclusivo = primer día del mes siguiente', () => {
    expect(rangoPeriodo('2026-06')).toEqual({ inicio: '2026-06-01', finExcl: '2026-07-01' })
  })
  it('cruza el cambio de año en diciembre', () => {
    expect(rangoPeriodo('2026-12')).toEqual({ inicio: '2026-12-01', finExcl: '2027-01-01' })
  })
})

describe('fechaDentroDePeriodo', () => {
  it('incluye el primer día e excluye el primero del mes siguiente', () => {
    expect(fechaDentroDePeriodo('2026-06-01', '2026-06')).toBe(true)
    expect(fechaDentroDePeriodo('2026-06-30', '2026-06')).toBe(true)
    expect(fechaDentroDePeriodo('2026-07-01', '2026-06')).toBe(false)
    expect(fechaDentroDePeriodo('2026-05-31', '2026-06')).toBe(false)
  })
  it('acepta timestamps ISO completos (compara solo la fecha)', () => {
    expect(fechaDentroDePeriodo('2026-06-15T23:59:00.000Z', '2026-06')).toBe(true)
    expect(fechaDentroDePeriodo('2026-07-01T00:00:00.000Z', '2026-06')).toBe(false)
  })
  it('null/undefined → false', () => {
    expect(fechaDentroDePeriodo(null, '2026-06')).toBe(false)
    expect(fechaDentroDePeriodo(undefined, '2026-06')).toBe(false)
  })
})

describe('fechaTributariaGasto', () => {
  it('prioriza fecha_documento', () => {
    expect(fechaTributariaGasto({ fecha_documento: '2026-03-01', created_at: '2026-06-01' })).toBe('2026-03-01')
  })
  it('fallback a created_at', () => {
    expect(fechaTributariaGasto({ fecha_documento: null, created_at: '2026-06-01' })).toBe('2026-06-01')
  })
  it('null si no hay ninguna', () => {
    expect(fechaTributariaGasto({})).toBeNull()
  })
})

describe('agregarPorCategoria', () => {
  const items = [
    { cat: 'Transporte', monto: 1000 },
    { cat: 'Transporte', monto: 500 },
    { cat: 'Alimentación', monto: 2000 },
    { cat: '', monto: 300 },
    { cat: null as string | null, monto: 100 },
  ]
  it('suma por clave y agrupa vacíos/nulos bajo Sin categoría', () => {
    const r = agregarPorCategoria(items, (x) => x.cat, (x) => x.monto)
    expect(r).toEqual({ Transporte: 1500, Alimentación: 2000, 'Sin categoría': 400 })
  })
  it('los montos negativos (notas de crédito) restan', () => {
    const conNC = [
      { cat: 'Insumos', monto: 5000 },
      { cat: 'Insumos', monto: -2000 },
    ]
    const r = agregarPorCategoria(conNC, (x) => x.cat, (x) => x.monto)
    expect(r).toEqual({ Insumos: 3000 })
  })
})
