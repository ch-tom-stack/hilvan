import { describe, it, expect } from 'vitest'
import {
  estadoReferencias,
  leerCorreoReferencia,
  referenciasParaFactura,
  textoPendientes,
  validarReferencia,
  type Referencia,
} from '@/lib/cotizacion-referencias'

const ref = (r: Partial<Referencia>): Referencia => ({
  id: 'x', cotizacion_id: 'c', tipo: 'oc', folio: '1', fecha: '2026-09-10', monto: null, glosa: null,
  estado: 'confirmada', fuente: 'manual', correo_id: null, correo_remitente: null, correo_asunto: null,
  correo_fecha: null, nota: null, ...r,
})

describe('validarReferencia', () => {
  it('confirmada exige folio y fecha', () => {
    expect(validarReferencia({ tipo: 'hes', fecha: '2026-09-11' }, { confirmada: true })).toEqual({ ok: false, error: 'Falta el número (folio) de la referencia' })
    expect(validarReferencia({ tipo: 'oc', folio: '007060' }, { confirmada: true })).toEqual({ ok: false, error: 'Falta la fecha de la referencia' })
  })
  it('propuesta puede venir sin folio (HES de Falabella)', () => {
    expect(validarReferencia({ tipo: 'HES', fecha: '2026-09-11' }, { confirmada: false })).toEqual({
      ok: true, valor: { tipo: 'hes', folio: null, fecha: '2026-09-11', monto: null, glosa: null },
    })
  })
  it('respeta los límites del SII y rechaza fechas imposibles', () => {
    expect(validarReferencia({ tipo: 'oc', folio: '1234567890123456789', fecha: '2026-09-10' }, { confirmada: true }).ok).toBe(false)
    expect(validarReferencia({ tipo: 'oc', folio: '1', fecha: '2026-02-30' }, { confirmada: true }).ok).toBe(false)
    expect(validarReferencia({ tipo: 'factura', folio: '1', fecha: '2026-02-03' }, { confirmada: true }).ok).toBe(false)
  })
  it('monto con decimales se redondea, no se trunca', () => {
    const r = validarReferencia({ tipo: 'oc', folio: '1', fecha: '2026-09-10', monto: '3556770.6' }, { confirmada: true })
    expect(r.ok && r.valor.monto).toBe(3556771)
  })
})

describe('estadoReferencias', () => {
  it('confirmada gana a propuesta; sin nada: falta si se exige, no aplica si no', () => {
    expect(estadoReferencias([{ tipo: 'oc', estado: 'propuesta' }, { tipo: 'oc', estado: 'confirmada' }], { oc: true, hes: true }))
      .toEqual({ oc: 'confirmada', hes: 'falta' })
    expect(estadoReferencias([{ tipo: 'hes', estado: 'propuesta' }], { oc: false, hes: true }))
      .toEqual({ oc: 'no_aplica', hes: 'propuesta' })
  })
  it('una propuesta descartada no cuenta: la OC sigue faltando', () => {
    expect(estadoReferencias([{ tipo: 'oc', estado: 'descartada' }], { oc: true, hes: false }))
      .toEqual({ oc: 'falta', hes: 'no_aplica' })
  })
})

describe('referenciasParaFactura', () => {
  it('solo confirmadas, OC primero, máximo 3, y la glosa de la OC', () => {
    const r = referenciasParaFactura([
      ref({ tipo: 'hes', folio: '1003053261', fecha: '2026-09-11' }),
      ref({ tipo: 'oc', folio: '6001807651', fecha: '2026-09-10', glosa: 'ALDO - BOHO' }),
      ref({ tipo: 'hes', folio: null, fecha: null, estado: 'propuesta' }),
      ref({ tipo: 'contrato', folio: 'C1', fecha: '2026-01-01' }),
      ref({ tipo: 'nota_pedido', folio: 'N1', fecha: '2026-01-01' }),
    ])
    expect(r.referencias.map((x) => x.tipo)).toEqual(['oc', 'hes', 'nota_pedido'])
    expect(r.glosaOC).toBe('ALDO - BOHO')
    expect(r.omitidas).toBe(1)
  })
})

