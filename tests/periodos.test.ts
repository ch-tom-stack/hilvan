import { describe, it, expect } from 'vitest'
import { mesAnterior, mismoMesAñoAnterior } from '@/lib/periodos'

describe('mesAnterior', () => {
  it('mes intermedio', () => {
    expect(mesAnterior('2026-06')).toBe('2026-05')
  })

  it('cruce de año: enero → diciembre anterior', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12')
  })

  it('marzo → febrero (con padding de cero)', () => {
    expect(mesAnterior('2026-03')).toBe('2026-02')
  })

  it('diciembre → noviembre', () => {
    expect(mesAnterior('2026-12')).toBe('2026-11')
  })
})

describe('mismoMesAñoAnterior', () => {
  it('resta un año conservando el mes string', () => {
    expect(mismoMesAñoAnterior('2026-06')).toBe('2025-06')
  })

  it('conserva el cero del mes', () => {
    expect(mismoMesAñoAnterior('2026-01')).toBe('2025-01')
  })

  it('diciembre', () => {
    expect(mismoMesAñoAnterior('2026-12')).toBe('2025-12')
  })
})
