import { describe, it, expect } from 'vitest'
import {
  describirTrabajador,
  hoyEnChile,
  ladosPedidos,
  periodoPedible,
  periodosSemanales,
  solicitudTomable,
} from '@/lib/sii-cola'

// Chile en octubre 2026 está en horario de verano (UTC-3).
const chile = (iso: string) => new Date(iso)

describe('hoyEnChile', () => {
  it('usa la fecha de Chile, no la UTC', () => {
    // 1-nov 01:00 UTC = 31-oct 22:00 en Chile
    expect(hoyEnChile(chile('2026-11-01T01:00:00Z'))).toEqual({ anio: 2026, mes: 10, dia: 31 })
  })
})

describe('periodosSemanales', () => {
  it('hasta el día 15: mes en curso y el anterior', () => {
    expect(periodosSemanales(chile('2026-10-12T11:00:00Z'))).toEqual(['202610', '202609'])
  })
  it('después del 15: solo el mes en curso', () => {
    expect(periodosSemanales(chile('2026-10-19T11:00:00Z'))).toEqual(['202610'])
  })
  it('enero arrastra diciembre del año anterior', () => {
    expect(periodosSemanales(chile('2027-01-04T11:00:00Z'))).toEqual(['202701', '202612'])
  })
})

describe('ladosPedidos', () => {
  it('default: los tres', () => {
    expect(ladosPedidos(undefined)).toEqual(['compras', 'ventas', 'bhe'])
  })
  it('acepta un subconjunto sin repetidos', () => {
    expect(ladosPedidos(['bhe', 'bhe'])).toEqual(['bhe'])
  })
  it('rechaza lados desconocidos o vacíos', () => {
    expect(ladosPedidos(['boletas'])).toBeNull()
    expect(ladosPedidos([])).toBeNull()
  })
})

describe('periodoPedible', () => {
  const ahora = chile('2026-10-16T21:00:00Z')
  it('acepta el mes en curso y los pasados', () => {
    expect(periodoPedible('2026-10', ahora)).toEqual({ ok: true, periodo: '202610' })
    expect(periodoPedible('202605', ahora)).toEqual({ ok: true, periodo: '202605' })
  })
  it('rechaza el futuro y lo inválido', () => {
    expect(periodoPedible('2026-11', ahora).ok).toBe(false)
    expect(periodoPedible('octubre', ahora).ok).toBe(false)
  })
})

describe('describirTrabajador', () => {
  const ahora = chile('2026-10-16T21:00:00Z')
  it('en línea con latido reciente', () => {
    const d = describirTrabajador({ ultimo_latido: '2026-10-16T20:57:00Z', bloqueado: false, motivo_bloqueo: null }, ahora)
    expect(d.estado).toBe('en_linea')
    expect(d.minutos_sin_latido).toBe(3)
  })
  it('fuera de línea pasados 15 min', () => {
    const d = describirTrabajador({ ultimo_latido: '2026-10-16T18:00:00Z', bloqueado: false, motivo_bloqueo: null }, ahora)
    expect(d.estado).toBe('fuera_de_linea')
    expect(d.mensaje).toContain('180 min')
  })
  it('bloqueado manda aunque tenga latido', () => {
    const d = describirTrabajador({ ultimo_latido: '2026-10-16T20:59:00Z', bloqueado: true, motivo_bloqueo: 'Clave incorrecta' }, ahora)
    expect(d.estado).toBe('bloqueado')
    expect(d.mensaje).toContain('Clave incorrecta')
  })
  it('nunca conectado', () => {
    expect(describirTrabajador(null, ahora).estado).toBe('nunca_conectado')
  })
})

describe('solicitudTomable', () => {
  const ahora = chile('2026-10-16T21:00:00Z')
  it('pendiente sí; hecha y fallida no', () => {
    expect(solicitudTomable({ estado: 'pendiente', tomado_at: null }, ahora)).toBe(true)
    expect(solicitudTomable({ estado: 'hecha', tomado_at: null }, ahora)).toBe(false)
    expect(solicitudTomable({ estado: 'fallida', tomado_at: null }, ahora)).toBe(false)
  })
  it('en curso solo si quedó huérfana (>30 min)', () => {
    expect(solicitudTomable({ estado: 'en_curso', tomado_at: '2026-10-16T20:55:00Z' }, ahora)).toBe(false)
    expect(solicitudTomable({ estado: 'en_curso', tomado_at: '2026-10-16T20:00:00Z' }, ahora)).toBe(true)
  })
})