describe('leerCorreoReferencia — formatos reales', () => {
  it('OC de Falabella: número del asunto y fecha de contabilización (MM/DD/AAAA)', () => {
    expect(leerCorreoReferencia({
      remitente: 'proveedores_dos@falabella.cl',
      asunto: 'Pedido6001807651',
      cuerpo: 'Estimados señores: Encontrarán adjunto el documento de pedido6001807651contabilizado el09/10/2026. Si tienen alguna duda',
      fecha: '2026-09-10T16:06:19Z',
    })).toEqual([{ tipo: 'oc', folio: '6001807651', fecha: '2026-09-10', origen: 'falabella_pedido', nota: 'Fecha de contabilización del pedido (correo de Falabella)' }])
  })

  it('HES de Falabella: sin número (está en el PDF), fecha del correo en Chile', () => {
    const [r] = leerCorreoReferencia({ remitente: 'aaromerov@falabella.cl', asunto: 'Nuevo Documento HES', cuerpo: '', fecha: '2026-09-11T17:22:42Z' })
    expect(r).toMatchObject({ tipo: 'hes', folio: null, fecha: '2026-09-11', origen: 'falabella_hes' })
  })

  it('OC compartida por Unabase', () => {
    const [r] = leerCorreoReferencia({
      remitente: 'info@unabase.com',
      asunto: '[Estudio Prende Spa (Republik)] Produccion Republik ha enviado Orden de Compra Nº 007225: NEGOCIO / 1820 - SEAMLESS - MODELOS 7MM / TOMÁS MONTEALEGRE',
      fecha: '2026-10-06T18:15:09Z',
    })
    expect(r).toMatchObject({ tipo: 'oc', folio: '007225', fecha: '2026-10-06', origen: 'unabase_oc' })
  })

  it('texto de una persona: "OC y HES de este contenido: n1 n2"', () => {
    const r = leerCorreoReferencia({
      remitente: 'rfreitas@falabella.cl',
      asunto: 'RE: CALZADO | VIDEO DE CONTENIDO ALDO ABRIL',
      cuerpo: 'Hola Tomas! Te mando OC y HES de este contenido: 6001783114 1003012275 Saludos.',
      fecha: '2026-08-14T16:11:15Z',
    })
    expect(r.map((x) => [x.tipo, x.folio])).toEqual([['oc', '6001783114'], ['hes', '1003012275']])
  })

  it('ignora números de la conversación citada y correos sin referencias', () => {
    expect(leerCorreoReferencia({
      remitente: 'alguien@cliente.cl',
      asunto: 'Re: Fotos',
      cuerpo: 'Perfecto, gracias!\n\nEl mar, 29 sep. 2026 escribió: la OC 6001111111 ya salió',
      fecha: '2026-09-29T15:00:00Z',
    })).toEqual([])
  })

  it('un "Pedido…" que no viene de Falabella no se toma como OC de Falabella', () => {
    expect(leerCorreoReferencia({ remitente: 'spam@otro.cl', asunto: 'Pedido6001807651', fecha: '2026-09-10T16:06:19Z' }))
      .toEqual([])
  })
})

describe('textoPendientes', () => {
  it('agrupa por cliente lo que falta y omite lo completo', () => {
    const t = textoPendientes([
      { numero: 'CH-2026-101', nombre: 'Fotos ULA', cliente: 'ULA - Falabella', total: 1000, oc: 'confirmada', hes: 'falta' },
      { numero: 'CH-2026-102', nombre: 'Video Aldo', cliente: 'ULA - Falabella', total: 2000, oc: 'falta', hes: 'falta' },
      { numero: 'CH-2026-103', nombre: 'Listo', cliente: 'Republik', total: 3000, oc: 'confirmada', hes: 'no_aplica' },
    ], (n) => `$${n}`)
    expect(t).toBe('ULA - Falabella\n- CH-2026-101 · Fotos ULA ($1000): falta HES\n- CH-2026-102 · Video Aldo ($2000): falta OC y HES')
  })
})
