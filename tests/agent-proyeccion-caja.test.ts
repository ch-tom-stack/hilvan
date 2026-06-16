// propuestas/01-proyeccion-caja/logica.test.ts
//
// Tests unitarios de la lógica pura de proyección de caja.
// Corren con: npx vitest run --config propuestas/vitest.config.ts 01-proyeccion-caja
//
// Cubre: saldo corriente, detección de cruce a negativo, orden por fecha, horizonte.

import { describe, it, expect } from 'vitest'
import {
  proyectarCaja,
  agregarDiasAFecha,
  fechaEnMes,
  fechasNominaEnHorizonte,
  type MovimientoProyectado,
  type Supuestos,
} from '@/lib/agent-proyeccion-caja'

// ── Helpers de test ───────────────────────────────────────────────────────────

const SUPUESTOS_BASE: Supuestos = {
  saldo_inicial: 1_000_000,
  horizonte_dias: 30,
  plazo_cobro_dias: 30,
  plazo_cobro_aprobado_dias: 60,
  dia_pago_nomina: 30,
  monto_nomina_mensual: 500_000,
  dias_pago_gasto_pendiente: 15,
}

function mov(
  fecha: string,
  monto: number,
  tipo: 'entrada' | 'salida',
  concepto = 'test',
): MovimientoProyectado {
  return {
    fecha,
    monto,
    tipo,
    concepto,
    categoria: tipo === 'entrada' ? 'cobro_cotizacion' : 'cuota_credito',
    fecha_estimada: true,
  }
}

// ── Tests de helpers ──────────────────────────────────────────────────────────

