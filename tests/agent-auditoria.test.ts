/**
 * propuestas/04-compliance-anomalias/logica.test.ts
 *
 * Tests por regla del framework de compliance.
 * Correr: npx vitest run --config propuestas/vitest.config.ts 04-compliance-anomalias
 */

import { describe, it, expect } from 'vitest'
import {
  regla_sin_documento,
  regla_folio_faltante,
  regla_factura_sin_cobrar,
  regla_duplicados,
  regla_sin_contrato,
  regla_cotizacion_estancada,
  aplicarReglas,
  diasEntre,
  construirResultado,
  type GastoAudit,
  type CotizacionAudit,
  type ColaboradorAudit,
  type DatasetAuditoria,
} from '@/lib/agent-auditoria'

// ─── Fixtures helpers ─────────────────────────────────────────────────────────

function gasto(overrides: Partial<GastoAudit> = {}): GastoAudit {
  return {
    id: 'g-001',
    origen: 'proyecto',
    tipo_documento: 'boleta',
    folio: '1234',
    rut_emisor: '12.345.678-9',
    razon_social_emisor: 'Juan Pérez',
    monto: 100_000,
    fecha_documento: '2026-06-01',
    contexto: 'CH-COT-007',
    descripcion: 'Gasto de prueba',
    sin_documento_aceptado: false,
    folio_compartido: false,
    referencia_externa: null,
    ...overrides,
  }
}

function cotizacion(overrides: Partial<CotizacionAudit> = {}): CotizacionAudit {
  return {
    id: 'cot-001',
    numero: 'CH-COT-001',
    cliente: 'Cliente Acme',
    estado: 'aprobada',
    monto: 1_000_000,
    fecha_respuesta_cliente: '2026-05-01',
    fecha_factura_emitida: null,
    fecha_pago_recibido: null,
    tiene_rodaje: false,
    ...overrides,
  }
}

function colaborador(overrides: Partial<ColaboradorAudit> = {}): ColaboradorAudit {
  return {
    id: 'col-001',
    nombre: 'María García',
    contrato_marco: true,
    contratos: [],
    onboarding_completado: true,
    ...overrides,
  }
}

// ─── diasEntre ────────────────────────────────────────────────────────────────

describe('diasEntre', () => {
  it('calcula días correctamente', () => {
    expect(diasEntre('2026-06-01', '2026-06-16')).toBe(15)
  })

  it('devuelve 0 para el mismo día', () => {
    expect(diasEntre('2026-06-01', '2026-06-01')).toBe(0)
  })

  it('devuelve negativo si a > b', () => {
    expect(diasEntre('2026-06-16', '2026-06-01')).toBe(-15)
  })
})

// ─── REGLA 1: sin_documento ───────────────────────────────────────────────────

describe('regla_sin_documento', () => {
  it('detecta tipo_documento="sin_documento"', () => {
    const resultado = regla_sin_documento([gasto({ tipo_documento: 'sin_documento' })])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].regla).toBe('sin_documento')
    expect(resultado[0].severidad).toBe('alta')
    expect(resultado[0].referencia).toBe('g-001')
  })

  it('detecta tipo_documento=null', () => {
    const resultado = regla_sin_documento([gasto({ tipo_documento: null })])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].regla).toBe('sin_documento')
  })

  it('detecta tipo_documento="" (vacío)', () => {
    const resultado = regla_sin_documento([gasto({ tipo_documento: '' })])
    expect(resultado).toHaveLength(1)
  })

  it('NO detecta gastos con documento válido', () => {
    const resultado = regla_sin_documento([
      gasto({ tipo_documento: 'boleta' }),
      gasto({ id: 'g-002', tipo_documento: 'factura' }),
    ])
    expect(resultado).toHaveLength(0)
  })

  it('incluye monto en el hallazgo', () => {
    const resultado = regla_sin_documento([gasto({ tipo_documento: null, monto: 55_000 })])
    expect(resultado[0].monto).toBe(55_000)
  })

  it('devuelve lista vacía si no hay gastos', () => {
    expect(regla_sin_documento([])).toHaveLength(0)
  })

  it('#1: sin_documento_aceptado=true → severidad info, no alta', () => {
    const resultado = regla_sin_documento([
      gasto({ tipo_documento: 'sin_documento', sin_documento_aceptado: true }),
    ])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].severidad).toBe('info')
    expect(resultado[0].descripcion).toMatch(/aceptado a propósito/)
  })
})

// ─── REGLA 2: folio_faltante ──────────────────────────────────────────────────

