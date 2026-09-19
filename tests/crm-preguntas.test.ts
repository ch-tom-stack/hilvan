import { describe, it, expect } from 'vitest'
import { motivoPregunta, elegirPreguntas, diasEntre, sumarDias, esRespuesta, textoMotivo } from '@/lib/crm-preguntas'

const HOY = '2026-09-19'

describe('fechas planas', () => {
  it('cuenta días sin correrse por zona horaria ni cambio de hora', () => {
    expect(diasEntre('2026-08-17', HOY)).toBe(33)
    expect(diasEntre('2026-09-05', '2026-09-06')).toBe(1) // cambio de hora en Chile
    expect(sumarDias('2026-09-19', 30)).toBe('2026-10-19')
    expect(sumarDias('2026-12-20', 30)).toBe('2027-01-19')
  })
})

describe('motivoPregunta', () => {
  it('Magnolia: reunión el 17-ago y nada después → se pregunta', () => {
    const r = motivoPregunta([
      { fecha: '2026-08-10', tipo: 'correo', direccion: 'enviado' },
      { fecha: '2026-08-17', tipo: 'reunion', direccion: 'enviado' },
    ], 'conversacion', HOY)
    expect(r).toEqual({ motivo: 'reunion', dias: 33, ultimaFecha: '2026-08-17' })
  })

  it('reunión de ayer: todavía no', () => {
    expect(motivoPregunta([{ fecha: '2026-09-18', tipo: 'reunion', direccion: 'enviado' }], 'contacto', HOY)).toBeNull()
  })

  it('reunión seguida de un correo: ya se sabe qué pasó después', () => {
    expect(motivoPregunta([
      { fecha: '2026-09-01', tipo: 'reunion', direccion: 'enviado' },
      { fecha: '2026-09-15', tipo: 'correo', direccion: 'enviado' },
    ], 'contacto', HOY)).toBeNull()
  })

  it('en conversación y callado hace 10+ días → silencio', () => {
    const r = motivoPregunta([{ fecha: '2026-09-01', tipo: 'correo', direccion: 'enviado' }], 'conversacion', HOY)
    expect(r?.motivo).toBe('silencio')
    expect(r?.dias).toBe(18)
  })

  it('el silencio solo aplica a conversaciones: un frío callado es lo normal', () => {
    expect(motivoPregunta([{ fecha: '2026-08-01', tipo: 'correo', direccion: 'enviado' }], 'contacto', HOY)).toBeNull()
  })

  it('si lo último lo escribieron ellos no falta información, falta contestar', () => {
    expect(motivoPregunta([
      { fecha: '2026-08-20', tipo: 'correo', direccion: 'enviado' },
      { fecha: '2026-09-01', tipo: 'correo', direccion: 'recibido' },
    ], 'conversacion', HOY)).toBeNull()
  })

  it('sin registros, o con fechas nulas o futuras, no pregunta', () => {
    expect(motivoPregunta([], 'conversacion', HOY)).toBeNull()
    expect(motivoPregunta([{ fecha: null, tipo: 'reunion' }], 'conversacion', HOY)).toBeNull()
    expect(motivoPregunta([{ fecha: '2026-10-01', tipo: 'reunion' }], 'conversacion', HOY)).toBeNull()
  })
})

describe('elegirPreguntas', () => {
  const c = (empresa: string, motivo: 'reunion' | 'silencio', dias: number) =>
    ({ prospecto_id: empresa, empresa, motivo, dias, ultimaFecha: '2026-09-01' })

  it('pocas, reuniones primero y después el silencio más largo', () => {
    const r = elegirPreguntas([
      c('A', 'silencio', 40), c('B', 'reunion', 3), c('C', 'silencio', 12),
      c('D', 'reunion', 30), c('E', 'silencio', 25), c('F', 'silencio', 11), c('G', 'silencio', 60),
    ])
    expect(r.map(x => x.empresa)).toEqual(['D', 'B', 'G', 'A', 'E'])
  })
})

describe('textos y validación', () => {
  it('describe el motivo en una línea', () => {
    expect(textoMotivo({ motivo: 'reunion', dias: 33 })).toBe('reunión hace 33 días, nada registrado después')
    expect(textoMotivo({ motivo: 'silencio', dias: 18 })).toBe('en conversación, 18 días sin registro')
  })
  it('solo acepta las cinco respuestas', () => {
    expect(esRespuesta('postergo')).toBe(true)
    expect(esRespuesta('borrar_todo')).toBe(false)
    expect(esRespuesta(undefined)).toBe(false)
  })
})
