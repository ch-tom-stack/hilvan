// propuestas/02-rentabilidad-proyecto/logica.test.ts
//
// Tests unitarios de la lógica PURA de rentabilidad.
// Correr con: npx vitest run --config propuestas/vitest.config.ts 02-rentabilidad-proyecto

import { describe, it, expect } from 'vitest'
import {
  calcularRentabilidad,
  calcularResumen,
  etiquetaCategoria,
  UMBRAL_RENTABLE,
  type InputRentabilidad,
  type GastoProyecto,
  type CostoAdicional,
} from '@/lib/agent-rentabilidad'

// ─── Helpers de test ─────────────────────────────────────────────────────────

function gasto(overrides: Partial<GastoProyecto> & { monto: number }): GastoProyecto {
  return {
    id: crypto.randomUUID(),
    tipo: 'honorarios',
    tipo_documento: 'boleta',
    razon_social_emisor: 'Proveedor Test',
    descripcion: 'Gasto de prueba',
    fecha_documento: '2026-05-01',
    created_at: '2026-05-01T10:00:00Z',
    ...overrides,
  }
}

function input(overrides: Partial<InputRentabilidad> = {}): InputRentabilidad {
  return {
    numero: 'CH-COT-005',
    cotizacion_id: 'uuid-cot-005',
    nombre_proyecto: 'Campaña Test',
    cliente: 'Cliente Ejemplo',
    estado_cotizacion: 'aprobada',
    ingreso_cotizado: 1_000_000,
    facturacion: {
      fecha_factura_emitida: '2026-05-10',
      fecha_pago_recibido: null,
      numero_factura: '1234',
    },
    gastos: [],
    costos_adicionales: [],
    ...overrides,
  }
}

// ─── Tests: margen positivo ───────────────────────────────────────────────────

describe('margen positivo — proyecto rentable', () => {
  it('calcula margen correcto con gastos menores al ingreso', () => {
    const res = calcularRentabilidad(
      input({
        ingreso_cotizado: 1_000_000,
        gastos: [gasto({ monto: 500_000 }), gasto({ monto: 200_000 })],
      }),
    )

    expect(res.ingreso_cotizado).toBe(1_000_000)
    expect(res.costo_rendiciones).toBe(700_000)
    expect(res.costo_total).toBe(700_000)
    expect(res.margen).toBe(300_000)
    expect(res.margen_pct).toBe(30)
    expect(res.clasificacion).toBe('rentable')
    expect(res.en_perdida).toBe(false)
  })

  it('margen_pct exactamente igual al umbral → rentable', () => {
    const ingreso = 1_000_000
    const costo = ingreso * (1 - UMBRAL_RENTABLE / 100)
    const res = calcularRentabilidad(input({ ingreso_cotizado: ingreso, gastos: [gasto({ monto: costo })] }))
    expect(res.margen_pct).toBe(UMBRAL_RENTABLE)
    expect(res.clasificacion).toBe('rentable')
  })

  it('margen_pct justo por debajo del umbral → ajustado', () => {
    const ingreso = 1_000_000
    // 19% de margen = costo del 81%
    const res = calcularRentabilidad(
      input({ ingreso_cotizado: ingreso, gastos: [gasto({ monto: 810_000 })] }),
    )
    expect(res.margen_pct).toBeLessThan(UMBRAL_RENTABLE)
    expect(res.clasificacion).toBe('ajustado')
  })
})

// ─── Tests: margen negativo ───────────────────────────────────────────────────

describe('margen negativo — proyecto en pérdida', () => {
  it('detecta pérdida cuando costos > ingreso', () => {
    const res = calcularRentabilidad(
      input({
        ingreso_cotizado: 1_000_000,
        gastos: [gasto({ monto: 1_200_000 })],
      }),
    )

    expect(res.margen).toBe(-200_000)
    expect(res.en_perdida).toBe(true)
    expect(res.clasificacion).toBe('perdida')
    expect(res.margen_pct).toBeLessThan(0)
  })

  it('el formato de margen negativo incluye guión', () => {
    const res = calcularRentabilidad(
      input({
        ingreso_cotizado: 500_000,
        gastos: [gasto({ monto: 600_000 })],
      }),
    )
    expect(res.margen_fmt).toMatch(/^-\$/)
  })
})

// ─── Tests: porcentaje de margen ──────────────────────────────────────────────

