import { describe, it, expect } from 'vitest'
import { cruceOrigenTamano } from '@/lib/crm-cruce'
import { temperaturaDe } from '@/lib/crm-temperatura'

describe('temperaturaDe', () => {
  it('los orígenes que manda el sitio son entrantes, no "sin clasificar"', () => {
    expect(temperaturaDe('landing')).toBe('entrante')
    expect(temperaturaDe('brief')).toBe('entrante')
    expect(temperaturaDe('lectura')).toBe('entrante')
    expect(temperaturaDe('correo')).toBe('frio')
    expect(temperaturaDe('')).toBe('sin_clasificar')
    expect(temperaturaDe('algo_nuevo')).toBe('sin_clasificar')
  })
})

describe('cruceOrigenTamano', () => {
  const p = (origen: string, tamano: string | null, etapa = 'contacto', created_at = '2026-08-01T10:00:00Z', datos_dudosos = false) =>
    ({ origen, tamano, etapa, created_at, datos_dudosos })

  it('separa por canal y calcula los % solo sobre los que tienen tamaño', () => {
    const r = cruceOrigenTamano([
      p('landing', 'chica'), p('landing', 'chica'), p('landing', 'chica'), p('landing', 'grande'), p('landing', null),
      p('correo', 'grande', 'confirmado'), p('correo', 'mediana'), p('correo', 'chica', 'descartado'),
    ])
    expect(r.por_canal.entrante).toMatchObject({ total: 5, chica: 3, grande: 1, sin_tamano: 1, pct_chica: 75, pct_mediana_grande: 25 })
    expect(r.por_canal.frio).toMatchObject({ total: 3, pct_chica: 33, pct_mediana_grande: 67, confirmados: 1, descartados: 1 })
    expect(r.por_canal.sin_clasificar.pct_chica).toBeNull()
  })

  it('las fichas dudosas (bots) no cuentan, y `desde` deja solo lo nuevo', () => {
    const r = cruceOrigenTamano([
      p('landing', 'chica', 'contacto', '2026-08-01T10:00:00Z'),
      p('landing', 'grande', 'contacto', '2026-09-25T10:00:00Z'),
      p('landing', 'chica', 'contacto', '2026-09-26T10:00:00Z', true),
    ], '2026-09-19')
    expect(r).toMatchObject({ desde: '2026-09-19', considerados: 1, excluidos_dudosos: 1 })
    expect(r.por_canal.entrante).toMatchObject({ total: 1, grande: 1, pct_chica: 0 })
  })
})
