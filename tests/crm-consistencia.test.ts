import { describe, it, expect } from 'vitest'
import { inconsistenciasDeEtapa } from '@/lib/crm-consistencia'

const env = (fecha: string, extra = {}) => ({ fecha, tipo: 'correo', direccion: 'enviado', respondido: false, ...extra })
const rec = (fecha: string, resumen: string) => ({ fecha, tipo: 'correo', direccion: 'recibido', resumen })

describe('inconsistenciasDeEtapa', () => {
  it('Hooked: en conversación con 3 correos y 0 respuestas', () => {
    const r = inconsistenciasDeEtapa('conversacion', [env('2026-08-01'), env('2026-08-08'), env('2026-08-20')])
    expect(r.map(i => i.tipo)).toEqual(['conversacion_sin_respuesta'])
    expect(r[0].detalle).toContain('3 toques')
  })

  it('una respuesta, un respondido o una reunión bastan para que sea conversación', () => {
    expect(inconsistenciasDeEtapa('conversacion', [env('2026-08-01'), rec('2026-08-02', 'Pide precios')])).toEqual([])
    expect(inconsistenciasDeEtapa('conversacion', [env('2026-08-01', { respondido: true })])).toEqual([])
    expect(inconsistenciasDeEtapa('conversacion', [env('2026-08-17', { tipo: 'reunion' })])).toEqual([])
  })

  it('Somos MODO: confirmado sin un solo toque', () => {
    expect(inconsistenciasDeEtapa('confirmado', []).map(i => i.tipo)).toEqual(['confirmado_sin_historial'])
    expect(inconsistenciasDeEtapa('confirmado', [env('2026-08-01')])).toEqual([])
  })

  it('@sebastiandelrealossa: rechazo suave como último registro y sigue en contacto', () => {
    const r = inconsistenciasDeEtapa('contacto', [
      env('2026-08-15', { respondido: true }),
      rec('2026-08-21', 'Rechazo suave: agradece el contacto y dice que los mantendrán en mente'),
    ])
    expect(r.map(i => i.tipo)).toEqual(['rechazo_sin_mover'])
  })

  it('si después del "no" hubo más contacto, la conversación siguió', () => {
    expect(inconsistenciasDeEtapa('contacto', [
      rec('2026-08-21', 'Dijo que no por ahora'), env('2026-09-10'),
    ])).toEqual([])
  })

  it('no confunde una objeción con un rechazo', () => {
    expect(inconsistenciasDeEtapa('contacto', [env('2026-08-01', { respondido: true }), rec('2026-08-27', 'No están seguros del camión, buscan alternativas más baratas')])).toEqual([])
    expect(inconsistenciasDeEtapa('contacto', [env('2026-08-01', { respondido: true }), rec('2026-08-27', 'No alcanzó a revisar, pide que le escribamos el lunes')])).toEqual([])
  })

  it('ya descartado o en frío: nada que avisar', () => {
    expect(inconsistenciasDeEtapa('descartado', [rec('2026-08-21', 'Dijo que no')])).toEqual([])
    expect(inconsistenciasDeEtapa('en_frio', [rec('2026-08-21', 'Rechazo suave')])).toEqual([])
  })
})