describe('cálculo de margen_pct', () => {
  it('margen_pct = margen / ingreso * 100', () => {
    const res = calcularRentabilidad(
      input({
        ingreso_cotizado: 2_000_000,
        gastos: [gasto({ monto: 1_400_000 })],
      }),
    )
    // margen = 600.000, pct = 30%
    expect(res.margen_pct).toBe(30)
  })

  it('ingreso = 0 → margen_pct es NaN (no dividir por cero)', () => {
    const res = calcularRentabilidad(input({ ingreso_cotizado: 0, gastos: [] }))
    expect(Number.isNaN(res.margen_pct)).toBe(true)
    expect(res.margen_pct_fmt).toBe('N/A')
  })

  it('proyecto sin gastos y con ingreso → clasificación ajustado (margen_pct=100 ≥ umbral)', () => {
    const res = calcularRentabilidad(input({ ingreso_cotizado: 1_000_000, gastos: [] }))
    expect(res.margen).toBe(1_000_000)
    expect(res.clasificacion).toBe('rentable')
    // pero debe marcar advertencia de datos incompletos
    expect(res.advertencia_datos_incompletos).toBe(true)
  })
})

// ─── Tests: desglose por categoría ───────────────────────────────────────────

describe('desglose por categoría de gasto', () => {
  it('agrupa gastos por tipo y suma los montos', () => {
    const res = calcularRentabilidad(
      input({
        gastos: [
          gasto({ monto: 100_000, tipo: 'honorarios' }),
          gasto({ monto: 50_000, tipo: 'honorarios' }),
          gasto({ monto: 80_000, tipo: 'transporte' }),
        ],
      }),
    )

    const honorarios = res.desglose_rendiciones.find((d) => d.categoria === 'Honorarios')
    const transporte = res.desglose_rendiciones.find((d) => d.categoria === 'Transporte')

    expect(honorarios?.monto).toBe(150_000)
    expect(honorarios?.count).toBe(2)
    expect(transporte?.monto).toBe(80_000)
    expect(transporte?.count).toBe(1)
  })

  it('nota de crédito (monto negativo) resta en la categoría', () => {
    const res = calcularRentabilidad(
      input({
        gastos: [
          gasto({ monto: 200_000, tipo: 'servicios' }),
          gasto({ monto: -50_000, tipo: 'servicios' }), // NC
        ],
      }),
    )
    const servicios = res.desglose_rendiciones.find((d) => d.categoria === 'Servicios')
    expect(servicios?.monto).toBe(150_000)
    expect(res.costo_rendiciones).toBe(150_000)
  })

  it('tipo null agrupa bajo "Sin categoría"', () => {
    const res = calcularRentabilidad(
      input({ gastos: [gasto({ monto: 70_000, tipo: null })] }),
    )
    const sin = res.desglose_rendiciones.find((d) => d.categoria === 'Sin categoría')
    expect(sin?.monto).toBe(70_000)
  })
})

// ─── Tests: costos adicionales (extensibilidad) ───────────────────────────────

describe('costos adicionales (hook de extensibilidad)', () => {
  const adicionales: CostoAdicional[] = [
    { concepto: 'Crew fuera de nómina', monto: 300_000, categoria: 'Honorarios', nota: 'estimado' },
    { concepto: 'Arriendo equipo propio', monto: 100_000, categoria: 'Equipos' },
  ]

  it('suma los costos adicionales al costo_total', () => {
    const res = calcularRentabilidad(
      input({
        ingreso_cotizado: 1_000_000,
        gastos: [gasto({ monto: 200_000 })],
        costos_adicionales: adicionales,
      }),
    )
    // costo_rendiciones = 200.000
    // total_adicionales = 400.000
    // costo_total = 600.000
    // margen = 400.000
    expect(res.total_adicionales).toBe(400_000)
    expect(res.costo_total).toBe(600_000)
    expect(res.margen).toBe(400_000)
    expect(res.tiene_costos_estimados).toBe(true)
  })

  it('sin costos adicionales, total_adicionales = 0', () => {
    const res = calcularRentabilidad(input({ gastos: [gasto({ monto: 200_000 })] }))
    expect(res.total_adicionales).toBe(0)
    expect(res.tiene_costos_estimados).toBe(false)
  })

  it('costos adicionales pueden hacer pasar un proyecto rentable a pérdida', () => {
    const res = calcularRentabilidad(
      input({
        ingreso_cotizado: 500_000,
        gastos: [gasto({ monto: 400_000 })], // margen = 100.000 → ajustado sin adicionales
        costos_adicionales: [
          { concepto: 'Post-producción externa', monto: 200_000, categoria: 'Post-producción' },
        ],
      }),
    )
    // costo_total = 600.000 > ingreso = 500.000 → pérdida
    expect(res.clasificacion).toBe('perdida')
    expect(res.en_perdida).toBe(true)
  })
})

