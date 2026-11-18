import { describe, it, expect } from 'vitest'
import { aplicarCambioTiempo, calcularCascada, moverBloque } from '@/lib/rodaje-helpers'
import type { RodajeBloque } from '@/types'

function b(id: string, orden: number, o: Partial<RodajeBloque> = {}): RodajeBloque {
  return {
    id, rodaje_id: 'r', orden, titulo: id, tipo: 'rodaje', es_paralelo: false, es_anclado: false,
    visible_equipo: true, visible_catering: true, visible_extras: true, visible_cliente: true,
    created_at: '', updated_at: '', ...o,
  }
}
const horas = (bs: RodajeBloque[]) => calcularCascada(bs.slice().sort((x, y) => x.orden - y.orden)).map(c => [c.inicio_min, c.fin_min])
const m = (h: number, min = 0) => h * 60 + min

describe('cambiar el fin', () => {
  it('cambia la duración y corre los bloques que siguen (sin hora fija)', () => {
    const plan = [b('a', 0, { hora_inicio_fija: '08:00', duracion_min: 60 }), b('b', 1, { duracion_min: 30 }), b('c', 2, { duracion_min: 30 })]
    const r = aplicarCambioTiempo(plan, 'a', 'fin', m(10)) // a: 08:00–10:00
    expect(horas(r)).toEqual([[m(8), m(10)], [m(10), m(10, 30)], [m(10, 30), m(11)]])
  })

  it('corre también a los anclados que estaban pegados (cadena)', () => {
    // Todos con hora fija, uno detrás de otro — el caso real de un plan armado a mano.
    const plan = [
      b('a', 0, { hora_inicio_fija: '08:00', duracion_min: 60 }),
      b('b', 1, { hora_inicio_fija: '09:00', duracion_min: 60 }),
      b('c', 2, { hora_inicio_fija: '10:00', duracion_min: 30 }),
    ]
    const r = aplicarCambioTiempo(plan, 'a', 'fin', m(9, 30))
    expect(horas(r)).toEqual([[m(8), m(9, 30)], [m(9, 30), m(10, 30)], [m(10, 30), m(11)]])
    expect(r[1].hora_inicio_fija).toBe('09:30')
  })

  it('la cadena se corta en un hueco deliberado (almuerzo a las 14:00)', () => {
    const plan = [
      b('a', 0, { hora_inicio_fija: '08:00', duracion_min: 60 }),
      b('b', 1, { duracion_min: 60 }),
      b('almuerzo', 2, { hora_inicio_fija: '14:00', duracion_min: 60 }),
      b('c', 3, { duracion_min: 30 }),
    ]
    const r = aplicarCambioTiempo(plan, 'a', 'fin', m(9, 30))
    expect(r.find(x => x.id === 'almuerzo')!.hora_inicio_fija).toBe('14:00')
    expect(horas(r)[1]).toEqual([m(9, 30), m(10, 30)])
  })

  it('acortar también adelanta a los siguientes', () => {
    const plan = [b('a', 0, { hora_inicio_fija: '08:00', duracion_min: 120 }), b('b', 1, { hora_inicio_fija: '10:00', duracion_min: 30 })]
    const r = aplicarCambioTiempo(plan, 'a', 'fin', m(9))
    expect(horas(r)).toEqual([[m(8), m(9)], [m(9), m(9, 30)]])
  })
})

describe('cambiar la duración', () => {
  it('corre a los siguientes igual que el fin', () => {
    const plan = [b('a', 0, { hora_inicio_fija: '08:00', duracion_min: 60 }), b('b', 1, { hora_inicio_fija: '09:00', duracion_min: 30 })]
    const r = aplicarCambioTiempo(plan, 'a', 'duracion', 90)
    expect(horas(r)).toEqual([[m(8), m(9, 30)], [m(9, 30), m(10)]])
  })
})

describe('cambiar el inicio', () => {
  it('con el fin fijo, cambia la duración', () => {
    const plan = [b('a', 0, { hora_inicio_fija: '08:00', duracion_min: 60 }), b('b', 1, { duracion_min: 60 })]
    // b parte 09:00 y termina 10:00; lo atraso a 09:30 → dura 30, termina igual
    const r = aplicarCambioTiempo(plan, 'b', 'inicio', m(9, 30))
    const bb = r.find(x => x.id === 'b')!
    expect(bb.hora_inicio_fija).toBe('09:30')
    expect(bb.duracion_min).toBe(30)
    expect(bb.hora_fin).toBe('10:00')
  })

  it('adelantar el inicio alarga el bloque hasta el mismo fin', () => {
    const plan = [b('a', 0, { hora_inicio_fija: '08:00', duracion_min: 60 }), b('b', 1, { duracion_min: 60 })]
    const bb = aplicarCambioTiempo(plan, 'b', 'inicio', m(8, 30)).find(x => x.id === 'b')!
    expect(bb.duracion_min).toBe(90)
  })

  it('si el inicio pasa el fin, el bloque se desplaza entero y arrastra a los siguientes', () => {
    const plan = [b('a', 0, { hora_inicio_fija: '08:00', duracion_min: 60 }), b('b', 1, { duracion_min: 30 }), b('c', 2, { duracion_min: 30 })]
    const r = aplicarCambioTiempo(plan, 'a', 'inicio', m(11)) // 11:00 ≥ fin (09:00)
    expect(horas(r)).toEqual([[m(11), m(12)], [m(12), m(12, 30)], [m(12, 30), m(13)]])
  })
})

describe('moverBloque (arrastrar filas)', () => {
  const plan = () => [
    b('a', 0, { hora_inicio_fija: '08:00', duracion_min: 60 }),
    b('b', 1, { duracion_min: 30 }),
    b('c', 2, { duracion_min: 30, hora_inicio_fija: '10:00' }),
  ]
  const ids = (bs: RodajeBloque[]) => bs.slice().sort((x, y) => x.orden - y.orden).map(x => x.id)

  it('reordena y suelta la hora fija del movido', () => {
    const r = moverBloque(plan(), 'c', 1)
    expect(ids(r)).toEqual(['a', 'c', 'b'])
    const c = r.find(x => x.id === 'c')!
    expect(c.hora_inicio_fija).toBeNull()
    expect(c.es_anclado).toBe(false)
    expect(horas(r)).toEqual([[m(8), m(9)], [m(9), m(9, 30)], [m(9, 30), m(10)]])
  })

  it('si se va el primero, el llamado pasa al que abre el día', () => {
    const r = moverBloque(plan(), 'a', 2)
    expect(ids(r)).toEqual(['b', 'c', 'a'])
    expect(r.find(x => x.id === 'b')!.hora_inicio_fija).toBe('08:00')
    expect(r.find(x => x.id === 'a')!.hora_inicio_fija).toBeNull()
  })

  it('al abrir el día se queda con el llamado', () => {
    const r = moverBloque(plan(), 'b', 0)
    expect(ids(r)).toEqual(['b', 'a', 'c'])
    expect(r.find(x => x.id === 'b')!.hora_inicio_fija).toBe('08:00')
    expect(r.find(x => x.id === 'a')!.hora_inicio_fija).toBeNull()
  })

  it('misma posición o id inexistente → sin cambios', () => {
    const p = plan()
    expect(moverBloque(p, 'b', 1)).toBe(p)
    expect(moverBloque(p, 'zzz', 0)).toBe(p)
  })
})
