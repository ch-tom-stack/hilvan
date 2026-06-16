/**
 * logica.test.ts — Tests del pipeline de clasificación/dedup.
 * Corre con: npx vitest run --config propuestas/vitest.config.ts 03-correo-ingesta-digest
 */

import { describe, it, expect } from 'vitest'
import {
  construirClaveDedup,
  normalizarFecha,
  periodoDesFecha,
  sugerirCategoria,
  clasificarDocumento,
  clasificarLote,
  type DocumentoParsado,
} from '@/lib/agent-correo-ingesta'

// ── construirClaveDedup ───────────────────────────────────────────────────────

describe('construirClaveDedup', () => {
  it('genera clave normalizada RUT::folio', () => {
    const clave = construirClaveDedup('12.345.678-9', '1234')
    expect(clave).toBe('123456789::1234')
  })

  it('normaliza RUT con puntos y guión', () => {
    const clave1 = construirClaveDedup('12.345.678-9', '99')
    const clave2 = construirClaveDedup('12345678-9', '99')
    const clave3 = construirClaveDedup('123456789', '99')
    expect(clave1).toBe(clave2)
    expect(clave2).toBe(clave3)
  })

  it('devuelve null si falta el RUT', () => {
    expect(construirClaveDedup(null, '1234')).toBeNull()
    expect(construirClaveDedup('', '1234')).toBeNull()
  })

  it('devuelve null si falta el folio', () => {
    expect(construirClaveDedup('12.345.678-9', null)).toBeNull()
    expect(construirClaveDedup('12.345.678-9', '')).toBeNull()
  })

  it('devuelve null si ambos son null', () => {
    expect(construirClaveDedup(null, null)).toBeNull()
  })
})

// ── normalizarFecha ───────────────────────────────────────────────────────────

describe('normalizarFecha', () => {
  it('normaliza DD/MM/YYYY', () => {
    expect(normalizarFecha('15/06/2026')).toBe('2026-06-15')
  })

  it('normaliza D/M/YYYY (sin cero)', () => {
    expect(normalizarFecha('5/3/2026')).toBe('2026-03-05')
  })

  it('acepta DD-MM-YYYY con guión', () => {
    expect(normalizarFecha('15-06-2026')).toBe('2026-06-15')
  })

  it('pasa YYYY-MM-DD sin modificar', () => {
    expect(normalizarFecha('2026-06-15')).toBe('2026-06-15')
  })

  it('devuelve null para formato desconocido', () => {
    expect(normalizarFecha('junio 2026')).toBeNull()
    expect(normalizarFecha(null)).toBeNull()
    expect(normalizarFecha('')).toBeNull()
  })
})

// ── periodoDesFecha ───────────────────────────────────────────────────────────

describe('periodoDesFecha', () => {
  it('extrae YYYY-MM de YYYY-MM-DD', () => {
    expect(periodoDesFecha('2026-06-15')).toBe('2026-06')
  })

  it('devuelve null si la fecha es null', () => {
    expect(periodoDesFecha(null)).toBeNull()
  })
})

// ── sugerirCategoria ─────────────────────────────────────────────────────────

describe('sugerirCategoria', () => {
  it('sugiere Transporte para COPEC', () => {
    expect(sugerirCategoria('COPEC S.A.')).toBe('Transporte')
  })

  it('sugiere Suscripciones para Adobe', () => {
    expect(sugerirCategoria('Adobe Inc.')).toBe('Suscripciones')
  })

  it('devuelve null si no hay coincidencia', () => {
    expect(sugerirCategoria('DISTRIBUIDORA XYZ')).toBeNull()
  })

  it('devuelve null si razón social es null', () => {
    expect(sugerirCategoria(null)).toBeNull()
  })
})

// ── clasificarDocumento ───────────────────────────────────────────────────────

