import { describe, it, expect } from 'vitest'
import {
  calcularCadencia,
  intervaloPara,
  snoozeMaximo,
  aDiaHabil,
  sumarDias,
  LIMITE_SIN_RESPUESTA,
  fueraDeAgenda,
  type ToqueCadencia,
} from '@/lib/crm-cadencia'

// Referencias: 2026-08-10 es lunes; 08-15 sábado; 08-16 domingo; 08-17 lunes.
const LUNES = '2026-08-10'

const toque = (fecha: string, respondido = false): ToqueCadencia => ({ fecha, respondido })

describe('escalera de intervalos', () => {
  it('sube 2 → 4 → 7 y se queda en 7', () => {
    expect(intervaloPara(1)).toBe(2)
    expect(intervaloPara(2)).toBe(4)
    expect(intervaloPara(3)).toBe(7)
    expect(intervaloPara(9)).toBe(7)
  })

  it('el snooze es un tercio del tramo, mínimo un día', () => {
    expect(snoozeMaximo(2)).toBe(1)
    expect(snoozeMaximo(4)).toBe(1)
    expect(snoozeMaximo(7)).toBe(2)
  })
})

describe('día hábil', () => {
  it('corre sábado y domingo al lunes', () => {
    expect(aDiaHabil('2026-08-15')).toBe('2026-08-17')
    expect(aDiaHabil('2026-08-16')).toBe('2026-08-17')
    expect(aDiaHabil('2026-08-13')).toBe('2026-08-13')
  })
})

describe('calcularCadencia', () => {
  it('sin toques entra hoy', () => {
    const c = calcularCadencia([], LUNES)
    expect(c.estado).toBe('nunca')
    expect(c.vence).toBe(LUNES)
    expect(c.pendiente).toBe(true)
  })

  it('si contestó, toca hoy y la escalera se reinicia', () => {
    const c = calcularCadencia([toque('2026-08-03'), toque('2026-08-07', true)], LUNES)
    expect(c.estado).toBe('respondio')
    expect(c.sinRespuesta).toBe(0)
    expect(c.vence).toBe(LUNES)
    expect(c.pendiente).toBe(true)
  })

  it('un toque sin respuesta espera 2 días', () => {
    const c = calcularCadencia([toque(LUNES)], LUNES)
    expect(c.sinRespuesta).toBe(1)
    expect(c.vence).toBe('2026-08-12')
    expect(c.estado).toBe('espera')
    expect(c.pendiente).toBe(false)
  })

  it('dos sin respuesta esperan 4 días', () => {
    const c = calcularCadencia([toque('2026-08-06'), toque(LUNES)], LUNES)
    expect(c.sinRespuesta).toBe(2)
    expect(c.vence).toBe('2026-08-14')
  })

  it('tres o más sin respuesta esperan una semana', () => {
    const c = calcularCadencia(
      [toque('2026-08-01'), toque('2026-08-05'), toque(LUNES)],
      LUNES,
    )
    expect(c.sinRespuesta).toBe(3)
    expect(c.vence).toBe('2026-08-17')
  })

  it('una respuesta intermedia reinicia el conteo', () => {
    const c = calcularCadencia(
      [toque('2026-07-20'), toque('2026-07-24'), toque('2026-07-30', true), toque('2026-08-06')],
      LUNES,
    )
    expect(c.sinRespuesta).toBe(1)      // solo el posterior a la respuesta
    expect(c.vence).toBe('2026-08-10')  // 08-06 + 2 = 08-08 (sáb) → lunes 10
    expect(c.estado).toBe('hoy')
    expect(c.pendiente).toBe(true)
  })

  it('corre al lunes si cae fin de semana', () => {
    // Jueves 13 + 2 = sábado 15 → lunes 17.
    const c = calcularCadencia([toque('2026-08-13')], LUNES)
    expect(c.vence).toBe('2026-08-17')
  })

  it('marca atraso y prioriza', () => {
    const c = calcularCadencia([toque('2026-08-03')], LUNES)
    expect(c.estado).toBe('atrasado')
    expect(c.diasAtraso).toBe(5)        // vencía el 05
    expect(c.pendiente).toBe(true)
  })

  it('al 16 sin respuesta se agota y sale de la lista', () => {
    const toques = Array.from({ length: LIMITE_SIN_RESPUESTA }, (_, i) =>
      toque(sumarDias('2026-01-05', i * 7)),
    )
    const c = calcularCadencia(toques, LUNES)
    expect(c.sinRespuesta).toBe(16)
    expect(c.estado).toBe('agotado')
    expect(c.pendiente).toBe(false)
    expect(c.vence).toBeNull()
  })

  it('el snooze empuja hacia adelante y lo saca de hoy', () => {
    const c = calcularCadencia([toque('2026-08-03')], LUNES, '2026-08-12')
    expect(c.estado).toBe('snooze')
    expect(c.vence).toBe('2026-08-12')
    expect(c.pendiente).toBe(false)
  })

  it('un snooze ya cumplido no lo esconde', () => {
    // Vencía el 05; se pospuso al viernes 07, que ya pasó → vuelve a la lista.
    const c = calcularCadencia([toque('2026-08-03')], LUNES, '2026-08-07')
    expect(c.estado).toBe('atrasado')
    expect(c.diasAtraso).toBe(3)
    expect(c.pendiente).toBe(true)
  })

  it('un snooze que cae fin de semana entra el lunes', () => {
    const c = calcularCadencia([toque('2026-08-03')], LUNES, '2026-08-09')
    expect(c.vence).toBe(LUNES)
    expect(c.pendiente).toBe(true)
  })

  it('el snooze nunca adelanta una fecha futura', () => {
    const c = calcularCadencia([toque(LUNES)], LUNES, '2026-08-11')
    expect(c.vence).toBe('2026-08-12') // manda la escalera, no el snooze anterior
  })

  it('una respuesta manda sobre el snooze', () => {
    const c = calcularCadencia([toque('2026-08-07', true)], LUNES, '2026-08-20')
    expect(c.estado).toBe('respondio')
    expect(c.pendiente).toBe(true)
  })
})

describe('fueraDeAgenda', () => {
  it('deja fuera las etapas que no se persiguen', () => {
    for (const e of ['confirmado', 'descartado', 'nurture', 'en_frio']) {
      expect(fueraDeAgenda(e)).toBe(true)
    }
  })

  it('deja dentro las etapas activas', () => {
    for (const e of ['prospecto', 'contacto', 'conversacion']) {
      expect(fueraDeAgenda(e)).toBe(false)
    }
  })
})
