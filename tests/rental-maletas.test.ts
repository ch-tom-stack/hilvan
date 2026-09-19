import { describe, it, expect } from 'vitest'
import { codigosDeReserva, conflictosDeNueva, codigoMaleta, expandirOcupacion } from '@/lib/rental-kits'

// La maleta de cámara lleva la A7S III, un lente y dos baterías.
const M = 'maleta-camara'
const items = { [M]: [{ codigo: 'CH-CAM-002', cantidad: 1 }, { codigo: 'CH-OPT-001', cantidad: 1 }, { codigo: 'CH-BAT-001', cantidad: 2 }] }
const stock = { 'CH-CAM-002': 1, 'CH-OPT-001': 1, 'CH-BAT-001': 4, 'CH-CAM-003': 1 }

describe('una maleta reserva su contenido', () => {
  it('ocupa la maleta misma y cada equipo, según su cantidad', () => {
    expect(codigosDeReserva({ maletaId: M }, items)).toEqual([codigoMaleta(M), 'CH-CAM-002', 'CH-OPT-001', 'CH-BAT-001', 'CH-BAT-001'])
    expect(codigosDeReserva({ equipoCodigo: 'CH-CAM-003' }, items)).toEqual(['CH-CAM-003'])
    expect(codigosDeReserva({ maletaId: 'vacia' }, items)).toEqual([codigoMaleta('vacia')])
    expect(codigosDeReserva({}, items)).toEqual([])
  })

  it('con la maleta reservada, la cámara que va adentro no está libre', () => {
    const existentes = codigosDeReserva({ maletaId: M }, items)
    expect(conflictosDeNueva(['CH-CAM-002'], existentes, stock)).toEqual(['CH-CAM-002'])
    // …pero la otra cámara sí, y quedan 2 de las 4 baterías.
    expect(conflictosDeNueva(['CH-CAM-003'], existentes, stock)).toEqual([])
    expect(conflictosDeNueva(['CH-BAT-001'], existentes, stock)).toEqual([])
    expect(expandirOcupacion(existentes, stock)['CH-BAT-001']).toBe(2)
  })

  it('al revés: con la cámara reservada suelta, la maleta que la lleva no se puede', () => {
    const nueva = codigosDeReserva({ maletaId: M }, items)
    expect(conflictosDeNueva(nueva, ['CH-CAM-002'], stock)).toEqual(['CH-CAM-002'])
  })

  it('la misma maleta no sale dos veces', () => {
    const nueva = codigosDeReserva({ maletaId: M }, items)
    expect(conflictosDeNueva(nueva, nueva, stock)).toContain(codigoMaleta(M))
  })

  it('un sobrecupo ajeno ya existente no bloquea una reserva que no lo toca', () => {
    expect(conflictosDeNueva(['CH-CAM-003'], ['CH-OPT-001', 'CH-OPT-001'], stock)).toEqual([])
  })

  it('kits y maletas conviven: la maleta Athena (kit) choca con uno de sus lentes', () => {
    const s = { 'CH-KIT-003': 1, 'CH-OPT-007': 1 }
    expect(conflictosDeNueva(['CH-OPT-007'], ['CH-KIT-003'], s)).toEqual(['CH-OPT-007'])
  })
})

import { HORA_HHMM } from '@/lib/rodaje-helpers'
describe('HORA_HHMM', () => {
  it('solo horas que existen: "25:99" reventaba en Postgres', () => {
    for (const ok of ['00:00', '08:05', '13:35', '23:59']) expect(HORA_HHMM.test(ok)).toBe(true)
    for (const mal of ['25:99', '24:00', '12:60', '8:00', '08:0', 'nunca', '']) expect(HORA_HHMM.test(mal)).toBe(false)
  })
})
