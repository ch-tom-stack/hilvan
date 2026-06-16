// propuestas/01-proyeccion-caja/logica.ts
//
// LÓGICA PURA de la proyección de caja. Sin I/O, sin Supabase, sin Next.js.
// Todos los cálculos y el ordenamiento van aquí para poder testearlos en aislamiento.
//
// La capa de I/O (armar los movimientos desde la DB) va en route.draft.ts.

import { formatCLP } from '@/lib/cotizaciones-calc'

// ── Tipos públicos ─────────────────────────────────────────────────────────────

/** Un movimiento futuro (entrada o salida) con fecha y concepto. */
export interface MovimientoProyectado {
  /** Fecha del movimiento en YYYY-MM-DD. */
  fecha: string
  /** Monto en CLP (siempre positivo). */
  monto: number
  /** 'entrada' suma al saldo; 'salida' resta. */
  tipo: 'entrada' | 'salida'
  /** Descripción legible (nombre de cotización, crédito, proveedor, etc.). */
  concepto: string
  /** Categoría de la fuente para agrupamiento/diagnóstico. */
  categoria: 'cobro_cotizacion' | 'cuota_credito' | 'nomina' | 'gasto_por_pagar' | 'cobro_aprobado'
  /** true si la fecha es estimada (plazo supuesto), false si es exacta. */
  fecha_estimada: boolean
}

/** Un punto en la línea de tiempo del saldo proyectado. */
export interface PuntoSaldo {
  /** Fecha YYYY-MM-DD (puede ser el día de inicio + movimientos). */
  fecha: string
  /** Movimientos que ocurren ese día. */
  movimientos: MovimientoProyectado[]
  /** Saldo corriente al final del día (saldo anterior + entradas − salidas). */
  saldo: number
  /** true si este punto o cualquiera previo cruzó a negativo por primera vez. */
  en_rojo: boolean
}

/** Supuestos explícitos bajo los cuales se calculó la proyección. */
export interface Supuestos {
  saldo_inicial: number
  horizonte_dias: number
  /** Días desde fecha_factura_emitida que se asume tardará el cobro. */
  plazo_cobro_dias: number
  /** Días desde fecha_factura para cotizaciones aprobadas sin factura (más incierto). */
  plazo_cobro_aprobado_dias: number
  /** Día del mes en que se paga la nómina (1-31). */
  dia_pago_nomina: number
  /** Monto mensual total de nómina (suma de personas). */
  monto_nomina_mensual: number
  /** Días estimados hasta pago de gastos por pagar sin fecha exacta. */
  dias_pago_gasto_pendiente: number
}

/** Resultado completo de la proyección. */
export interface ResultadoProyeccion {
  supuestos: Supuestos
  linea_tiempo: PuntoSaldo[]
  /** Primera fecha en que el saldo cruza a negativo (null si nunca ocurre). */
  primera_fecha_negativa: string | null
  /** Saldo mínimo proyectado en el horizonte. */
  saldo_minimo: number
  /** Fecha del saldo mínimo. */
  fecha_saldo_minimo: string
  /** Saldo al final del horizonte. */
  saldo_final: number
  totales: {
    entradas: number
    salidas: number
    neto: number
  }
  /** Resumen legible para el agente. */
  resumen_texto: string
}

// ── Lógica principal ───────────────────────────────────────────────────────────

/**
 * Proyecta el saldo de caja a partir de un saldo inicial y una lista de
 * movimientos futuros con fecha. Devuelve la línea de tiempo ordenada por fecha,
 * el saldo corriente en cada punto, y la primera fecha en que cae a negativo.
 *
 * Reglas:
 * - Solo incluye movimientos dentro del horizonte (fecha ≤ fecha_limite).
 * - Los movimientos del mismo día se procesan en un solo punto (suma de entradas/salidas).
 * - El saldo inicial se registra como punto inicial (sin movimientos).
 * - La función es determinista y no hace round-trips a DB.
 */
