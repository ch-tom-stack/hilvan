import { describe, it, expect } from 'vitest'
import { evaluarExpresion, leerNumero } from '@/lib/calc-expresion'

describe('evaluarExpresion', () => {
  it('números como los escribe el equipo', () => {
    expect(evaluarExpresion('250000')).toBe(250000)
    expect(evaluarExpresion('250.000')).toBe(250000)
    expect(evaluarExpresion('1.200.000')).toBe(1200000)
    expect(evaluarExpresion('$ 85.000')).toBe(85000)
    expect(evaluarExpresion('2,5')).toBe(2.5)
    expect(evaluarExpresion('2.5')).toBe(2.5)
    expect(evaluarExpresion('1.234,5')).toBe(1234.5)
  })

  it('aritmética con precedencia y paréntesis', () => {
    expect(evaluarExpresion('3*85000')).toBe(255000)
    expect(evaluarExpresion('1.200.000/4')).toBe(300000)
    expect(evaluarExpresion('250000+15000*2')).toBe(280000)
    expect(evaluarExpresion('(250000+15000)*2')).toBe(530000)
    expect(evaluarExpresion('100 - 30 - 20')).toBe(50)
    expect(evaluarExpresion('-5+10')).toBe(5)
    expect(evaluarExpresion('2 * (3 + 4) * 2')).toBe(28)
  })

  it('porcentajes: sumar o restar un % del valor de la izquierda', () => {
    expect(evaluarExpresion('250000+15%')).toBe(287500)
    expect(evaluarExpresion('250000-10%')).toBe(225000)
    expect(evaluarExpresion('200000*15%')).toBe(30000)
    expect(evaluarExpresion('15%')).toBe(0.15)
  })

  it('lo que no se entiende devuelve null y no se guarda', () => {
    for (const mal of ['', 'abc', '3*', '(3+4', '3++4', '10/0', '2..5', '1.23.456', '=3+4'])
      expect(evaluarExpresion(mal), mal).toBeNull()
  })

  it('leerNumero redondea y respeta el mínimo', () => {
    expect(leerNumero('1.000.000/3')).toBe(333333)
    expect(leerNumero('5/2', { decimales: 1 })).toBe(2.5)
    expect(leerNumero('-5', { min: 0 })).toBeNull()
    expect(leerNumero('0', { min: 0 })).toBe(0)
  })
})
