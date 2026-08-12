import { describe, it, expect } from 'vitest'
import { normalizar, textoBuscable } from '@/lib/crm-buscar'

describe('normalizar', () => {
  it('ignora mayúsculas y tildes', () => {
    expect(normalizar('Albornóz')).toBe('albornoz')
    expect(normalizar('ARAMARK')).toBe('aramark')
    expect(normalizar('  Hilván  ')).toBe('hilvan')
  })

  it('aguanta null y undefined', () => {
    expect(normalizar(null)).toBe('')
    expect(normalizar(undefined)).toBe('')
  })

  it('también pliega la ñ, a propósito', () => {
    // Para buscar conviene: quien escriba "pena" encuentra "Peña" y al revés.
    // En un listado de decenas, un falso positivo no molesta; un falso negativo
    // hace creer que el prospecto no existe.
    expect(normalizar('Niño')).toBe('nino')
    expect(normalizar('Peña')).toBe(normalizar('pena'))
  })
})

describe('textoBuscable', () => {
  const p = {
    empresa: 'Magnolia Novias',
    nombre_contacto: 'Paola Castro Sáez',
    email: 'PAOLA@atelier.cl',
    telefono: '+56 9 1234 5678',
    producto_objetivo: 'lookbook',
    notas: null,
  }

  it('encuentra por empresa, contacto y producto', () => {
    const t = textoBuscable(p)
    expect(t).toContain('magnolia')
    expect(t).toContain('castro saez')   // sin tilde
    expect(t).toContain('lookbook')
  })

  it('encuentra por correo, que es lo único que se tiene al recibir una respuesta', () => {
    expect(textoBuscable(p)).toContain('paola@atelier.cl')
  })

  it('no se cae con campos vacíos', () => {
    expect(textoBuscable({ empresa: 'Solo Empresa' })).toBe('solo empresa')
  })
})
