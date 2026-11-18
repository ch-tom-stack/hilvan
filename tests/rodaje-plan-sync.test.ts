import { describe, it, expect } from 'vitest'
import { bloquesPendientes, columnasBloque, firmaBloque, firmas, COLUMNAS_BLOQUE } from '@/lib/rodaje-plan-sync'
import { aplicarCambioTiempo, moverBloque } from '@/lib/rodaje-helpers'
import type { RodajeBloque } from '@/types'

function b(id: string, orden: number, o: Partial<RodajeBloque> = {}): RodajeBloque {
  return {
    id, rodaje_id: 'r', orden, titulo: id, tipo: 'rodaje', es_paralelo: false, es_anclado: false,
    visible_equipo: true, visible_catering: true, visible_extras: true, visible_cliente: true,
    created_at: '2026-01-01', updated_at: '2026-01-01', ...o,
  }
}

describe('sincronización del plan', () => {
  const plan = [
    b('a', 0, { hora_inicio_fija: '08:00', duracion_min: 60 }),
    b('b', 1, { duracion_min: 30 }),
    b('c', 2, { duracion_min: 30 }),
  ]

  it('sin cambios no hay nada que subir', () => {
    expect(bloquesPendientes(plan, firmas(plan))).toEqual([])
  })

  it('editar un texto sube solo ese bloque', () => {
    const editado = plan.map(x => (x.id === 'b' ? { ...x, titulo: 'Escena 4' } : x))
    expect(bloquesPendientes(editado, firmas(plan)).map(x => x.id)).toEqual(['b'])
  })

  it('cambiar un fin sube solo los bloques que se movieron de verdad', () => {
    const anclado = [b('a', 0, { hora_inicio_fija: '08:00', duracion_min: 60 }), b('b', 1, { hora_inicio_fija: '09:00', duracion_min: 30 }), b('c', 2, { duracion_min: 30 })]
    const r = aplicarCambioTiempo(anclado, 'a', 'fin', 9 * 60 + 30)
    // c no tiene hora fija: sigue sola, no hay que escribirla
    expect(bloquesPendientes(r, firmas(anclado)).map(x => x.id)).toEqual(['a', 'b'])
  })

  it('arrastrar una fila sube los que cambiaron de orden', () => {
    const r = moverBloque(plan, 'c', 0)
    expect(bloquesPendientes(r, firmas(plan)).map(x => x.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('los temporales (aún sin id real) no se suben', () => {
    const conTemp = [...plan, b('temp-1', 3)]
    expect(bloquesPendientes(conTemp, firmas(plan))).toEqual([])
  })

  it('soltar un ancla viaja como null (undefined se perdía)', () => {
    const fila = columnasBloque(b('a', 0, { hora_inicio_fija: undefined }))
    expect(fila.hora_inicio_fija).toBeNull()
    expect(JSON.parse(JSON.stringify(fila))).toHaveProperty('hora_inicio_fija', null)
  })

  it('la huella ignora relaciones y timestamps', () => {
    const x = b('a', 0)
    const y = { ...x, updated_at: '2030-01-01', locacion: { id: 'l', nombre: 'L' } } as RodajeBloque
    expect(firmaBloque(x)).toBe(firmaBloque(y))
    expect(Object.keys(columnasBloque(x))).toEqual([...COLUMNAS_BLOQUE])
  })
})
