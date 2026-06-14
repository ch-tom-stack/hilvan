import { describe, it, expect } from 'vitest'
import {
  horaAMinutos,
  minutosAHora,
  calcularCascada,
  aplicarCambioTiempo,
  duracionTotalDia,
  resolverHoraLlamado,
  formatHora,
  type RodajeBloque,
  type RodajeEquipoTecnico,
  type Rodaje,
} from '@/types'

function bloque(overrides: Partial<RodajeBloque> = {}): RodajeBloque {
  return {
    id: 'b',
    rodaje_id: 'r',
    orden: 0,
    titulo: 'Bloque',
    tipo: 'rodaje',
    es_paralelo: false,
    es_anclado: false,
    visible_equipo: true,
    visible_catering: true,
    visible_extras: true,
    visible_cliente: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

// ── horaAMinutos / minutosAHora ───────────────────────────────────────────────
describe('horaAMinutos / minutosAHora', () => {
  it('convierte hora a minutos', () => {
    expect(horaAMinutos('08:30')).toBe(510)
    expect(horaAMinutos('00:00')).toBe(0)
    expect(horaAMinutos('23:59')).toBe(1439)
  })

  it('convierte minutos a hora con padding', () => {
    expect(minutosAHora(510)).toBe('08:30')
    expect(minutosAHora(0)).toBe('00:00')
    expect(minutosAHora(1439)).toBe('23:59')
  })

  it('minutosAHora envuelve en 24h (módulo)', () => {
    // 25:00 → 01:00
    expect(minutosAHora(1500)).toBe('01:00')
  })

  it('round-trip', () => {
    expect(minutosAHora(horaAMinutos('14:45'))).toBe('14:45')
  })
})

// ── calcularCascada ───────────────────────────────────────────────────────────
describe('calcularCascada', () => {
  it('primer bloque sin hora fija → inicio undefined (no hay cursor)', () => {
    const res = calcularCascada([bloque({ id: 'a', duracion_min: 60 })])
    expect(res[0].inicio_min).toBeUndefined()
    expect(res[0].fin_min).toBeUndefined()
    expect(res[0].duracion_min).toBe(60)
  })

  it('bloque con hora fija ancla el cursor; siguiente cae en cascada', () => {
    const res = calcularCascada([
      bloque({ id: 'a', hora_inicio_fija: '08:00', duracion_min: 60 }),
      bloque({ id: 'b', duracion_min: 30 }),
    ])
    expect(res[0].inicio_min).toBe(480) // 08:00
    expect(res[0].fin_min).toBe(540)    // 09:00
    expect(res[1].inicio_min).toBe(540) // 09:00
    expect(res[1].fin_min).toBe(570)    // 09:30
  })

  it('bloque paralelo comparte el inicio del cursor actual', () => {
    const res = calcularCascada([
      bloque({ id: 'a', hora_inicio_fija: '08:00', duracion_min: 60 }),
      bloque({ id: 'b', es_paralelo: true, duracion_min: 20 }),
    ])
    // el paralelo arranca en cursor_inicio (08:00), NO en cursor_fin
    expect(res[1].inicio_min).toBe(480)
    expect(res[1].fin_min).toBe(500) // 08:00 + 20min
  })

  it('DUDOSO: bloque paralelo NO avanza el cursor; el siguiente normal parte del fin previo al paralelo', () => {
    const res = calcularCascada([
      bloque({ id: 'a', hora_inicio_fija: '08:00', duracion_min: 60 }), // fin 09:00
      bloque({ id: 'b', es_paralelo: true, duracion_min: 120 }),         // 08:00-10:00, no mueve cursor
      bloque({ id: 'c', duracion_min: 30 }),                             // parte de cursor_fin = 09:00
    ])
    expect(res[2].inicio_min).toBe(540) // 09:00, ignora que el paralelo termina a las 10:00
    expect(res[2].fin_min).toBe(570)
  })

  it('segunda hora fija re-ancla el cursor', () => {
    const res = calcularCascada([
      bloque({ id: 'a', hora_inicio_fija: '08:00', duracion_min: 60 }),
      bloque({ id: 'b', hora_inicio_fija: '12:00', duracion_min: 30 }),
      bloque({ id: 'c', duracion_min: 15 }),
    ])
    expect(res[1].inicio_min).toBe(720) // 12:00
    expect(res[2].inicio_min).toBe(750) // 12:30
  })

  it('duracion_min ausente se trata como 0', () => {
    const res = calcularCascada([
      bloque({ id: 'a', hora_inicio_fija: '08:00' }),
      bloque({ id: 'b', duracion_min: 30 }),
    ])
    expect(res[0].fin_min).toBe(480) // mismo inicio, dur 0
    expect(res[1].inicio_min).toBe(480)
  })
})

// ── aplicarCambioTiempo ───────────────────────────────────────────────────────
describe('aplicarCambioTiempo', () => {
  it('id inexistente → devuelve el array sin cambios (misma referencia)', () => {
    const bloques = [bloque({ id: 'a' })]
    expect(aplicarCambioTiempo(bloques, 'zzz', 'inicio', 480)).toBe(bloques)
  })

  it('campo inicio: fija hora, marca anclado y recalcula hora_fin', () => {
    const res = aplicarCambioTiempo(
      [bloque({ id: 'a', duracion_min: 60 })],
      'a', 'inicio', 480,
    )
    expect(res[0].hora_inicio_fija).toBe('08:00')
    expect(res[0].es_anclado).toBe(true)
    expect(res[0].hora_fin).toBe('09:00')
  })

  it('campo inicio sin duracion → no setea hora_fin', () => {
    const res = aplicarCambioTiempo([bloque({ id: 'a' })], 'a', 'inicio', 480)
    expect(res[0].hora_inicio_fija).toBe('08:00')
    expect(res[0].hora_fin).toBeUndefined()
  })

  it('campo fin: deriva duracion desde inicio fijo', () => {
    const res = aplicarCambioTiempo(
      [bloque({ id: 'a', hora_inicio_fija: '08:00', duracion_min: 30 })],
      'a', 'fin', 600, // 10:00
    )
    expect(res[0].duracion_min).toBe(120) // 10:00 - 08:00
    expect(res[0].hora_fin).toBe('10:00')
  })

  it('campo fin sin hora_inicio_fija: deriva el inicio desde la cascada y ajusta la duración', () => {
    const bloques = [
      bloque({ id: 'a', hora_inicio_fija: '08:00', duracion_min: 60 }), // termina 09:00 (=540)
      bloque({ id: 'b', duracion_min: 30 }),                            // inicio cascada = 540
    ]
    const res = aplicarCambioTiempo(bloques, 'b', 'fin', 600) // fin 10:00
    expect(res[1].duracion_min).toBe(60)  // 600 - 540
    expect(res[1].hora_fin).toBe('10:00')
  })

  it('campo fin en primer bloque sin inicio derivable → no hace nada (no hay referencia de inicio)', () => {
    const res = aplicarCambioTiempo([bloque({ id: 'a', duracion_min: 30 })], 'a', 'fin', 600)
    expect(res[0].duracion_min).toBe(30)
    expect(res[0].hora_fin).toBeUndefined()
  })

  it('campo duracion: setea duracion y recalcula fin si hay inicio fijo', () => {
    const res = aplicarCambioTiempo(
      [bloque({ id: 'a', hora_inicio_fija: '08:00', duracion_min: 30 })],
      'a', 'duracion', 90,
    )
    expect(res[0].duracion_min).toBe(90)
    expect(res[0].hora_fin).toBe('09:30')
  })

  it('campo duracion sin inicio fijo: setea duracion, no toca fin', () => {
    const res = aplicarCambioTiempo([bloque({ id: 'a', duracion_min: 30 })], 'a', 'duracion', 90)
    expect(res[0].duracion_min).toBe(90)
    expect(res[0].hora_fin).toBeUndefined()
  })

  it('no muta el bloque original', () => {
    const original = bloque({ id: 'a', duracion_min: 60 })
    aplicarCambioTiempo([original], 'a', 'inicio', 480)
    expect(original.hora_inicio_fija).toBeUndefined()
    expect(original.es_anclado).toBe(false)
  })
})

// ── duracionTotalDia ──────────────────────────────────────────────────────────
describe('duracionTotalDia', () => {
  it('suma solo bloques no paralelos y sin padre', () => {
    const total = duracionTotalDia([
      bloque({ id: 'a', duracion_min: 60 }),
      bloque({ id: 'b', duracion_min: 30, es_paralelo: true }), // excluido
      bloque({ id: 'c', duracion_min: 45, padre_id: 'a' }),     // excluido (hijo)
      bloque({ id: 'd', duracion_min: 20 }),
    ])
    expect(total).toBe(80) // 60 + 20
  })

  it('lista vacía → 0', () => {
    expect(duracionTotalDia([])).toBe(0)
  })
})

// ── resolverHoraLlamado ───────────────────────────────────────────────────────
function rodaje(overrides: Partial<Rodaje> = {}): Rodaje {
  return {
    id: 'r',
    nombre: 'Rodaje',
    fecha_confirmada: false,
    estado: 'borrador',
    visibilidad_plan: 'completo',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function persona(overrides: Partial<RodajeEquipoTecnico> = {}): RodajeEquipoTecnico {
  return {
    id: 'p',
    rodaje_id: 'r',
    nombre: 'Persona',
    es_jefe_departamento: false,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('resolverHoraLlamado', () => {
  it('prioridad 1: hora individual', () => {
    const p = persona({
      hora_llamado_individual: '07:00',
      departamento: { id: 'd', rodaje_id: 'r', nombre: 'Dep', orden: 0, hora_llamado: '08:00' },
    })
    expect(resolverHoraLlamado(p, rodaje({ hora_llamado_general: '09:00' }))).toBe('07:00')
  })

  it('prioridad 2: hora del departamento', () => {
    const p = persona({
      departamento: { id: 'd', rodaje_id: 'r', nombre: 'Dep', orden: 0, hora_llamado: '08:00' },
    })
    expect(resolverHoraLlamado(p, rodaje({ hora_llamado_general: '09:00' }))).toBe('08:00')
  })

  it('prioridad 3: hora general del rodaje', () => {
    expect(resolverHoraLlamado(persona(), rodaje({ hora_llamado_general: '09:00' }))).toBe('09:00')
  })

  it('sin ninguna → undefined', () => {
    expect(resolverHoraLlamado(persona(), rodaje())).toBeUndefined()
  })
})

// ── formatHora ────────────────────────────────────────────────────────────────
describe('formatHora', () => {
  it('recorta a HH:MM', () => {
    expect(formatHora('08:30:00')).toBe('08:30')
  })

  it('undefined → guion', () => {
    expect(formatHora(undefined)).toBe('—')
  })
})