// ─── Tests: advertencia de datos incompletos ─────────────────────────────────

describe('advertencia de datos incompletos', () => {
  it('proyecto sin gastos y con ingreso → advertencia true', () => {
    const res = calcularRentabilidad(input({ ingreso_cotizado: 500_000, gastos: [] }))
    expect(res.advertencia_datos_incompletos).toBe(true)
    expect(res.advertencia_detalle).not.toBeNull()
  })

  it('proyecto con gastos → sin advertencia de incompletos', () => {
    const res = calcularRentabilidad(
      input({ ingreso_cotizado: 500_000, gastos: [gasto({ monto: 100_000 })] }),
    )
    expect(res.advertencia_datos_incompletos).toBe(false)
  })

  it('proyecto con costos adicionales indica datos estimados', () => {
    const res = calcularRentabilidad(
      input({
        gastos: [gasto({ monto: 100_000 })],
        costos_adicionales: [{ concepto: 'X', monto: 50_000, categoria: 'Otros' }],
      }),
    )
    expect(res.advertencia_datos_incompletos).toBe(false)
    expect(res.advertencia_detalle).toMatch(/estimados/)
  })
})

// ─── Tests: facturación ───────────────────────────────────────────────────────

describe('campos de facturación', () => {
  it('facturado=true cuando hay fecha_factura_emitida', () => {
    const res = calcularRentabilidad(
      input({
        facturacion: { fecha_factura_emitida: '2026-05-10', fecha_pago_recibido: null, numero_factura: '999' },
      }),
    )
    expect(res.facturado).toBe(true)
    expect(res.cobrado).toBe(false)
    expect(res.numero_factura).toBe('999')
  })

  it('cobrado=true cuando hay fecha_pago_recibido', () => {
    const res = calcularRentabilidad(
      input({
        facturacion: {
          fecha_factura_emitida: '2026-05-10',
          fecha_pago_recibido: '2026-05-20',
          numero_factura: null,
        },
      }),
    )
    expect(res.cobrado).toBe(true)
    expect(res.fecha_cobro).toBe('2026-05-20')
  })
})

// ─── Tests: calcularResumen ───────────────────────────────────────────────────

describe('calcularResumen (multi-proyecto)', () => {
  const proyectoRentable = calcularRentabilidad(
    input({ numero: 'CH-COT-001', ingreso_cotizado: 1_000_000, gastos: [gasto({ monto: 700_000 })] }),
  )
  const proyectoAjustado = calcularRentabilidad(
    input({ numero: 'CH-COT-002', ingreso_cotizado: 500_000, gastos: [gasto({ monto: 430_000 })] }),
  )
  const proyectoPerdida = calcularRentabilidad(
    input({ numero: 'CH-COT-003', ingreso_cotizado: 300_000, gastos: [gasto({ monto: 350_000 })] }),
  )

  const { proyectos, totales } = calcularResumen([
    proyectoRentable,
    proyectoAjustado,
    proyectoPerdida,
  ])

  it('totales globales son la suma de todos los proyectos', () => {
    expect(totales.ingreso_total).toBe(1_800_000)
    expect(totales.costo_total).toBe(1_480_000)
    expect(totales.margen_total).toBe(320_000)
  })

  it('conteo de clasificaciones correcto', () => {
    expect(totales.count_rentable).toBe(1)
    expect(totales.count_ajustado).toBe(1)
    expect(totales.count_perdida).toBe(1)
  })

  it('ordenado: pérdida primero, luego ajustado, luego rentable', () => {
    expect(proyectos[0].clasificacion).toBe('perdida')
    expect(proyectos[1].clasificacion).toBe('ajustado')
    expect(proyectos[2].clasificacion).toBe('rentable')
  })

  it('margen_pct_promedio es el margen_total / ingreso_total * 100', () => {
    const esperado = Math.round((320_000 / 1_800_000) * 1000) / 10
    expect(totales.margen_pct_promedio).toBe(esperado)
  })
})

// ─── Tests: etiquetaCategoria ─────────────────────────────────────────────────

describe('etiquetaCategoria', () => {
  it.each([
    ['honorarios', 'Honorarios'],
    ['Honorarios', 'Honorarios'],
    ['transporte', 'Transporte'],
    ['alimentacion', 'Alimentación'],
    ['post_produccion', 'Post-producción'],
    [null, 'Sin categoría'],
    ['', 'Sin categoría'],
    ['algo_nuevo', 'Algo_nuevo'], // sin mapa → capitaliza
  ])('etiquetaCategoria("%s") === "%s"', (raw, expected) => {
    expect(etiquetaCategoria(raw)).toBe(expected)
  })
})
