import { describe, it, expect } from 'vitest'
import {
  emisoraDe,
  numeroProveedorDe,
  EMISORA_AFECTA,
  EMISORA_EXENTA,
  NUMERO_PROVEEDOR_FALABELLA,
} from '@/lib/cotizacion-emisora'

describe('emisoraDe', () => {
  it('con IVA → EIRL principal con Santander', () => {
    const e = emisoraDe({ con_iva: true })
    expect(e).toBe(EMISORA_AFECTA)
    expect(e.rut).toBe('77151117-1')
    expect(e.banco.numero).toBe('000084616290')
    expect(e.banco.codigoCmf).toBe('037')
  })
  it('sin IVA → Producciones Culturales con BancoEstado', () => {
    const e = emisoraDe({ con_iva: false })
    expect(e).toBe(EMISORA_EXENTA)
    expect(e.rut).toBe('77956984-5')
    expect(e.banco.numero).toBe('90277664967')
    expect(e.banco.codigoCmf).toBe('012')
  })
  it('sin dato → afecta (lo normal)', () => {
    expect(emisoraDe({})).toBe(EMISORA_AFECTA)
  })
})

describe('numeroProveedorDe', () => {
  const falabella = { cliente: 'Falabella', numero: NUMERO_PROVEEDOR_FALABELLA }

  it('cliente directo con el RUT de Falabella', () => {
    expect(numeroProveedorDe({ cliente: { nombre: 'Falabella - Aldo Shoes', rut: '77261280-K' } })).toEqual(falabella)
    expect(numeroProveedorDe({ cliente: { nombre: 'Lo que sea', rut: '77.261.280-k' } })).toEqual(falabella)
  })
  it('cliente Falabella sin RUT cargado: por nombre', () => {
    expect(numeroProveedorDe({ cliente: { nombre: 'ULA - Falabella', rut: null } })).toEqual(falabella)
    expect(numeroProveedorDe({ cliente_nombre_libre: 'Falabella Retail' })).toEqual(falabella)
  })
  it('vía Republik o Rose Studio (agencia) → la factura es para la agencia, sin número', () => {
    expect(numeroProveedorDe({
      cliente: { nombre: 'Falabella', rut: '77261280-K' },
      agencia_id: 'x',
      agencia: { nombre: 'Republik', rut: '76580333-0' },
    })).toBeNull()
    expect(numeroProveedorDe({
      cliente_nombre_libre: 'Falabella',
      agencia_nombre_libre: 'Rose Studio',
    })).toBeNull()
  })
  it('modelo viejo: Republik en cliente_* y la marca en cliente_final → sin número', () => {
    expect(numeroProveedorDe({ cliente: { nombre: 'Republik', rut: '76580333-0' } })).toBeNull()
  })
  it('Falabella como agencia de una marca → con número', () => {
    expect(numeroProveedorDe({
      cliente: { nombre: 'Aldo' },
      agencia_id: 'y',
      agencia: { nombre: 'Falabella', rut: '77261280-K' },
    })).toEqual(falabella)
  })
  it('un RUT distinto manda sobre el nombre', () => {
    expect(numeroProveedorDe({ cliente: { nombre: 'Agencia que trabaja con Falabella', rut: '13687362-8' } })).toBeNull()
  })
  it('otros clientes → null', () => {
    expect(numeroProveedorDe({ cliente: { nombre: 'Stanley Tools' } })).toBeNull()
    expect(numeroProveedorDe({})).toBeNull()
  })
})
