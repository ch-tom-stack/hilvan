import { describe, it, expect } from 'vitest'
import {
  nuevoClaveLink,
  armarTokenClave,
  leerTokenClave,
  evaluarClaveLink,
  validarNuevaClave,
  hashSecreto,
  HORAS_VIGENCIA_CLAVE,
} from '@/lib/clave-link'

const UID = '0b5c3f0e-6a5e-4c55-9d1e-2f7b8a9c1d23'

describe('nuevoClaveLink', () => {
  it('guarda el hash, nunca el secreto, y vence en las horas fijadas', () => {
    const ahora = new Date('2026-11-20T12:00:00Z')
    const { secreto, guardado } = nuevoClaveLink(ahora)
    expect(guardado.hash).toBe(hashSecreto(secreto))
    expect(JSON.stringify(guardado)).not.toContain(secreto)
    expect(Date.parse(guardado.expira) - ahora.getTime()).toBe(HORAS_VIGENCIA_CLAVE * 3600_000)
  })

  it('cada link es distinto', () => {
    expect(nuevoClaveLink().secreto).not.toBe(nuevoClaveLink().secreto)
  })
})

describe('leerTokenClave', () => {
  it('ida y vuelta', () => {
    const { secreto } = nuevoClaveLink()
    expect(leerTokenClave(armarTokenClave(UID, secreto))).toEqual({ userId: UID, secreto })
  })

  it('rechaza formas raras', () => {
    expect(leerTokenClave('')).toBeNull()
    expect(leerTokenClave(UID)).toBeNull()
    expect(leerTokenClave(`no-uuid.${'a'.repeat(43)}`)).toBeNull()
    expect(leerTokenClave(`${UID}.corto`)).toBeNull()
    expect(leerTokenClave(`${UID}.${'a'.repeat(42)}!`)).toBeNull()
  })
})

describe('evaluarClaveLink', () => {
  const ahora = new Date('2026-11-20T12:00:00Z')
  const { secreto, guardado } = nuevoClaveLink(ahora)

  it('válido con el secreto correcto y en plazo', () => {
    expect(evaluarClaveLink(guardado, secreto, ahora)).toBe('valido')
  })

  it('inválido con otro secreto', () => {
    expect(evaluarClaveLink(guardado, nuevoClaveLink().secreto, ahora)).toBe('invalido')
  })

  it('vencido pasado el plazo', () => {
    const despues = new Date(ahora.getTime() + HORAS_VIGENCIA_CLAVE * 3600_000 + 1)
    expect(evaluarClaveLink(guardado, secreto, despues)).toBe('vencido')
  })

  it('inválido si ya se usó (no hay nada guardado) o lo guardado está roto', () => {
    expect(evaluarClaveLink(undefined, secreto, ahora)).toBe('invalido')
    expect(evaluarClaveLink(null, secreto, ahora)).toBe('invalido')
    expect(evaluarClaveLink({ hash: 'xx' }, secreto, ahora)).toBe('invalido')
  })
})

describe('validarNuevaClave', () => {
  it('largo mínimo, máximo y coincidencia', () => {
    expect(validarNuevaClave('corta', 'corta')).toMatch(/al menos/)
    expect(validarNuevaClave('a'.repeat(73), 'a'.repeat(73))).toMatch(/más de 72/)
    expect(validarNuevaClave('hiedra-2026', 'hiedra-2025')).toMatch(/no coinciden/)
    expect(validarNuevaClave('hiedra-2026', 'hiedra-2026')).toBeNull()
  })
})
