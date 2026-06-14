import { describe, it, expect } from 'vitest'
import {
  esMatchTablaValida,
  validarCoherencia,
  patchPago,
  columnasPrevio,
  patchRestaurar,
} from '@/lib/agent-conciliacion'

// ── esMatchTablaValida ────────────────────────────────────────────────────────
describe('esMatchTablaValida', () => {
  it('acepta las cuatro tablas válidas', () => {
    expect(esMatchTablaValida('rendicion_gastos')).toBe(true)
    expect(esMatchTablaValida('rendicion_mensual_gastos')).toBe(true)
    expect(esMatchTablaValida('gastos_fijos_cuotas')).toBe(true)
    expect(esMatchTablaValida('cotizaciones')).toBe(true)
  })
  it('rechaza tablas no permitidas o no-string', () => {
    expect(esMatchTablaValida('profiles')).toBe(false)
    expect(esMatchTablaValida('')).toBe(false)
    expect(esMatchTablaValida(undefined)).toBe(false)
    expect(esMatchTablaValida(123)).toBe(false)
  })
})

// ── validarCoherencia: tipo ↔ tabla ───────────────────────────────────────────
describe('validarCoherencia', () => {
  it('abono solo concilia con cotizaciones', () => {
    expect(validarCoherencia('abono', 'cotizaciones')).toBeNull()
  })
  it('abono rechaza tablas de gasto', () => {
    expect(validarCoherencia('abono', 'rendicion_gastos')).toBeTruthy()
    expect(validarCoherencia('abono', 'rendicion_mensual_gastos')).toBeTruthy()
    expect(validarCoherencia('abono', 'gastos_fijos_cuotas')).toBeTruthy()
  })
  it('cargo concilia con las tres tablas de gasto/obligación', () => {
    expect(validarCoherencia('cargo', 'rendicion_gastos')).toBeNull()
    expect(validarCoherencia('cargo', 'rendicion_mensual_gastos')).toBeNull()
    expect(validarCoherencia('cargo', 'gastos_fijos_cuotas')).toBeNull()
  })
  it('cargo rechaza cotizaciones', () => {
    expect(validarCoherencia('cargo', 'cotizaciones')).toBeTruthy()
  })
})

// ── patchPago ─────────────────────────────────────────────────────────────────
describe('patchPago', () => {
  it('rendicion_gastos usa pagado + fecha_pago', () => {
    expect(patchPago('rendicion_gastos', '2026-06-01')).toEqual({
      pagado: true,
      fecha_pago: '2026-06-01',
    })
  })
  it('rendicion_mensual_gastos usa pagado + fecha_pago', () => {
    expect(patchPago('rendicion_mensual_gastos', '2026-06-01')).toEqual({
      pagado: true,
      fecha_pago: '2026-06-01',
    })
  })
  it('gastos_fijos_cuotas usa pagada (con a) + fecha_pago', () => {
    expect(patchPago('gastos_fijos_cuotas', '2026-06-01')).toEqual({
      pagada: true,
      fecha_pago: '2026-06-01',
    })
  })
  it('cotizaciones setea fecha_pago_recibido, sin tocar factura', () => {
    expect(patchPago('cotizaciones', '2026-06-01')).toEqual({
      fecha_pago_recibido: '2026-06-01',
    })
  })
})

// ── columnasPrevio ────────────────────────────────────────────────────────────
describe('columnasPrevio', () => {
  it('incluye las columnas de estado de pago por tabla', () => {
    expect(columnasPrevio('rendicion_gastos')).toContain('pagado')
    expect(columnasPrevio('gastos_fijos_cuotas')).toContain('pagada')
    expect(columnasPrevio('cotizaciones')).toContain('fecha_pago_recibido')
  })
})

// ── patchRestaurar (deshacer) ─────────────────────────────────────────────────
describe('patchRestaurar', () => {
  it('restaura el estado previo de un gasto de proyecto', () => {
    expect(patchRestaurar('rendicion_gastos', { pagado: false, fecha_pago: null })).toEqual({
      pagado: false,
      fecha_pago: null,
    })
  })
  it('restaura un previo no falso (gasto ya pagado antes)', () => {
    expect(
      patchRestaurar('rendicion_mensual_gastos', { pagado: true, fecha_pago: '2026-01-01' }),
    ).toEqual({ pagado: true, fecha_pago: '2026-01-01' })
  })
  it('restaura cuota de crédito (pagada)', () => {
    expect(patchRestaurar('gastos_fijos_cuotas', { pagada: false, fecha_pago: null })).toEqual({
      pagada: false,
      fecha_pago: null,
    })
  })
  it('restaura cotización (fecha_pago_recibido)', () => {
    expect(patchRestaurar('cotizaciones', { fecha_pago_recibido: null })).toEqual({
      fecha_pago_recibido: null,
    })
  })
  it('con previo null cae a valores por defecto seguros', () => {
    expect(patchRestaurar('rendicion_gastos', null)).toEqual({ pagado: false, fecha_pago: null })
    expect(patchRestaurar('cotizaciones', null)).toEqual({ fecha_pago_recibido: null })
  })
})
