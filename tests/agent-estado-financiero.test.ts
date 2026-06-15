import { describe, it, expect } from 'vitest'
import {
  normalizarPeriodo,
  periodoActual,
  rangoPeriodo,
  fechaDentroDePeriodo,
  fechaTributariaGasto,
  agregarPorCategoria,
  etiquetaCategoria,
  construirAlertas,
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

describe('etiquetaCategoria', () => {
  it('unifica proyecto (tipo) y mensual (categoria) en una etiqueta canónica', () => {
    expect(etiquetaCategoria('honorarios')).toBe('Honorarios')
    expect(etiquetaCategoria('Honorarios')).toBe('Honorarios')
    expect(etiquetaCategoria('articulos_oficina')).toBe('Artículos de oficina')
    expect(etiquetaCategoria('Artículos de oficina')).toBe('Artículos de oficina')
    expect(etiquetaCategoria('insumos')).toBe('Insumos de rodaje')
    expect(etiquetaCategoria('Insumos de rodaje')).toBe('Insumos de rodaje')
    expect(etiquetaCategoria('alimentacion')).toBe('Alimentación')
    expect(etiquetaCategoria('Alimentación')).toBe('Alimentación')
  })
  it('vacío → Sin categoría; desconocido → capitaliza', () => {
    expect(etiquetaCategoria('')).toBe('Sin categoría')
    expect(etiquetaCategoria(null)).toBe('Sin categoría')
    expect(etiquetaCategoria('locacion')).toBe('Locacion')
  })
})

describe('construirAlertas', () => {
  const base = {
    porCobrar: [] as any[],
    cuotas: [] as any[],
    hoy: '2026-06-15',
    resultadoDevengado: 1_000_000,
    cajaAprox: 1_000_000,
  }

  it('mes sano → sin alertas', () => {
    expect(construirAlertas(base)).toEqual([])
  })

  it('cobro con aging ≥60 → alerta alta; 30–59 → media', () => {
    const r = construirAlertas({
      ...base,
      porCobrar: [
        { numero: 'CH-COT-007', cliente: 'Zona Cero', monto: 1_606_500, dias_aging: 75 },
        { numero: 'CH-COT-006', cliente: 'ULA', monto: 2_944_973, dias_aging: 40 },
        { numero: 'CH-COT-010', cliente: 'X', monto: 100_000, dias_aging: 10 },
      ],
    })
    const tipos = r.filter((a) => a.tipo === 'cobro_vencido')
    expect(tipos).toHaveLength(2)
    expect(tipos.find((a) => a.nivel === 'alta')?.monto).toBe(1_606_500)
    expect(tipos.find((a) => a.nivel === 'media')?.monto).toBe(2_944_973)
  })

  it('cuota impaga vencida → alta; por vencer → media', () => {
    const r = construirAlertas({
      ...base,
      cuotas: [
        { credito: 'Forum', monto: 254_000, fecha_vencimiento: '2026-06-05', pagada: false },
        { credito: 'BancoEstado', monto: 84_000, fecha_vencimiento: '2026-06-25', pagada: false },
        { credito: 'Pagada', monto: 50_000, fecha_vencimiento: '2026-06-01', pagada: true },
      ],
    })
    expect(r.find((a) => a.tipo === 'cuota_vencida')?.nivel).toBe('alta')
    expect(r.find((a) => a.tipo === 'cuota_vencida')?.monto).toBe(254_000)
    expect(r.find((a) => a.tipo === 'cuota_proxima')?.monto).toBe(84_000)
  })

  it('mes en rojo y caja negativa → dos alertas alta', () => {
    const r = construirAlertas({ ...base, resultadoDevengado: -500_000, cajaAprox: -200_000 })
    expect(r.find((a) => a.tipo === 'mes_en_rojo')?.nivel).toBe('alta')
    expect(r.find((a) => a.tipo === 'caja_negativa')?.nivel).toBe('alta')
    expect(r.find((a) => a.tipo === 'mes_en_rojo')?.mensaje).toContain('-$500.000')
  })

  it('ordena las alta antes que las media', () => {
    const r = construirAlertas({
      ...base,
      porCobrar: [{ numero: 'A', cliente: 'c', monto: 1, dias_aging: 35 }], // media
      resultadoDevengado: -1, // alta
    })
    expect(r[0].nivel).toBe('alta')
    expect(r[r.length - 1].nivel).toBe('media')
  })
})