export function proyectarCaja(input: {
  saldoInicial: number
  movimientos: MovimientoProyectado[]
  horizonteDias: number
  supuestos: Supuestos
  hoy?: string // YYYY-MM-DD; default = fecha real hoy
}): ResultadoProyeccion {
  const hoy = input.hoy ?? new Date().toISOString().slice(0, 10)
  const fechaLimite = agregarDiasAFecha(hoy, input.horizonteDias)

  // Filtrar solo movimientos dentro del horizonte.
  const movsDentro = input.movimientos.filter(
    (m) => m.fecha >= hoy && m.fecha <= fechaLimite,
  )

  // Agrupar por fecha.
  const porFecha = new Map<string, MovimientoProyectado[]>()
  for (const m of movsDentro) {
    const arr = porFecha.get(m.fecha) ?? []
    arr.push(m)
    porFecha.set(m.fecha, arr)
  }

  // Ordenar fechas con movimientos.
  const fechasOrdenadas = Array.from(porFecha.keys()).sort()

  let saldoActual = input.saldoInicial
  let primeraFechaNegativa: string | null = null
  const lineaTiempo: PuntoSaldo[] = []

  // Punto inicial (saldo de partida, sin movimientos).
  lineaTiempo.push({
    fecha: hoy,
    movimientos: [],
    saldo: saldoActual,
    en_rojo: saldoActual < 0,
  })
  if (saldoActual < 0 && primeraFechaNegativa === null) {
    primeraFechaNegativa = hoy
  }

  for (const fecha of fechasOrdenadas) {
    // Evitar duplicar el punto inicial si hay movimientos en hoy.
    if (fecha === hoy && lineaTiempo.length > 0) {
      // Procesar movimientos de hoy sobre el punto inicial.
      const movs = porFecha.get(fecha) ?? []
      const entradas = movs.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.monto, 0)
      const salidas = movs.filter((m) => m.tipo === 'salida').reduce((s, m) => s + m.monto, 0)
      saldoActual = saldoActual + entradas - salidas
      // Actualizar el punto inicial en lugar de crear uno nuevo.
      lineaTiempo[0].movimientos = movs
      lineaTiempo[0].saldo = saldoActual
      lineaTiempo[0].en_rojo = saldoActual < 0
      if (saldoActual < 0 && primeraFechaNegativa === null) {
        primeraFechaNegativa = fecha
      }
      continue
    }

    const movs = porFecha.get(fecha) ?? []
    const entradas = movs.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.monto, 0)
    const salidas = movs.filter((m) => m.tipo === 'salida').reduce((s, m) => s + m.monto, 0)
    saldoActual = saldoActual + entradas - salidas

    const enRojo = saldoActual < 0
    if (enRojo && primeraFechaNegativa === null) {
      primeraFechaNegativa = fecha
    }

    lineaTiempo.push({
      fecha,
      movimientos: movs,
      saldo: saldoActual,
      en_rojo: enRojo,
    })
  }

  // Propagar en_rojo hacia adelante: una vez cruzado a negativo, todos
  // los puntos posteriores están "en rojo" aunque el saldo suba.
  if (primeraFechaNegativa !== null) {
    let seVioRojo = false
    for (const p of lineaTiempo) {
      if (p.fecha >= primeraFechaNegativa) seVioRojo = true
      if (seVioRojo) p.en_rojo = true
    }
  }

  // Totales globales.
  const totalEntradas = movsDentro
    .filter((m) => m.tipo === 'entrada')
    .reduce((s, m) => s + m.monto, 0)
  const totalSalidas = movsDentro
    .filter((m) => m.tipo === 'salida')
    .reduce((s, m) => s + m.monto, 0)

  // Saldo mínimo y su fecha.
  let saldoMinimo = input.saldoInicial
  let fechaSaldoMinimo = hoy
  for (const p of lineaTiempo) {
    if (p.saldo < saldoMinimo) {
      saldoMinimo = p.saldo
      fechaSaldoMinimo = p.fecha
    }
  }

  const saldoFinal = lineaTiempo[lineaTiempo.length - 1]?.saldo ?? input.saldoInicial

  // Texto de resumen para que el agente lo narre.
  const resumen = construirResumenTexto({
    supuestos: input.supuestos,
    primeraFechaNegativa,
    saldoFinal,
    saldoMinimo,
    fechaSaldoMinimo,
    totalEntradas,
    totalSalidas,
    horizonteDias: input.horizonteDias,
  })

  return {
    supuestos: input.supuestos,
    linea_tiempo: lineaTiempo,
    primera_fecha_negativa: primeraFechaNegativa,
    saldo_minimo: saldoMinimo,
    fecha_saldo_minimo: fechaSaldoMinimo,
    saldo_final: saldoFinal,
    totales: {
      entradas: totalEntradas,
      salidas: totalSalidas,
      neto: totalEntradas - totalSalidas,
    },
    resumen_texto: resumen,
  }
}

