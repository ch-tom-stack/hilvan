import { describe, it, expect } from 'vitest'
import { evaluarCotejo, DIAS_AVISO_COTEJO } from '@/lib/crm-reconciliacion'

// 2026-08-10 es lunes.
const LUNES = '2026-08-10'

describe('evaluarCotejo', () => {
  it('avisa fuerte si nunca se cotejó', () => {
    const e = evaluarCotejo(null, LUNES)
    expect(e.avisar).toBe(true)
    expect(e.dias).toBeNull()
    expect(e.mensaje).toMatch(/Nunca/)
  })

  it('calla si se cotejó hoy', () => {
    const e = evaluarCotejo(LUNES, LUNES)
    expect(e.avisar).toBe(false)
    expect(e.dias).toBe(0)
    expect(e.mensaje).toBeNull()
  })

  it('aguanta el fin de semana sin avisar', () => {
    // Viernes 07 → lunes 10 son 3 días, pero dos son fin de semana.
    // El umbral está puesto para que un lunes normal NO dispare aviso.
    const e = evaluarCotejo('2026-08-08', LUNES)   // sábado
    expect(e.dias).toBe(2)
    expect(e.avisar).toBe(false)
  })

  it('avisa al llegar al umbral', () => {
    const e = evaluarCotejo('2026-08-07', LUNES)   // viernes → 3 días
    expect(e.dias).toBe(DIAS_AVISO_COTEJO)
    expect(e.avisar).toBe(true)
    expect(e.mensaje).toMatch(/3 días/)
  })

  it('nombra la consecuencia, no el proceso', () => {
    const e = evaluarCotejo('2026-08-01', LUNES)
    expect(e.dias).toBe(9)
    // Lo que importa es que se entienda el daño: respuestas sin registrar.
    expect(e.mensaje).toMatch(/respuestas sin registrar/i)
  })

  it('una fecha futura no produce días negativos', () => {
    const e = evaluarCotejo('2026-08-12', LUNES)
    expect(e.dias).toBe(0)
    expect(e.avisar).toBe(false)
  })
})
