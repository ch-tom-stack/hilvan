import { describe, it, expect } from 'vitest'
import { ordenar, renumerar, moverUnPuesto, insertarAntesDe, cambiosDeOrden, siguienteOrden } from '@/lib/orden'

const L = (...xs: [string, number][]) => xs.map(([id, orden]) => ({ id, orden }))
const ids = (l: { id: string }[] | null) => l?.map(x => x.id).join('')

describe('orden', () => {
  it('con empates respeta el orden en que venían (estable)', () => {
    expect(ids(ordenar(L(['a', 0], ['b', 0], ['c', 0], ['d', 1])))).toBe('abcd')
    expect(ids(ordenar(L(['x', 3], ['y', 1], ['z', 1])))).toBe('yzx')
  })

  it('mover un puesto deja la lista sin empates ni huecos', () => {
    // El caso real: tres ítems con orden 0 (agregados por el agente en tandas).
    const r = moverUnPuesto(L(['a', 0], ['b', 0], ['c', 0]), 'c', -1)!
    expect(ids(r)).toBe('acb')
    expect(r.map(x => x.orden)).toEqual([0, 1, 2])
  })

  it('no se puede subir el primero ni bajar el último', () => {
    const l = L(['a', 0], ['b', 1])
    expect(moverUnPuesto(l, 'a', -1)).toBeNull()
    expect(moverUnPuesto(l, 'b', 1)).toBeNull()
    expect(moverUnPuesto(l, 'no-existe', 1)).toBeNull()
  })

  it('insertar antes de otro: dentro del mismo grupo o llegando de afuera', () => {
    const l = L(['a', 0], ['b', 1], ['c', 2])
    expect(ids(insertarAntesDe(l, { id: 'c', orden: 2 }, 'a'))).toBe('cab')
    expect(ids(insertarAntesDe(l, { id: 'nuevo', orden: 99 }, 'b'))).toBe('anuevobc'.replace('nuevo', 'nuevo'))
    expect(ids(insertarAntesDe(l, { id: 'z', orden: 0 }, null))).toBe('abcz')
    expect(insertarAntesDe(l, { id: 'z', orden: 0 }, 'b').map(x => x.orden)).toEqual([0, 1, 2, 3])
  })

  it('solo se guardan las filas que cambiaron', () => {
    const antes = L(['a', 0], ['b', 1], ['c', 2], ['d', 3])
    const despues = moverUnPuesto(antes, 'b', 1)!
    expect(cambiosDeOrden(antes, despues)).toEqual([{ id: 'c', orden: 1 }, { id: 'b', orden: 2 }])
    expect(cambiosDeOrden(antes, renumerar(antes))).toEqual([])
  })

  it('lo nuevo va después del último, aunque haya huecos o todos valgan 99', () => {
    expect(siguienteOrden([])).toBe(0)
    expect(siguienteOrden(L(['a', 0], ['b', 5]))).toBe(6)
    expect(siguienteOrden(L(['a', 99], ['b', 99]))).toBe(100)
  })
})
