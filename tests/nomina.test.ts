import { describe, it, expect } from 'vitest'
import { filasNomina, resumenNomina, type PersonaNomina } from '@/lib/nomina'

const p = (o: Partial<PersonaNomina> & { id: string; nombre: string }): PersonaNomina => o

describe('filasNomina', () => {
  it('completa RUT, teléfono y restricción desde el directorio cuando la persona no los tiene', () => {
    const [f] = filasNomina([p({
      id: '1', nombre: 'Ana', rut: '',
      colaborador: { rut: '11.111.111-1', telefono: '+56 9 1', restricciones_alimentarias: 'Vegana' },
    })])
    expect(f.rut).toBe('11.111.111-1')
    expect(f.telefono).toBe('+56 9 1')
    expect(f.restriccion).toBe('Vegana')
  })

  it('lo cargado en el rodaje manda sobre el directorio', () => {
    const [f] = filasNomina([p({
      id: '1', nombre: 'Ana', restriccion_alimentaria: 'Sin gluten',
      colaborador: { restricciones_alimentarias: 'Vegana' },
    })])
    expect(f.restriccion).toBe('Sin gluten')
  })

  it('ordena por departamento (sin departamento al final), jefe primero y luego nombre', () => {
    const filas = filasNomina([
      p({ id: 'a', nombre: 'Zoe' }),
      p({ id: 'b', nombre: 'Beto', departamento: { nombre: 'Cámara' } }),
      p({ id: 'c', nombre: 'Ana', departamento: { nombre: 'Cámara' } }),
      p({ id: 'd', nombre: 'Carla', departamento: { nombre: 'Cámara' }, es_jefe_departamento: true }),
      p({ id: 'e', nombre: 'Sol', departamento: { nombre: 'Arte' } }),
    ])
    expect(filas.map(f => f.id)).toEqual(['e', 'd', 'c', 'b', 'a'])
  })

  it('normaliza vacíos, hora y booleanos', () => {
    const [f] = filasNomina([p({ id: '1', nombre: ' Ana ', rol: null, hora_llamado_individual: '07:30:00', necesita_transporte: null })])
    expect(f.nombre).toBe('Ana')
    expect(f.rol).toBe('')
    expect(f.llamado).toBe('07:30')
    expect(f.transporte).toBe(false)
  })
})

describe('resumenNomina', () => {
  it('cuenta logística y detecta estacionamiento sin patente', () => {
    const filas = filasNomina([
      p({ id: '1', nombre: 'A', necesita_transporte: true }),
      p({ id: '2', nombre: 'B', necesita_estacionamiento: true }),
      p({ id: '3', nombre: 'C', necesita_estacionamiento: true, patente: 'ABCD12', restriccion_alimentaria: 'Celíaco' }),
    ])
    expect(resumenNomina(filas)).toEqual({ personas: 3, transporte: 1, estacionamiento: 2, conRestriccion: 1, sinPatente: 1 })
  })
})
