import { describe, it, expect } from 'vitest'
import { normalizarNombre, UUID_RE } from '@/lib/agent-categorias'

describe('agent-categorias', () => {
  it('normaliza sin tildes ni mayúsculas ni espacios dobles', () => {
    expect(normalizarNombre('  PRODUCCIÓN  General ')).toBe('produccion general')
    expect(normalizarNombre('Cámara')).toBe(normalizarNombre('camara'))
  })
  it('reconoce uuids', () => {
    expect(UUID_RE.test('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(UUID_RE.test('Cámara')).toBe(false)
  })
})
