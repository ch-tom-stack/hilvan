import { describe, it, expect } from 'vitest'
import {
  normalizarRut,
  parsearMontoCLP,
  esNombreEmpresa,
  parsearFacturaSII,
} from '@/lib/parse-factura'

// ── normalizarRut ─────────────────────────────────────────────────────────────
describe('normalizarRut', () => {
  it('agrega puntos a RUT sin formato', () => {
    expect(normalizarRut('76123456-7')).toBe('76.123.456-7')
  })

  it('re-normaliza RUT ya con puntos', () => {
    expect(normalizarRut('76.123.456-7')).toBe('76.123.456-7')
  })

  it('DV con k', () => {
    expect(normalizarRut('12345678-k')).toBe('12.345.678-k')
  })

  it('cuerpo corto (<7) → devuelve raw sin cambios', () => {
    expect(normalizarRut('1234-5')).toBe('1234-5')
  })
})

// ── parsearMontoCLP ───────────────────────────────────────────────────────────
describe('parsearMontoCLP', () => {
  it('con símbolo y puntos', () => {
    expect(parsearMontoCLP('$196.990')).toBe(196990)
  })

  it('solo puntos', () => {
    expect(parsearMontoCLP('196.990')).toBe(196990)
  })

  it('sin formato', () => {
    expect(parsearMontoCLP('196990')).toBe(196990)
  })

  it('monto 0 → null (rechaza <= 0)', () => {
    expect(parsearMontoCLP('0')).toBeNull()
  })

  it('texto no numérico → null', () => {
    expect(parsearMontoCLP('abc')).toBeNull()
  })

  it('DUDOSO: la coma se elimina, no se trata como decimal — "196,50" → 19650', () => {
    // replace(',', '') quita la coma sin punto decimal: "196,50" → "19650"
    expect(parsearMontoCLP('196,50')).toBe(19650)
  })
})

// ── esNombreEmpresa ───────────────────────────────────────────────────────────
describe('esNombreEmpresa', () => {
  it('nombre válido', () => {
    expect(esNombreEmpresa('COMERCIAL LOS ANDES LTDA')).toBe(true)
  })

  it('línea con dos puntos (label) → false', () => {
    expect(esNombreEmpresa('Giro: Servicios')).toBe(false)
  })

  it('línea muy corta → false', () => {
    expect(esNombreEmpresa('ABC')).toBe(false)
  })

  it('empieza con dígito → false', () => {
    expect(esNombreEmpresa('12345 Calle Falsa')).toBe(false)
  })

  it('parece fecha → false', () => {
    expect(esNombreEmpresa('FACTURA del 12-05-2026')).toBe(false)
  })

  it('encabezado FACTURA → false', () => {
    expect(esNombreEmpresa('FACTURA ELECTRONICA')).toBe(false)
  })

  it('línea demasiado larga (>80) → false', () => {
    expect(esNombreEmpresa('A'.repeat(81))).toBe(false)
  })
})

// ── parsearFacturaSII ─────────────────────────────────────────────────────────
describe('parsearFacturaSII', () => {
  it('Familia B: nombre arriba, RUT con prefijo, total inline concatenado', () => {
    const text = [
      'COMERCIALIZADORA COPEC S.A.',
      'Giro: Combustibles',
      'Casa Matriz: Santiago',
      'R.U.T.: 99.500.000-5',
      'FACTURA ELECTRONICA',
      'N° 12345',
      'Fecha: 12-05-2026',
      'Neto 40.843',
      'IVA 7.760',
      'Total48.603',
    ].join('\n')
    const r = parsearFacturaSII(text)
    expect(r.rut_emisor).toBe('99.500.000-5')
    expect(r.razon_social).toBe('COMERCIALIZADORA COPEC S.A.')
    expect(r.folio).toBe('12345')
    expect(r.fecha).toBe('12-05-2026')
    expect(r.monto).toBe(48603)
  })

  it('Familia A: RUT, folio, fecha y total (columna de líneas $, toma el último)', () => {
    // Receptor arriba, emisor real DESPUÉS del RUT (caso IIA/GDExpress); P3 lo resuelve.
    const text = [
      'SEÑOR(ES): CASA HIEDRA',
      'CONTADO',
      'PROVEEDORES IIA LTDA',
      'R.U.T.: 76.111.222-3',
      'N°: 9988',
      '01/06/2026',
      'Descuento',
      '$0',
      'Neto',
      '$165.538',
      'IVA',
      '$31.452',
      'Total',
      '$196.990',
    ].join('\n')
    const r = parsearFacturaSII(text)
    expect(r.rut_emisor).toBe('76.111.222-3')
    expect(r.folio).toBe('9988')
    expect(r.fecha).toBe('01/06/2026')
    expect(r.monto).toBe(196990)
    // razon_social: P2 toma la primera candidata antes del RUT (ver test DUDOSO).
    // "SEÑOR(ES): CASA HIEDRA" tiene ':' → descartada; "CONTADO" es la primera válida.
    expect(r.razon_social).toBe('CONTADO')
  })

  it('DUDOSO: "CONTADO" antes del RUT es tomado como razón social por P2', () => {
    // esNombreEmpresa('CONTADO') === true (6 chars, sin ':', no es encabezado conocido).
    // Si la condición de pago precede al nombre real del emisor y ambos están
    // antes del primer R.U.T.:, P2 toma la PRIMERA candidata → "CONTADO".
    // Comportamiento actual, no corregido.
    const text = [
      'CONTADO',
      'PROVEEDORES IIA LTDA',
      'R.U.T.: 76.111.222-3',
    ].join('\n')
    const r = parsearFacturaSII(text)
    expect(r.razon_social).toBe('CONTADO')
  })

  it('label explícito "Razón Social:" tiene prioridad', () => {
    const text = [
      'ENCABEZADO RANDOM',
      'Razón Social: MI EMPRESA SPA',
      'R.U.T.: 77.000.111-2',
    ].join('\n')
    const r = parsearFacturaSII(text)
    expect(r.razon_social).toBe('MI EMPRESA SPA')
  })

  it('texto sin datos reconocibles → todo null', () => {
    const r = parsearFacturaSII('linea sin nada util\notra linea')
    expect(r.rut_emisor).toBeNull()
    expect(r.folio).toBeNull()
    expect(r.fecha).toBeNull()
    expect(r.monto).toBeNull()
  })

  it('DUDOSO: total inline exige separador de miles — "Total 500" (sin punto) no matchea', () => {
    const text = ['EMPRESA CHICA LTDA', 'R.U.T.: 76.000.000-0', 'Total 500'].join('\n')
    const r = parsearFacturaSII(text)
    // El regex T2 requiere (?:\.\d{3})+ → montos < 1.000 sin punto quedan sin detectar
    expect(r.monto).toBeNull()
  })
})