describe('regla_folio_faltante', () => {
  it('detecta boleta sin folio', () => {
    const resultado = regla_folio_faltante([gasto({ tipo_documento: 'boleta', folio: null })])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].regla).toBe('folio_faltante')
    expect(resultado[0].severidad).toBe('media')
  })

  it('detecta factura con folio vacío', () => {
    const resultado = regla_folio_faltante([gasto({ tipo_documento: 'factura', folio: '' })])
    expect(resultado).toHaveLength(1)
  })

  it('detecta boleta_consumo y exenta sin folio', () => {
    const resultado = regla_folio_faltante([
      gasto({ id: 'g-1', tipo_documento: 'boleta_consumo', folio: null }),
      gasto({ id: 'g-2', tipo_documento: 'exenta', folio: null }),
    ])
    expect(resultado).toHaveLength(2)
  })

  it('#4: exenta sin folio pero con referencia_externa → NO se marca (resuelto)', () => {
    const resultado = regla_folio_faltante([
      gasto({ tipo_documento: 'exenta', folio: null, referencia_externa: 'INV-2026-0042' }),
    ])
    expect(resultado).toHaveLength(0)
  })

  it('NO alerta sin_documento (no tiene folio por definición)', () => {
    const resultado = regla_folio_faltante([
      gasto({ tipo_documento: 'sin_documento', folio: null }),
    ])
    expect(resultado).toHaveLength(0)
  })

  it('NO alerta nota_credito sin folio (no está en lista de tipos_con_folio)', () => {
    const resultado = regla_folio_faltante([
      gasto({ tipo_documento: 'nota_credito', folio: null }),
    ])
    expect(resultado).toHaveLength(0)
  })

  it('NO alerta boleta con folio presente', () => {
    const resultado = regla_folio_faltante([gasto({ tipo_documento: 'boleta', folio: '9999' })])
    expect(resultado).toHaveLength(0)
  })
})

// ─── REGLA 3: factura_sin_cobrar (aging) ─────────────────────────────────────

describe('regla_factura_sin_cobrar', () => {
  const HOY = '2026-06-16'

  it('detecta factura con más de aging_dias sin cobrar (severidad media)', () => {
    // 45 días atrás, umbral=30 → media (45 < 60)
    const resultado = regla_factura_sin_cobrar({
      cotizaciones: [cotizacion({ fecha_factura_emitida: '2026-05-02', estado: 'aprobada' })],
      aging_dias: 30,
      hoy: HOY,
    })
    expect(resultado).toHaveLength(1)
    expect(resultado[0].regla).toBe('factura_sin_cobrar')
    expect(resultado[0].severidad).toBe('media')
    expect(resultado[0].meta?.dias_aging).toBeGreaterThanOrEqual(30)
  })

  it('detecta aging ALTA cuando supera 2× umbral', () => {
    // 70 días atrás, umbral=30 → alta (70 >= 60)
    const resultado = regla_factura_sin_cobrar({
      cotizaciones: [cotizacion({ fecha_factura_emitida: '2026-04-07', estado: 'aprobada' })],
      aging_dias: 30,
      hoy: HOY,
    })
    expect(resultado).toHaveLength(1)
    expect(resultado[0].severidad).toBe('alta')
  })

  it('NO detecta factura reciente (dentro del umbral)', () => {
    // 5 días atrás, umbral=30 → sin hallazgo
    const resultado = regla_factura_sin_cobrar({
      cotizaciones: [cotizacion({ fecha_factura_emitida: '2026-06-11', estado: 'aprobada' })],
      aging_dias: 30,
      hoy: HOY,
    })
    expect(resultado).toHaveLength(0)
  })

  it('NO detecta cotización sin factura emitida', () => {
    const resultado = regla_factura_sin_cobrar({
      cotizaciones: [cotizacion({ fecha_factura_emitida: null })],
      aging_dias: 30,
      hoy: HOY,
    })
    expect(resultado).toHaveLength(0)
  })

  it('NO detecta cotización ya cobrada (fecha_pago_recibido seteada)', () => {
    const resultado = regla_factura_sin_cobrar({
      cotizaciones: [
        cotizacion({ fecha_factura_emitida: '2026-04-01', fecha_pago_recibido: '2026-05-01' }),
      ],
      aging_dias: 30,
      hoy: HOY,
    })
    expect(resultado).toHaveLength(0)
  })
})

// ─── REGLA 4: duplicados ──────────────────────────────────────────────────────