// ── Helpers de fecha ───────────────────────────────────────────────────────────

/**
 * Agrega N días a una fecha YYYY-MM-DD sin corrimiento por UTC.
 * Usa el truco T12: concatenar 'T12:00:00' para anclar al mediodía local.
 */
export function agregarDiasAFecha(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Dado un día del mes (1-31) y un mes de referencia YYYY-MM, devuelve la fecha
 * YYYY-MM-DD correspondiente dentro de ese mes (topado al último día del mes).
 */
export function fechaEnMes(mes: string, diaMes: number): string {
  const [y, m] = mes.split('-').map(Number)
  const ultimoDia = new Date(y, m, 0).getDate() // getDate del día 0 del mes siguiente
  const dia = Math.min(diaMes, ultimoDia)
  return `${mes}-${String(dia).padStart(2, '0')}`
}

/**
 * Genera las fechas de pago de nómina para todos los meses dentro de un horizonte.
 * Retorna las fechas YYYY-MM-DD ordenadas que estén entre hoy y fechaLimite (inclusive).
 */
export function fechasNominaEnHorizonte(
  hoy: string,
  fechaLimite: string,
  diaMes: number,
): string[] {
  const fechas: string[] = []
  // Iterar mes a mes desde el mes de hoy hasta el mes de fechaLimite.
  const [yInicio, mInicio] = hoy.split('-').map(Number)
  const [yFin, mFin] = fechaLimite.split('-').map(Number)

  let y = yInicio
  let m = mInicio
  while (y < yFin || (y === yFin && m <= mFin)) {
    const mes = `${y}-${String(m).padStart(2, '0')}`
    const fecha = fechaEnMes(mes, diaMes)
    if (fecha >= hoy && fecha <= fechaLimite) {
      fechas.push(fecha)
    }
    // Avanzar un mes.
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return fechas
}

// ── Resumen textual ────────────────────────────────────────────────────────────

function fmtFecha(iso: string): string {
  // Formatea YYYY-MM-DD como "D de MES de AÑO" en español.
  const [y, m, d] = iso.split('-').map(Number)
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  return `${d} de ${meses[m - 1]} de ${y}`
}

function construirResumenTexto(input: {
  supuestos: Supuestos
  primeraFechaNegativa: string | null
  saldoFinal: number
  saldoMinimo: number
  fechaSaldoMinimo: string
  totalEntradas: number
  totalSalidas: number
  horizonteDias: number
}): string {
  const partes: string[] = []

  partes.push(
    `Proyección a ${input.horizonteDias} días bajo estos supuestos: ` +
      `saldo inicial ${formatCLP(input.supuestos.saldo_inicial)}, ` +
      `cobro de facturas a ${input.supuestos.plazo_cobro_dias} días desde emisión, ` +
      `nómina el día ${input.supuestos.dia_pago_nomina} de cada mes (${formatCLP(input.supuestos.monto_nomina_mensual)}/mes).`,
  )

  partes.push(
    `Entradas esperadas: ${formatCLP(input.totalEntradas)} · ` +
      `Salidas esperadas: ${formatCLP(input.totalSalidas)} · ` +
      `Saldo final proyectado: ${formatCLP(input.saldoFinal)}.`,
  )

  if (input.primeraFechaNegativa !== null) {
    partes.push(
      `⚠️ ALERTA: el saldo se proyecta negativo a partir del ${fmtFecha(input.primeraFechaNegativa)} ` +
        `(mínimo ${formatCLP(input.saldoMinimo)} el ${fmtFecha(input.fechaSaldoMinimo)}).`,
    )
  } else {
    partes.push(
      `El saldo se mantiene positivo durante todo el horizonte ` +
        `(mínimo ${formatCLP(input.saldoMinimo)} el ${fmtFecha(input.fechaSaldoMinimo)}).`,
    )
  }

  partes.push(
    'IMPORTANTE: esta proyección es estimada. Para mejorar su precisión: ' +
      '(1) mantener el saldo inicial sincronizado con la caja real, ' +
      '(2) registrar plazos de cobro por cliente, ' +
      '(3) registrar fecha estimada de pago en cada gasto pendiente.',
  )

  return partes.join(' ')
}
