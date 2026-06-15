import { describe, it, expect } from 'vitest'
import {
  esMatchTablaValida,
  validarCoherencia,
  patchPago,
  columnasPrevio,
  patchRestaurar,
  tipoFlujoDesdeMovimiento,
  normalizarAsignaciones,
  montoVarioRestante,
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

// ── normalizarAsignaciones (conciliación N:M) ─────────────────────────────────
describe('normalizarAsignaciones', () => {
  it('rechaza un array vacío o no-array', () => {
    expect(normalizarAsignaciones([], 1000).ok).toBe(false)
    expect(normalizarAsignaciones(null, 1000).ok).toBe(false)
    expect(normalizarAsignaciones('x', 1000).ok).toBe(false)
  })

  it('caso 1:1: una sola asignación sin monto toma el monto completo del movimiento', () => {
    const r = normalizarAsignaciones(
      [{ match_tabla: 'rendicion_gastos', match_id: 'g1' }],
      178500,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.asignaciones).toEqual([{ match_tabla: 'rendicion_gastos', match_id: 'g1', monto: 178500 }])
  })

  it('transferencia combinada (Arias): reparte $440.300 en dos gastos exactos', () => {
    const r = normalizarAsignaciones(
      [
        { match_tabla: 'rendicion_gastos', match_id: 'cot007', monto: 261800 },
        { match_tabla: 'rendicion_gastos', match_id: 'cot001', monto: 178500 },
      ],
      440300,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.asignaciones.reduce((s, a) => s + a.monto, 0)).toBe(440300)
  })

  it('exige monto cuando hay más de una asignación', () => {
    const r = normalizarAsignaciones(
      [
        { match_tabla: 'rendicion_gastos', match_id: 'a' },
        { match_tabla: 'rendicion_gastos', match_id: 'b' },
      ],
      1000,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/monto requerido/)
  })

  it('rechaza si la suma excede el monto del movimiento', () => {
    const r = normalizarAsignaciones(
      [
        { match_tabla: 'rendicion_gastos', match_id: 'a', monto: 600 },
        { match_tabla: 'rendicion_gastos', match_id: 'b', monto: 600 },
      ],
      1000,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/excede/)
  })

  it('permite suma MENOR al monto (movimiento parcialmente asignado)', () => {
    const r = normalizarAsignaciones(
      [{ match_tabla: 'rendicion_gastos', match_id: 'a', monto: 300 }],
      1000,
    )
    expect(r.ok).toBe(true)
  })

  it('pago parcial: una asignación a una obligación por menos de su total', () => {
    // El movimiento es de $30.000 y se asigna entero a la boleta (que vale más).
    const r = normalizarAsignaciones(
      [{ match_tabla: 'rendicion_mensual_gastos', match_id: 'boleta585' }],
      30000,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.asignaciones[0].monto).toBe(30000)
  })

  it('acepta monto como string numérico y lo redondea a entero', () => {
    const r = normalizarAsignaciones(
      [{ match_tabla: 'cotizaciones', match_id: 'c', monto: '1234.6' }],
      2000,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.asignaciones[0].monto).toBe(1235)
  })

  it('rechaza match_tabla inválida y match_id faltante', () => {
    expect(normalizarAsignaciones([{ match_tabla: 'profiles', match_id: 'x' }], 100).ok).toBe(false)
    expect(normalizarAsignaciones([{ match_tabla: 'cotizaciones' }], 100).ok).toBe(false)
  })

  it('rechaza monto no positivo o no finito', () => {
    expect(normalizarAsignaciones([{ match_tabla: 'cotizaciones', match_id: 'c', monto: 0 }], 100).ok).toBe(false)
    expect(normalizarAsignaciones([{ match_tabla: 'cotizaciones', match_id: 'c', monto: -5 }], 100).ok).toBe(false)
    expect(normalizarAsignaciones([{ match_tabla: 'cotizaciones', match_id: 'c', monto: 'NaN' }], 100).ok).toBe(false)
  })
})

// ── montoVarioRestante (conciliar-vario sobre movimiento mixto) ───────────────
describe('montoVarioRestante', () => {
  it('sin asignaciones previas → monto completo (comportamiento clásico)', () => {
    expect(montoVarioRestante(2754843, 0)).toBe(2754843)
  })
  it('transferencia mixta contador: resta los honorarios ya conciliados', () => {
    // $2.754.843 transferidos; $140.000 conciliados como honorarios → resto impuestos.
    expect(montoVarioRestante(2754843, 140000)).toBe(2614843)
  })
  it('completamente asignado → 0 (el route lo rechaza con 400)', () => {
    expect(montoVarioRestante(440300, 440300)).toBe(0)
  })
  it('sobre-asignado → negativo (el route lo rechaza con 400)', () => {
    expect(montoVarioRestante(100, 150)).toBe(-50)
  })
})

// ── tipoFlujoDesdeMovimiento (conciliar-vario) ────────────────────────────────
describe('tipoFlujoDesdeMovimiento', () => {
  it('abono (entrada de dinero) → entrada', () => {
    expect(tipoFlujoDesdeMovimiento('abono')).toBe('entrada')
  })
  it('cargo (salida de dinero) → salida', () => {
    expect(tipoFlujoDesdeMovimiento('cargo')).toBe('salida')
  })
})
