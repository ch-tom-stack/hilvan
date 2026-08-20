import { describe, it, expect } from 'vitest'
import { hayCadenaDeCorreo } from '@/lib/crm-conversacion'

describe('hayCadenaDeCorreo', () => {
  it('un toque de correo previo basta', () => {
    expect(hayCadenaDeCorreo([{ tipo: 'correo' }])).toBe(true)
  })

  it('no depende de gmail_thread', () => {
    // El motivo del arreglo: `gmail_thread` sólo lo llena el cotejo diario, y
    // 49 de 105 toques de correo no lo tenían. Exigirlo daba 20 falsos
    // negativos — prospectos con historial marcados como "sin cadena".
    expect(hayCadenaDeCorreo([{ tipo: 'correo', gmail_thread: null }])).toBe(true)
  })

  it('gmail_thread solo también cuenta', () => {
    expect(hayCadenaDeCorreo([{ tipo: 'reunion', gmail_thread: 'abc123' }])).toBe(true)
  })

  it('llamadas y reuniones no arman cadena de correo', () => {
    expect(hayCadenaDeCorreo([{ tipo: 'llamada' }, { tipo: 'reunion' }, { tipo: 'mensaje' }])).toBe(false)
  })

  it('sin historial no hay cadena', () => {
    expect(hayCadenaDeCorreo([])).toBe(false)
  })

  it('un hilo cerrado no cuenta: esa conversación ya terminó', () => {
    expect(hayCadenaDeCorreo([{ tipo: 'correo', cuenta_cadencia: false }])).toBe(false)
    // Pero si además hay uno vivo, sí.
    expect(hayCadenaDeCorreo([
      { tipo: 'correo', cuenta_cadencia: false },
      { tipo: 'correo', cuenta_cadencia: true },
    ])).toBe(true)
  })
})