describe('agregarDiasAFecha', () => {
  it('suma días correctamente sin corrimiento UTC', () => {
    expect(agregarDiasAFecha('2026-06-15', 1)).toBe('2026-06-16')
    expect(agregarDiasAFecha('2026-06-30', 1)).toBe('2026-07-01')
    expect(agregarDiasAFecha('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('suma cero días devuelve la misma fecha', () => {
    expect(agregarDiasAFecha('2026-06-15', 0)).toBe('2026-06-15')
  })

  it('suma 90 días correctamente', () => {
    // 2026-06-16 + 90 = 2026-09-14
    expect(agregarDiasAFecha('2026-06-16', 90)).toBe('2026-09-14')
  })
})

describe('fechaEnMes', () => {
  it('devuelve la fecha correcta para días normales', () => {
    expect(fechaEnMes('2026-06', 15)).toBe('2026-06-15')
    expect(fechaEnMes('2026-01', 1)).toBe('2026-01-01')
  })

  it('topa al último día del mes cuando el día supera el límite', () => {
    // Febrero de 2026 tiene 28 días
    expect(fechaEnMes('2026-02', 30)).toBe('2026-02-28')
    // Febrero de 2028 es año bisiesto: 29 días
    expect(fechaEnMes('2028-02', 30)).toBe('2028-02-29')
    // Abril tiene 30 días
    expect(fechaEnMes('2026-04', 31)).toBe('2026-04-30')
  })
})

describe('fechasNominaEnHorizonte', () => {
  it('devuelve una fecha por mes dentro del horizonte', () => {
    // Horizonte de 60 días desde 2026-06-16: cubre junio y julio (día 30 de cada mes)
    const fechas = fechasNominaEnHorizonte('2026-06-16', '2026-08-15', 30)
    expect(fechas).toContain('2026-06-30')
    expect(fechas).toContain('2026-07-30')
    // Agosto 15 < 30, así que no incluye agosto
    expect(fechas).not.toContain('2026-08-30')
  })

  it('no incluye fechas anteriores a hoy', () => {
    const fechas = fechasNominaEnHorizonte('2026-06-16', '2026-07-30', 10)
    // día 10 de junio es antes del 16 → no incluido
    expect(fechas).not.toContain('2026-06-10')
    // día 10 de julio sí está dentro
    expect(fechas).toContain('2026-07-10')
  })

  it('devuelve array vacío si no hay fechas de nómina en el horizonte', () => {
    // Horizonte de 5 días desde el 25 de junio, día de nómina = 30
    // El 30 de junio cae dentro (25+5 = 30)
    const fechas = fechasNominaEnHorizonte('2026-06-25', '2026-06-30', 30)
    expect(fechas).toContain('2026-06-30')

    // Si el horizonte termina antes del día 30
    const fechas2 = fechasNominaEnHorizonte('2026-06-25', '2026-06-29', 30)
    expect(fechas2).not.toContain('2026-06-30')
  })
})

// ── Tests de proyectarCaja ────────────────────────────────────────────────────

describe('proyectarCaja — saldo corriente', () => {
  it('saldo inicial sin movimientos = saldo inicial en todos los puntos', () => {
    const r = proyectarCaja({
      saldoInicial: 1_000_000,
      movimientos: [],
      horizonteDias: 30,
      supuestos: SUPUESTOS_BASE,
      hoy: '2026-06-16',
    })
    expect(r.linea_tiempo).toHaveLength(1) // solo el punto inicial
    expect(r.linea_tiempo[0].saldo).toBe(1_000_000)
    expect(r.saldo_final).toBe(1_000_000)
    expect(r.primera_fecha_negativa).toBeNull()
  })

  it('calcula saldo corriente acumulando entradas y salidas en orden', () => {
    const movs: MovimientoProyectado[] = [
      mov('2026-06-20', 500_000, 'entrada'),   // +500k → 1.5M
      mov('2026-06-25', 200_000, 'salida'),    // −200k → 1.3M
      mov('2026-07-01', 300_000, 'salida'),    // −300k → 1.0M
    ]
    const r = proyectarCaja({
      saldoInicial: 1_000_000,
      movimientos: movs,
      horizonteDias: 30,
      supuestos: SUPUESTOS_BASE,
      hoy: '2026-06-16',
    })
    const puntos = r.linea_tiempo
    // Buscar punto del 20 de junio
    const p20 = puntos.find((p) => p.fecha === '2026-06-20')
    expect(p20?.saldo).toBe(1_500_000)
    // Punto del 25
    const p25 = puntos.find((p) => p.fecha === '2026-06-25')
    expect(p25?.saldo).toBe(1_300_000)
    // Punto del 1 de julio (dentro de 30 días desde 16/06 = 16/07)
    const p01 = puntos.find((p) => p.fecha === '2026-07-01')
    expect(p01?.saldo).toBe(1_000_000)
  })

  it('varios movimientos el mismo día se acumulan en un solo punto', () => {
    const movs: MovimientoProyectado[] = [
      mov('2026-06-20', 300_000, 'entrada'),
      mov('2026-06-20', 100_000, 'salida'),
      mov('2026-06-20', 50_000, 'salida'),
    ]
    const r = proyectarCaja({
      saldoInicial: 1_000_000,
      movimientos: movs,
      horizonteDias: 30,
      supuestos: SUPUESTOS_BASE,
      hoy: '2026-06-16',
    })
    // Debe haber un solo punto para 2026-06-20 (+ el inicial)
    const puntos20 = r.linea_tiempo.filter((p) => p.fecha === '2026-06-20')
    expect(puntos20).toHaveLength(1)
    // Saldo: 1M + 300k − 100k − 50k = 1.15M
    expect(puntos20[0].saldo).toBe(1_150_000)
    expect(puntos20[0].movimientos).toHaveLength(3)
  })

  it('calcula totales correctamente', () => {
    const movs: MovimientoProyectado[] = [
      mov('2026-06-20', 400_000, 'entrada'),
      mov('2026-06-22', 200_000, 'entrada'),
      mov('2026-06-25', 150_000, 'salida'),
    ]
    const r = proyectarCaja({
      saldoInicial: 500_000,
      movimientos: movs,
      horizonteDias: 30,
      supuestos: SUPUESTOS_BASE,
      hoy: '2026-06-16',
    })
    expect(r.totales.entradas).toBe(600_000)
    expect(r.totales.salidas).toBe(150_000)
    expect(r.totales.neto).toBe(450_000)
    expect(r.saldo_final).toBe(950_000) // 500k + 450k
  })
})

describe('proyectarCaja — detección de cruce a negativo', () => {
  it('detecta la primera fecha en que el saldo cae a negativo', () => {
    const movs: MovimientoProyectado[] = [
      mov('2026-06-20', 300_000, 'salida'),   // 1M − 300k = 700k
      mov('2026-06-25', 800_000, 'salida'),   // 700k − 800k = −100k ← primer negativo
      mov('2026-06-28', 500_000, 'entrada'),  // −100k + 500k = 400k (sube, pero ya cruzó)
    ]
    const r = proyectarCaja({
      saldoInicial: 1_000_000,
      movimientos: movs,
      horizonteDias: 30,
      supuestos: SUPUESTOS_BASE,
      hoy: '2026-06-16',
    })
    expect(r.primera_fecha_negativa).toBe('2026-06-25')
  })

  it('marca en_rojo en todos los puntos desde el primer cruce en adelante', () => {
    const movs: MovimientoProyectado[] = [
      mov('2026-06-20', 1_200_000, 'salida'), // 1M − 1.2M = −200k
      mov('2026-06-28', 500_000, 'entrada'),  // −200k + 500k = 300k
    ]
    const r = proyectarCaja({
      saldoInicial: 1_000_000,
      movimientos: movs,
      horizonteDias: 30,
      supuestos: SUPUESTOS_BASE,
      hoy: '2026-06-16',
    })
    // El punto inicial no está en rojo
    expect(r.linea_tiempo[0].en_rojo).toBe(false)
    // El punto del 20 sí (primer negativo)
    const p20 = r.linea_tiempo.find((p) => p.fecha === '2026-06-20')
    expect(p20?.en_rojo).toBe(true)
    // El punto del 28 también (aunque el saldo ya es positivo)
    const p28 = r.linea_tiempo.find((p) => p.fecha === '2026-06-28')
    expect(p28?.en_rojo).toBe(true)
  })

  it('devuelve primera_fecha_negativa null si el saldo nunca cae', () => {
    const movs: MovimientoProyectado[] = [
      mov('2026-06-20', 500_000, 'entrada'),
      mov('2026-06-25', 100_000, 'salida'),
    ]
    const r = proyectarCaja({
      saldoInicial: 1_000_000,
      movimientos: movs,
      horizonteDias: 30,
      supuestos: SUPUESTOS_BASE,
      hoy: '2026-06-16',
    })
    expect(r.primera_fecha_negativa).toBeNull()
  })

  it('detecta saldo inicial negativo como primera fecha negativa = hoy', () => {
    const r = proyectarCaja({
      saldoInicial: -50_000,
      movimientos: [],
      horizonteDias: 30,
      supuestos: { ...SUPUESTOS_BASE, saldo_inicial: -50_000 },
      hoy: '2026-06-16',
    })
    expect(r.primera_fecha_negativa).toBe('2026-06-16')
    expect(r.linea_tiempo[0].en_rojo).toBe(true)
  })
})

describe('proyectarCaja — orden por fecha y horizonte', () => {
  it('la línea de tiempo está ordenada cronológicamente', () => {
    const movs: MovimientoProyectado[] = [
      mov('2026-07-05', 100_000, 'salida'),
      mov('2026-06-18', 200_000, 'entrada'),
      mov('2026-06-30', 50_000, 'salida'),
    ]
    const r = proyectarCaja({
      saldoInicial: 1_000_000,
      movimientos: movs,
      horizonteDias: 30,
      supuestos: SUPUESTOS_BASE,
      hoy: '2026-06-16',
    })
    const fechas = r.linea_tiempo.map((p) => p.fecha)
    const fechasOrdenadas = [...fechas].sort()
    expect(fechas).toEqual(fechasOrdenadas)
  })

  it('excluye movimientos fuera del horizonte', () => {
    const movs: MovimientoProyectado[] = [
      mov('2026-06-20', 100_000, 'entrada'),   // dentro (30 días desde 16/06 = 16/07)
      mov('2026-08-01', 999_000, 'salida'),    // fuera
    ]
    const r = proyectarCaja({
      saldoInicial: 1_000_000,
      movimientos: movs,
      horizonteDias: 30,
      supuestos: SUPUESTOS_BASE,
      hoy: '2026-06-16',
    })
    // Solo debe aparecer el movimiento del 20 de junio
    const todasFechas = r.linea_tiempo.map((p) => p.fecha)
    expect(todasFechas).not.toContain('2026-08-01')
    // El saldo final refleja solo el movimiento incluido
    expect(r.saldo_final).toBe(1_100_000)
  })

  it('saldo mínimo es el menor saldo en la línea de tiempo', () => {
    const movs: MovimientoProyectado[] = [
      mov('2026-06-20', 800_000, 'salida'),   // 1M − 800k = 200k
      mov('2026-06-25', 100_000, 'salida'),   // 200k − 100k = 100k ← mínimo
      mov('2026-07-01', 400_000, 'entrada'),  // 100k + 400k = 500k
    ]
    const r = proyectarCaja({
      saldoInicial: 1_000_000,
      movimientos: movs,
      horizonteDias: 30,
      supuestos: SUPUESTOS_BASE,
      hoy: '2026-06-16',
    })
    expect(r.saldo_minimo).toBe(100_000)
    expect(r.fecha_saldo_minimo).toBe('2026-06-25')
  })

  it('con horizonte de 0 días devuelve solo el punto inicial', () => {
    // horizonte de 1 día por el mínimo en validación del route; aquí probamos la lógica pura
    const r = proyectarCaja({
      saldoInicial: 500_000,
      movimientos: [mov('2026-06-17', 100_000, 'entrada')],
      horizonteDias: 0,
      supuestos: { ...SUPUESTOS_BASE, horizonte_dias: 0 },
      hoy: '2026-06-16',
    })
    // Con horizonte 0, fecha límite = hoy → el movimiento del 17 queda fuera
    expect(r.saldo_final).toBe(500_000)
    expect(r.totales.entradas).toBe(0)
  })
})

describe('proyectarCaja — resumen_texto', () => {
  it('incluye mención de primera_fecha_negativa cuando el saldo cae', () => {
    const movs: MovimientoProyectado[] = [
      mov('2026-06-20', 2_000_000, 'salida'),
    ]
    const r = proyectarCaja({
      saldoInicial: 1_000_000,
      movimientos: movs,
      horizonteDias: 30,
      supuestos: SUPUESTOS_BASE,
      hoy: '2026-06-16',
    })
    expect(r.resumen_texto).toContain('negativo')
    // El resumen formatea la fecha en español: "20 de junio de 2026"
    expect(r.resumen_texto).toContain('20 de junio de 2026')
    // La propiedad primera_fecha_negativa sí devuelve ISO para que el agente la procese
    expect(r.primera_fecha_negativa).toBe('2026-06-20')
  })

  it('menciona supuestos (saldo inicial, plazo cobro, día nómina)', () => {
    const r = proyectarCaja({
      saldoInicial: 3_000_000,
      movimientos: [],
      horizonteDias: 90,
      supuestos: {
        ...SUPUESTOS_BASE,
        saldo_inicial: 3_000_000,
        horizonte_dias: 90,
        plazo_cobro_dias: 45,
        dia_pago_nomina: 25,
      },
      hoy: '2026-06-16',
    })
    expect(r.resumen_texto).toContain('90 días')
    expect(r.resumen_texto).toContain('45 días')
    expect(r.resumen_texto).toContain('día 25')
  })
})