describe('regla_duplicados', () => {
  it('detecta duplicado exacto RUT+folio (alta)', () => {
    const resultado = regla_duplicados({
      gastos: [
        gasto({ id: 'g-1', rut_emisor: '12.345.678-9', folio: '500', monto: 50_000 }),
        gasto({ id: 'g-2', rut_emisor: '12.345.678-9', folio: '500', monto: 50_000 }),
      ],
    })
    const exactos = resultado.filter((h) => h.regla === 'duplicado_exacto')
    expect(exactos).toHaveLength(1)
    expect(exactos[0].severidad).toBe('alta')
    expect(exactos[0].referencia).toContain('g-1')
    expect(exactos[0].referencia).toContain('g-2')
  })

  it('#2: mismo RUT+folio con folio_compartido=true → factura compartida (info), no duplicado', () => {
    const resultado = regla_duplicados({
      gastos: [
        gasto({ id: 'g-1', rut_emisor: '77.994.916-8', folio: '100', monto: 178_500, folio_compartido: true }),
        gasto({ id: 'g-2', rut_emisor: '77.994.916-8', folio: '100', monto: 261_800, folio_compartido: true }),
      ],
    })
    expect(resultado.filter((h) => h.regla === 'duplicado_exacto')).toHaveLength(0)
    const compartida = resultado.filter((h) => h.regla === 'factura_compartida')
    expect(compartida).toHaveLength(1)
    expect(compartida[0].severidad).toBe('info')
    expect(compartida[0].monto).toBe(440_300) // suma del grupo
  })

  it('#2: si solo UNO del par tiene folio_compartido, sigue siendo duplicado', () => {
    const resultado = regla_duplicados({
      gastos: [
        gasto({ id: 'g-1', rut_emisor: '12.345.678-9', folio: '100', folio_compartido: true }),
        gasto({ id: 'g-2', rut_emisor: '12.345.678-9', folio: '100', folio_compartido: false }),
      ],
    })
    expect(resultado.filter((h) => h.regla === 'duplicado_exacto')).toHaveLength(1)
  })

  it('NO confunde folios distintos del mismo RUT', () => {
    const resultado = regla_duplicados({
      gastos: [
        gasto({ id: 'g-1', rut_emisor: '12.345.678-9', folio: '500' }),
        gasto({ id: 'g-2', rut_emisor: '12.345.678-9', folio: '501' }),
      ],
    })
    const exactos = resultado.filter((h) => h.regla === 'duplicado_exacto')
    expect(exactos).toHaveLength(0)
  })

  it('detecta duplicado sospechoso RUT+monto en ventana (media)', () => {
    const resultado = regla_duplicados({
      gastos: [
        gasto({ id: 'g-1', rut_emisor: '99.888.777-6', folio: null, monto: 80_000, fecha_documento: '2026-06-01' }),
        gasto({ id: 'g-2', rut_emisor: '99.888.777-6', folio: null, monto: 80_000, fecha_documento: '2026-06-03' }),
      ],
      ventana_dias: 7,
    })
    const sospechosos = resultado.filter((h) => h.regla === 'duplicado_sospechoso')
    expect(sospechosos).toHaveLength(1)
    expect(sospechosos[0].severidad).toBe('media')
  })

  it('NO detecta sospechoso si montos distintos', () => {
    const resultado = regla_duplicados({
      gastos: [
        gasto({ id: 'g-1', rut_emisor: '99.888.777-6', folio: null, monto: 80_000, fecha_documento: '2026-06-01' }),
        gasto({ id: 'g-2', rut_emisor: '99.888.777-6', folio: null, monto: 90_000, fecha_documento: '2026-06-02' }),
      ],
    })
    const sospechosos = resultado.filter((h) => h.regla === 'duplicado_sospechoso')
    expect(sospechosos).toHaveLength(0)
  })

  it('NO detecta sospechoso fuera de la ventana', () => {
    const resultado = regla_duplicados({
      gastos: [
        gasto({ id: 'g-1', rut_emisor: '99.888.777-6', folio: null, monto: 80_000, fecha_documento: '2026-06-01' }),
        gasto({ id: 'g-2', rut_emisor: '99.888.777-6', folio: null, monto: 80_000, fecha_documento: '2026-06-20' }),
      ],
      ventana_dias: 7,
    })
    const sospechosos = resultado.filter((h) => h.regla === 'duplicado_sospechoso')
    expect(sospechosos).toHaveLength(0)
  })

  it('devuelve lista vacía con 0 o 1 gastos', () => {
    expect(regla_duplicados({ gastos: [] })).toHaveLength(0)
    expect(regla_duplicados({ gastos: [gasto()] })).toHaveLength(0)
  })
})

// ─── REGLA 5: sin_contrato_firmado ───────────────────────────────────────────