describe('clasificarDocumento — casos base', () => {
  const docBase: DocumentoParsado = {
    rut_emisor: '12.345.678-9',
    razon_social: 'PROVEEDOR ABC LTDA',
    folio: '1234',
    fecha: '15/06/2026',
    monto: 50000,
    tipo_doc: 'factura',
  }

  it('clasifica como nuevo cuando no existe en DB', () => {
    const resultado = clasificarDocumento({
      documento: docBase,
      clavesExistentes: new Set(),
    })
    expect(resultado.estado_dedup).toBe('nuevo')
    expect(resultado.clave_dedup).toBe('123456789::1234')
    expect(resultado.fecha_normalizada).toBe('2026-06-15')
    expect(resultado.periodo_sugerido).toBe('2026-06')
    expect(resultado.origen_propuesto).toBe('mensual')
  })

  it('clasifica como ya_existe cuando la clave está en DB', () => {
    const resultado = clasificarDocumento({
      documento: docBase,
      clavesExistentes: new Set(['123456789::1234']),
    })
    expect(resultado.estado_dedup).toBe('ya_existe')
  })

  it('clasifica como dudoso si falta el RUT', () => {
    const docSinRut: DocumentoParsado = { ...docBase, rut_emisor: null }
    const resultado = clasificarDocumento({
      documento: docSinRut,
      clavesExistentes: new Set(),
    })
    expect(resultado.estado_dedup).toBe('dudoso')
    expect(resultado.clave_dedup).toBeNull()
    expect(resultado.motivo_duda).toContain('RUT')
  })

  it('clasifica como dudoso si falta el folio', () => {
    const docSinFolio: DocumentoParsado = { ...docBase, folio: null }
    const resultado = clasificarDocumento({
      documento: docSinFolio,
      clavesExistentes: new Set(),
    })
    expect(resultado.estado_dedup).toBe('dudoso')
    expect(resultado.motivo_duda).toContain('folio')
  })

  it('clasifica como dudoso si el monto es cero', () => {
    const docSinMonto: DocumentoParsado = { ...docBase, monto: 0 }
    const resultado = clasificarDocumento({
      documento: docSinMonto,
      clavesExistentes: new Set(),
    })
    expect(resultado.estado_dedup).toBe('dudoso')
    expect(resultado.motivo_duda).toContain('monto')
  })

  it('propone origen proyecto_manual cuando tieneProyecto=true', () => {
    const resultado = clasificarDocumento({
      documento: docBase,
      clavesExistentes: new Set(),
      tieneProyecto: true,
    })
    expect(resultado.origen_propuesto).toBe('proyecto_manual')
  })
})

// ── DEDUP: cargar dos veces el mismo RUT+folio ───────────────────────────────

describe('dedup — mismo RUT+folio dos veces', () => {
  const doc: DocumentoParsado = {
    rut_emisor: '76.123.456-7',
    razon_social: 'EMPRESA TEST',
    folio: '9999',
    fecha: '01/06/2026',
    monto: 100000,
    tipo_doc: 'factura',
  }

  it('el primer documento es nuevo; el segundo es ya_existe (via clavesExistentes)', () => {
    // Simula que el primero ya está en DB y el segundo llega en el mismo batch.
    const claveDb = construirClaveDedup(doc.rut_emisor, doc.folio)!
    const clavesEnDB = new Set([claveDb])

    const resultado = clasificarDocumento({
      documento: doc,
      clavesExistentes: clavesEnDB,
    })
    expect(resultado.estado_dedup).toBe('ya_existe')
  })

  it('clasificarLote detecta duplicado dentro del mismo lote', () => {
    const lote = [doc, { ...doc }] // dos copias idénticas
    const resultados = clasificarLote(lote, new Set())
    expect(resultados[0].estado_dedup).toBe('nuevo')
    expect(resultados[1].estado_dedup).toBe('ya_existe')
  })
})

// ── clasificarLote ────────────────────────────────────────────────────────────

describe('clasificarLote', () => {
  it('procesa múltiples documentos respetando dedup incremental', () => {
    const docs: DocumentoParsado[] = [
      { rut_emisor: '11.111.111-1', razon_social: 'A', folio: '1', fecha: '01/06/2026', monto: 10000, tipo_doc: 'boleta' },
      { rut_emisor: '22.222.222-2', razon_social: 'B', folio: '2', fecha: '02/06/2026', monto: 20000, tipo_doc: 'factura' },
      { rut_emisor: '11.111.111-1', razon_social: 'A', folio: '1', fecha: '01/06/2026', monto: 10000, tipo_doc: 'boleta' }, // duplicado del primero
    ]

    const resultados = clasificarLote(docs, new Set())
    expect(resultados[0].estado_dedup).toBe('nuevo')
    expect(resultados[1].estado_dedup).toBe('nuevo')
    expect(resultados[2].estado_dedup).toBe('ya_existe')
  })

  it('doc con RUT en DB marca ya_existe', () => {
    const doc: DocumentoParsado = {
      rut_emisor: '33.333.333-3',
      razon_social: 'C',
      folio: '77',
      fecha: '15/06/2026',
      monto: 5000,
      tipo_doc: 'boleta_consumo',
    }
    const clave = construirClaveDedup(doc.rut_emisor, doc.folio)!
    const resultados = clasificarLote([doc], new Set([clave]))
    expect(resultados[0].estado_dedup).toBe('ya_existe')
  })

  it('doc sin folio siempre es dudoso aunque no esté en DB', () => {
    const doc: DocumentoParsado = {
      rut_emisor: '44.444.444-4',
      razon_social: 'D',
      folio: null,
      fecha: '10/06/2026',
      monto: 3000,
      tipo_doc: 'exenta',
    }
    const resultados = clasificarLote([doc], new Set())
    expect(resultados[0].estado_dedup).toBe('dudoso')
  })
})
