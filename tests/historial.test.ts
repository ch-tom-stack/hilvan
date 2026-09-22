import { describe, it, expect } from 'vitest'
import { diferencia, opUpdate, opInsert, opDelete, coincide } from '@/lib/historial'

describe('historial: operaciones', () => {
  it('diferencia guarda solo lo que cambió, en las dos direcciones', () => {
    const d = diferencia({ id: '1', nombre: 'A', precio: 100, updated_at: 'x' }, { id: '1', nombre: 'B', precio: 100, updated_at: 'y' })
    expect(d).toEqual({ antes: { nombre: 'A' }, despues: { nombre: 'B' } })
    expect(diferencia({ id: '1', a: 1 }, { id: '1', a: 1 })).toBeNull()
  })

  it('opUpdate empareja por id e ignora filas que no cambiaron', () => {
    const op = opUpdate('t', [{ id: 'a', orden: 0 }, { id: 'b', orden: 1 }], [{ id: 'a', orden: 1 }, { id: 'b', orden: 1 }])
    expect(op).toEqual({ tipo: 'update', tabla: 't', cambios: [{ id: 'a', antes: { orden: 0 }, despues: { orden: 1 } }] })
    expect(opUpdate('t', [{ id: 'a', orden: 0 }], [{ id: 'a', orden: 0 }])).toBeNull()
  })

  it('insert/delete vacíos no producen operación', () => {
    expect(opInsert('t', [])).toBeNull()
    expect(opDelete([{ tabla: 't', filas: [] }])).toBeNull()
    expect(opDelete([{ tabla: 'padre', filas: [{ id: 'p' }] }, { tabla: 'hijo', filas: [] }])).toEqual({ tipo: 'delete', arbol: [{ tabla: 'padre', filas: [{ id: 'p' }] }] })
  })

  it('coincide: se compara solo lo que la acción tocó', () => {
    expect(coincide({ id: '1', nombre: 'B', otro: 'z', updated_at: 'q' }, { nombre: 'B' })).toBe(true)
    expect(coincide({ id: '1', nombre: 'C' }, { nombre: 'B' })).toBe(false)
    expect(coincide(null, { nombre: 'B' })).toBe(false)
    expect(coincide({ id: '1', x: null }, { x: undefined })).toBe(true)
  })
})