describe('regla_sin_contrato', () => {
  it('detecta colaborador con contrato_marco=true sin contratos generados (alta)', () => {
    const resultado = regla_sin_contrato([
      colaborador({ contrato_marco: true, contratos: [] }),
    ])
    const sinContrato = resultado.filter((h) => h.regla === 'sin_contrato_firmado')
    expect(sinContrato).toHaveLength(1)
    expect(sinContrato[0].severidad).toBe('alta')
  })

  it('detecta colaborador con contrato generado pero no firmado (alta)', () => {
    const resultado = regla_sin_contrato([
      colaborador({
        contrato_marco: true,
        contratos: [{ id: 'k-1', tipo: 'marco_equipo', firmado: false, created_at: '2026-01-01' }],
      }),
    ])
    const sinFirma = resultado.filter((h) => h.regla === 'sin_contrato_firmado')
    expect(sinFirma).toHaveLength(1)
    expect(sinFirma[0].descripcion).toMatch(/generado pero SIN firmar/)
  })

  it('NO alerta si el contrato está firmado', () => {
    const resultado = regla_sin_contrato([
      colaborador({
        contrato_marco: true,
        contratos: [{ id: 'k-1', tipo: 'marco_equipo', firmado: true, created_at: '2026-01-01' }],
        onboarding_completado: true,
      }),
    ])
    expect(resultado).toHaveLength(0)
  })

  it('NO alerta si contrato_marco=false (no lo requiere)', () => {
    const resultado = regla_sin_contrato([
      colaborador({ contrato_marco: false, contratos: [] }),
    ])
    expect(resultado).toHaveLength(0)
  })

  it('detecta onboarding incompleto (media)', () => {
    const resultado = regla_sin_contrato([
      colaborador({
        contrato_marco: true,
        contratos: [{ id: 'k-1', tipo: 'marco_equipo', firmado: true, created_at: '2026-01-01' }],
        onboarding_completado: false,
      }),
    ])
    const incompletos = resultado.filter((h) => h.regla === 'onboarding_incompleto')
    expect(incompletos).toHaveLength(1)
    expect(incompletos[0].severidad).toBe('media')
  })

  it('puede producir AMBAS alertas si falta firma Y onboarding', () => {
    const resultado = regla_sin_contrato([
      colaborador({ contrato_marco: true, contratos: [], onboarding_completado: false }),
    ])
    const reglas = resultado.map((h) => h.regla)
    expect(reglas).toContain('sin_contrato_firmado')
    expect(reglas).toContain('onboarding_incompleto')
    expect(resultado).toHaveLength(2)
  })
})

// ─── REGLA 6: cotizacion_estancada ───────────────────────────────────────────

describe('regla_cotizacion_estancada', () => {
  const HOY = '2026-06-16'

  it('detecta cotización aprobada sin facturar pasado el umbral (media)', () => {
    // Aprobada hace 40 días, umbral=30 → media
    const resultado = regla_cotizacion_estancada({
      cotizaciones: [cotizacion({ fecha_respuesta_cliente: '2026-05-07', fecha_factura_emitida: null })],
      dias_sin_factura: 30,
      dias_sin_rodaje: 14,
      hoy: HOY,
    })
    const estancadas = resultado.filter((h) => h.regla === 'cotizacion_sin_facturar')
    expect(estancadas).toHaveLength(1)
    expect(estancadas[0].severidad).toBe('media')
  })

  it('detecta cotización sin rodaje pasado el umbral (info)', () => {
    // Aprobada hace 20 días, umbral rodaje=14 → info
    const resultado = regla_cotizacion_estancada({
      cotizaciones: [
        cotizacion({
          fecha_respuesta_cliente: '2026-05-27',
          fecha_factura_emitida: null,
          tiene_rodaje: false,
        }),
      ],
      dias_sin_factura: 30,
      dias_sin_rodaje: 14,
      hoy: HOY,
    })
    const sinRodaje = resultado.filter((h) => h.regla === 'cotizacion_sin_rodaje')
    expect(sinRodaje).toHaveLength(1)
    expect(sinRodaje[0].severidad).toBe('info')
  })

  it('NO detecta cotización reciente (dentro de los dos umbrales)', () => {
    const resultado = regla_cotizacion_estancada({
      cotizaciones: [cotizacion({ fecha_respuesta_cliente: '2026-06-10', tiene_rodaje: false })],
      dias_sin_factura: 30,
      dias_sin_rodaje: 14,
      hoy: HOY,
    })
    expect(resultado).toHaveLength(0)
  })

  it('NO detecta cotización no aprobada', () => {
    const resultado = regla_cotizacion_estancada({
      cotizaciones: [cotizacion({ estado: 'borrador', fecha_respuesta_cliente: '2026-01-01' })],
      dias_sin_factura: 30,
      dias_sin_rodaje: 14,
      hoy: HOY,
    })
    expect(resultado).toHaveLength(0)
  })

  it('NO detecta sin factura si ya fue facturada', () => {
    const resultado = regla_cotizacion_estancada({
      cotizaciones: [
        cotizacion({
          fecha_respuesta_cliente: '2026-04-01',
          fecha_factura_emitida: '2026-04-15',
          tiene_rodaje: true,
        }),
      ],
      dias_sin_factura: 30,
      dias_sin_rodaje: 14,
      hoy: HOY,
    })
    const sinFacturar = resultado.filter((h) => h.regla === 'cotizacion_sin_facturar')
    expect(sinFacturar).toHaveLength(0)
  })

  it('NO detecta cotización sin fecha de aprobación', () => {
    const resultado = regla_cotizacion_estancada({
      cotizaciones: [cotizacion({ fecha_respuesta_cliente: null })],
      dias_sin_factura: 30,
      dias_sin_rodaje: 14,
      hoy: HOY,
    })
    expect(resultado).toHaveLength(0)
  })
})

