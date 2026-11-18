import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TimelineView from '@/components/rodaje/TimelineView'
import { calcularCascada, type RodajeBloque } from '@/types'

function b(id: string, orden: number, o: Partial<RodajeBloque> = {}): RodajeBloque {
  return {
    id, rodaje_id: 'r', orden, titulo: id, tipo: 'rodaje', es_paralelo: false, es_anclado: false,
    visible_equipo: true, visible_catering: true, visible_extras: true, visible_cliente: true,
    created_at: '', updated_at: '', ...o,
  }
}

const html = (bloques: RodajeBloque[]) =>
  renderToStaticMarkup(createElement(TimelineView, { bloquesRaiz: bloques, cascada: calcularCascada(bloques), titulo: 'Rodaje de prueba', fecha: '2026-11-20' }))

describe('TimelineView', () => {
  it('dibuja las horas, los bloques y el encabezado', () => {
    const out = html([
      b('Setup', 0, { hora_inicio_fija: '08:00', duracion_min: 60, scenes_label: 'SET' }),
      b('Escena 1', 1, { duracion_min: 90, scenes_color: '#C11700' }),
      b('Paralelo', 2, { duracion_min: 30, es_paralelo: true }),
    ])
    expect(out).toContain('Rodaje de prueba')
    expect(out).toContain('08:00')
    expect(out).toContain('09:00 → 10:30')
    expect(out).toContain('Escena 1')
    expect(out).toContain('∥')
  })

  it('el lienzo libre no aparece en la línea de tiempo', () => {
    const out = html([
      b('Setup', 0, { hora_inicio_fija: '08:00', duracion_min: 60 }),
      b('Nota suelta', 1, { tipo: 'libre', duracion_min: 0 }),
    ])
    expect(out).not.toContain('Nota suelta')
  })

  it('sin ninguna hora pide ponerla en vez de romperse', () => {
    expect(html([b('Setup', 0, { duracion_min: 60 })])).toContain('hora de inicio')
  })

  it('un día corto usa marcas cada 30 min y uno largo cada hora o más', () => {
    const corto = html([b('A', 0, { hora_inicio_fija: '08:00', duracion_min: 120 })])
    expect(corto).toContain('08:30')
    const largo = html([b('A', 0, { hora_inicio_fija: '06:00', duracion_min: 600 })])
    expect(largo).not.toContain('06:30')
    expect(largo).toContain('07:00')
  })
})