// ─── aplicarReglas (orquestador) ──────────────────────────────────────────────

describe('aplicarReglas', () => {
  const HOY = '2026-06-16'

  function makeDataset(overrides: Partial<DatasetAuditoria> = {}): DatasetAuditoria {
    return {
      gastos: [],
      cotizaciones: [],
      colaboradores: [],
      config: {
        aging_dias: 30,
        dias_sin_factura: 30,
        dias_sin_rodaje: 14,
        ventana_duplicados_dias: 7,
        hoy: HOY,
      },
      ...overrides,
    }
  }

  it('devuelve resultado vacío con dataset limpio', () => {
    const resultado = aplicarReglas(makeDataset())
    expect(resultado.total).toBe(0)
    expect(resultado.alta).toHaveLength(0)
    expect(resultado.media).toHaveLength(0)
    expect(resultado.info).toHaveLength(0)
  })

  it('agrupa correctamente por severidad', () => {
    const resultado = aplicarReglas(
      makeDataset({
        gastos: [
          gasto({ id: 'g-sin-doc', tipo_documento: 'sin_documento' }), // alta
          gasto({ id: 'g-sin-folio', tipo_documento: 'boleta', folio: null }), // media
        ],
      }),
    )
    expect(resultado.alta.some((h) => h.regla === 'sin_documento')).toBe(true)
    expect(resultado.media.some((h) => h.regla === 'folio_faltante')).toBe(true)
    expect(resultado.total).toBe(2)
  })

  it('acumula hallazgos de todas las reglas', () => {
    const resultado = aplicarReglas(
      makeDataset({
        gastos: [gasto({ tipo_documento: 'sin_documento' })], // sin_documento → alta
        cotizaciones: [
          cotizacion({
            id: 'cot-A',
            fecha_factura_emitida: '2026-03-01', // 107 días → aging alta
            estado: 'aprobada',
          }),
        ],
        colaboradores: [
          colaborador({ contrato_marco: true, contratos: [], onboarding_completado: false }),
        ],
      }),
    )
    // sin_documento (alta) + factura_sin_cobrar (alta, 107 días > 60) + sin_contrato_firmado (alta) + onboarding_incompleto (media)
    expect(resultado.alta.length).toBeGreaterThanOrEqual(3)
    expect(resultado.media.length).toBeGreaterThanOrEqual(1)
    expect(resultado.total).toBeGreaterThanOrEqual(4)
  })

  it('incluye calculado_en en formato ISO', () => {
    const resultado = aplicarReglas(makeDataset())
    expect(resultado.calculado_en).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// ─── construirResultado ───────────────────────────────────────────────────────

describe('construirResultado', () => {
  it('separa hallazgos por severidad correctamente', () => {
    const hallazgos = [
      { regla: 'r1', severidad: 'alta' as const, descripcion: 'A', referencia: 'x' },
      { regla: 'r2', severidad: 'media' as const, descripcion: 'B', referencia: 'y' },
      { regla: 'r3', severidad: 'info' as const, descripcion: 'C', referencia: 'z' },
    ]
    const r = construirResultado(hallazgos)
    expect(r.alta).toHaveLength(1)
    expect(r.media).toHaveLength(1)
    expect(r.info).toHaveLength(1)
    expect(r.total).toBe(3)
  })
})
