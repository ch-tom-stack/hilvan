/**
 * propuestas/04-compliance-anomalias/logica.ts
 *
 * Framework extensible de reglas de control para el auditor silencioso.
 * PURO: sin acceso a DB, sin side-effects — dado un dataset devuelve hallazgos.
 * Testeable con fixtures en logica.test.ts.
 *
 * ## Cómo agregar una regla nueva
 * 1. Define los datos que necesita en el tipo de input de tu función.
 * 2. Implementa una función `regla_NOMBRE(input): Hallazgo[]` siguiendo el
 *    patrón de las existentes (ver REGLAS.md o INCORPORACION.md).
 * 3. Agrega la función al array `REGLAS` al final, junto con un `id` y `titulo`.
 * 4. El route la corre automáticamente si está en ese array.
 */

// ─── Tipos canónicos del framework ───────────────────────────────────────────

export type Severidad = 'alta' | 'media' | 'info'

/** Un hallazgo individual generado por una regla. */
export interface Hallazgo {
  /** Identificador de la regla que lo generó (ej. "sin_documento"). */
  regla: string
  severidad: Severidad
  /** Descripción legible por humanos, en español. */
  descripcion: string
  /** Monto involucrado, si aplica (en CLP). */
  monto?: number
  /** Referencia al objeto: ID del gasto, cotización, colaborador, etc. */
  referencia: string
  /** Metadatos adicionales (tipo, origen, etc.) */
  meta?: Record<string, unknown>
}

/** Resultado de aplicar todas las reglas al dataset completo. */
export interface ResultadoAuditoria {
  alta: Hallazgo[]
  media: Hallazgo[]
  info: Hallazgo[]
  /** Total de hallazgos (todas las severidades). */
  total: number
  /** Timestamp ISO del momento en que se calculó. */
  calculado_en: string
}

/** Definición de una regla de control (para registrarla en el array REGLAS). */
export interface ReglaControl<TInput> {
  /** Identificador único (snake_case). */
  id: string
  /** Título corto para mostrar en UI. */
  titulo: string
  /** Descripción de qué detecta y por qué importa. */
  descripcion: string
  /** Función pura: dado el input, devuelve hallazgos (puede devolver []). */
  detectar: (input: TInput) => Hallazgo[]
}

// ─── Tipos de input para cada regla ──────────────────────────────────────────

/** Gasto unificado (proyecto o mensual). */
export interface GastoAudit {
  id: string
  origen: 'proyecto' | 'mensual'
  /** null o 'sin_documento' = sin respaldo tributario. */
  tipo_documento: string | null
  /** null o '' = folio faltante. */
  folio: string | null
  rut_emisor: string | null
  razon_social_emisor: string | null
  monto: number
  fecha_documento: string | null
  /** Contexto: número de cotización (proyecto) o periodo YYYY-MM (mensual). */
  contexto: string | null
  descripcion: string | null
  /** true = sin respaldo aceptado a propósito → baja de alta a info. */
  sin_documento_aceptado: boolean
  /** true = parte de una factura que cubre varias cotizaciones → no es duplicado. */
  folio_compartido: boolean
  /** número de invoice de proveedor extranjero sin folio chileno (resuelve folio faltante). */
  referencia_externa: string | null
}

/** Cotización con estado y fechas clave. */
export interface CotizacionAudit {
  id: string
  numero: string | null
  cliente: string | null
  estado: string
  monto: number
  /** Fecha en que el cliente la aprobó. */
  fecha_respuesta_cliente: string | null
  /** null si no se ha facturado aún. */
  fecha_factura_emitida: string | null
  /** null si no se ha recibido el pago. Es la señal de "cobrado" en Hilván. */
  fecha_pago_recibido: string | null
  /** Si tiene rodaje vinculado. */
  tiene_rodaje: boolean
}

/** Colaborador con sus contratos generados. */
export interface ColaboradorAudit {
  id: string
  nombre: string
  /** true si la empresa firmó marco con este colaborador. */
  contrato_marco: boolean
  /** Contratos generados en el sistema. */
  contratos: {
    id: string
    tipo: string
    firmado: boolean
    created_at: string
  }[]
  /** true si completó onboarding (hay link used_at). */
  onboarding_completado: boolean
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Días entre dos fechas YYYY-MM-DD o ISO (positivo si a < b). */
export function diasEntre(a: string, b: string): number {
  // Usar T12:00:00 para evitar corrimiento por UTC (patrón del repo).
  const da = new Date(a.slice(0, 10) + 'T12:00:00')
  const db = new Date(b.slice(0, 10) + 'T12:00:00')
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

/** Agrupa hallazgos por regla para estadísticas. */
export function agruparPorRegla(hallazgos: Hallazgo[]): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const h of hallazgos) acc[h.regla] = (acc[h.regla] ?? 0) + 1
  return acc
}

/** Convierte un array de hallazgos en ResultadoAuditoria. */
export function construirResultado(hallazgos: Hallazgo[]): ResultadoAuditoria {
  return {
    alta: hallazgos.filter((h) => h.severidad === 'alta'),
    media: hallazgos.filter((h) => h.severidad === 'media'),
    info: hallazgos.filter((h) => h.severidad === 'info'),
    total: hallazgos.length,
    calculado_en: new Date().toISOString(),
  }
}

// ─── REGLA 1: Gastos sin documento ───────────────────────────────────────────

/**
 * Detecta gastos cuyo tipo_documento es 'sin_documento', null o vacío.
 * Severidad ALTA porque no tienen respaldo tributario (SII / deducción IVA).
 */
export function regla_sin_documento(gastos: GastoAudit[]): Hallazgo[] {
  return gastos
    .filter(
      (g) =>
        !g.tipo_documento ||
        g.tipo_documento.trim() === '' ||
        g.tipo_documento === 'sin_documento',
    )
    .map((g) => ({
      regla: 'sin_documento',
      // #1: si se aceptó a propósito (sin_documento_aceptado), baja de alta a info.
      severidad: (g.sin_documento_aceptado ? 'info' : 'alta') as Severidad,
      descripcion: `Gasto sin documento tributario${g.sin_documento_aceptado ? ' (aceptado a propósito)' : ''}${g.descripcion ? ` — "${g.descripcion}"` : ''}${g.contexto ? ` (${g.contexto})` : ''}`,
      monto: g.monto,
      referencia: g.id,
      meta: { origen: g.origen, contexto: g.contexto, aceptado: g.sin_documento_aceptado },
    }))
}

// ─── REGLA 2: Gastos con folio faltante ───────────────────────────────────────

/**
 * Detecta gastos con documento (boleta/factura/etc.) pero sin folio registrado.
 * Sin folio no se puede deduplicar ni cuadrar con el RCV del SII.
 * Solo aplica a documentos que DEBEN tener folio (boleta, factura, boleta_consumo, exenta).
 */
const TIPOS_CON_FOLIO = new Set(['boleta', 'factura', 'boleta_consumo', 'exenta'])

export function regla_folio_faltante(gastos: GastoAudit[]): Hallazgo[] {
  return gastos
    .filter(
      (g) =>
        g.tipo_documento &&
        TIPOS_CON_FOLIO.has(g.tipo_documento) &&
        (!g.folio || g.folio.trim() === '') &&
        // #4: un proveedor extranjero sin folio chileno se resuelve con su invoice propio.
        !(g.referencia_externa && g.referencia_externa.trim() !== ''),
    )
    .map((g) => ({
      regla: 'folio_faltante',
      severidad: 'media' as Severidad,
      descripcion: `${g.tipo_documento} sin folio registrado${g.rut_emisor ? ` — ${g.rut_emisor}` : ''}${g.razon_social_emisor ? ` (${g.razon_social_emisor})` : ''}${g.contexto ? ` · ${g.contexto}` : ''}`,
      monto: g.monto,
      referencia: g.id,
      meta: {
        tipo_documento: g.tipo_documento,
        rut_emisor: g.rut_emisor,
        origen: g.origen,
      },
    }))
}

// ─── REGLA 3: Facturas emitidas sin cobrar (aging configurable) ───────────────

export interface InputAgingFacturas {
  cotizaciones: CotizacionAudit[]
  /** Días desde fecha_factura_emitida a partir de los cuales se alerta. */
  aging_dias: number
  hoy: string // YYYY-MM-DD
}

/**
 * Detecta cotizaciones facturadas (fecha_factura_emitida != null) sin pago
 * recibido que llevan más de `aging_dias` días pendientes.
 * Severidad: ALTA si aging > 2× umbral, MEDIA si > umbral.
 */
export function regla_factura_sin_cobrar(input: InputAgingFacturas): Hallazgo[] {
  const { cotizaciones, aging_dias, hoy } = input
  return cotizaciones
    // "Cobrado" en Hilván = fecha_pago_recibido seteada (NO un estado 'pagada').
    .filter((c) => c.fecha_factura_emitida !== null && c.fecha_pago_recibido === null)
    .flatMap((c) => {
      const dias = diasEntre(c.fecha_factura_emitida!, hoy)
      if (dias < aging_dias) return []
      const severidad: Severidad = dias >= aging_dias * 2 ? 'alta' : 'media'
      return [
        {
          regla: 'factura_sin_cobrar',
          severidad,
          descripcion: `Factura emitida hace ${dias} días sin pago${c.cliente ? ` — ${c.cliente}` : ''}${c.numero ? ` (${c.numero})` : ''}`,
          monto: c.monto,
          referencia: c.id,
          meta: {
            dias_aging: dias,
            numero: c.numero,
            cliente: c.cliente,
            fecha_factura_emitida: c.fecha_factura_emitida,
          },
        },
      ]
    })
}

// ─── REGLA 4: Posibles duplicados ─────────────────────────────────────────────

export interface InputDuplicados {
  gastos: GastoAudit[]
  /**
   * Ventana (días) para detectar el mismo RUT+monto como posible duplicado.
   * Default: 7 días.
   */
  ventana_dias?: number
}

/**
 * Detecta gastos posiblemente duplicados usando dos heurísticas:
 *   A) Mismo RUT + mismo folio → duplicado exacto (alta).
 *   B) Mismo RUT + mismo monto dentro de `ventana_dias` → sospechoso (media).
 * Solo produce cada par una vez (a < b por created_at / fecha_documento).
 */
export function regla_duplicados(input: InputDuplicados): Hallazgo[] {
  const { gastos, ventana_dias = 7 } = input
  const hallazgos: Hallazgo[] = []

  // ── A) Duplicado exacto: mismo RUT + mismo folio (excluye folio vacío) ───────
  const porRutFolio = new Map<string, GastoAudit[]>()
  for (const g of gastos) {
    if (!g.rut_emisor || !g.folio || g.folio.trim() === '') continue
    const key = `${g.rut_emisor.trim()}::${g.folio.trim()}`
    if (!porRutFolio.has(key)) porRutFolio.set(key, [])
    porRutFolio.get(key)!.push(g)
  }
  for (const [key, grupo] of porRutFolio) {
    if (grupo.length < 2) continue
    const [rut, folio] = key.split('::')
    const ids = grupo.map((g) => g.id)
    const suma = grupo.reduce((s, g) => s + g.monto, 0)
    // #2: si TODO el grupo está marcado folio_compartido, es UNA factura que cubre
    // varias cotizaciones (no un duplicado). Se reporta como info con la suma del
    // grupo, para verificar que coincide con el monto total de la factura.
    if (grupo.every((g) => g.folio_compartido)) {
      hallazgos.push({
        regla: 'factura_compartida',
        severidad: 'info',
        descripcion: `Factura compartida: RUT ${rut} folio ${folio} cubre ${grupo.length} gastos por un total de $${suma.toLocaleString('es-CL')}`,
        monto: suma,
        referencia: ids.join(','),
        meta: { rut_emisor: rut, folio, ids, suma },
      })
      continue
    }
    hallazgos.push({
      regla: 'duplicado_exacto',
      severidad: 'alta',
      descripcion: `Posible gasto duplicado: RUT ${rut} folio ${folio} aparece ${grupo.length} veces`,
      monto: suma,
      referencia: ids.join(','),
      meta: { rut_emisor: rut, folio, ids },
    })
  }

  // ── B) Misma RUT + mismo monto en ventana de días ────────────────────────────
  // Solo para gastos con RUT pero sin folio (los que ya tienen folio los cubre A).
  const sinFolio = gastos.filter(
    (g) => g.rut_emisor && (!g.folio || g.folio.trim() === ''),
  )
  // Agrupar por RUT
  const porRut = new Map<string, GastoAudit[]>()
  for (const g of sinFolio) {
    const rut = g.rut_emisor!.trim()
    if (!porRut.has(rut)) porRut.set(rut, [])
    porRut.get(rut)!.push(g)
  }
  for (const [rut, grupo] of porRut) {
    // Ordenar por fecha para comparar ventana
    const sorted = [...grupo].sort(
      (a, b) =>
        (a.fecha_documento ?? a.id).localeCompare(b.fecha_documento ?? b.id),
    )
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const ga = sorted[i]
        const gb = sorted[j]
        if (ga.monto !== gb.monto) continue
        const fechaA = ga.fecha_documento?.slice(0, 10) ?? null
        const fechaB = gb.fecha_documento?.slice(0, 10) ?? null
        if (!fechaA || !fechaB) continue
        const diff = Math.abs(diasEntre(fechaA, fechaB))
        if (diff > ventana_dias) break // sorted por fecha, los demás serán más lejanos
        hallazgos.push({
          regla: 'duplicado_sospechoso',
          severidad: 'media',
          descripcion: `Posible duplicado: RUT ${rut} monto $${ga.monto.toLocaleString('es-CL')} aparece ${diff === 0 ? 'el mismo día' : `con ${diff} días de diferencia`} sin folio`,
          monto: ga.monto,
          referencia: `${ga.id},${gb.id}`,
          meta: { rut_emisor: rut, ids: [ga.id, gb.id], dias_diferencia: diff },
        })
      }
    }
  }

  return hallazgos
}

// ─── REGLA 5: Colaboradores sin contrato firmado ──────────────────────────────

/**
 * Detecta colaboradores que:
 *   A) Tienen `contrato_marco=true` pero ningún contrato en `contratos_generados`
 *      con `firmado=true` → ALTA (falta firma).
 *   B) Tienen `contrato_marco=true` pero no han completado onboarding → MEDIA.
 * Un colaborador puede aparecer en ambos si tiene ambas anomalías.
 */
export function regla_sin_contrato(colaboradores: ColaboradorAudit[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = []

  for (const c of colaboradores) {
    // Solo auditamos colaboradores que requieren contrato marco.
    if (!c.contrato_marco) continue

    const hayFirmado = c.contratos.some((k) => k.firmado)
    if (!hayFirmado) {
      const hayGenerado = c.contratos.length > 0
      hallazgos.push({
        regla: 'sin_contrato_firmado',
        severidad: 'alta',
        descripcion: hayGenerado
          ? `Colaborador ${c.nombre} tiene contrato generado pero SIN firmar`
          : `Colaborador ${c.nombre} requiere contrato marco pero no tiene ninguno generado`,
        referencia: c.id,
        meta: { nombre: c.nombre, contratos_count: c.contratos.length },
      })
    }

    if (!c.onboarding_completado) {
      hallazgos.push({
        regla: 'onboarding_incompleto',
        severidad: 'media',
        descripcion: `Colaborador ${c.nombre} no completó el onboarding (ficha sin confirmar)`,
        referencia: c.id,
        meta: { nombre: c.nombre },
      })
    }
  }

  return hallazgos
}

// ─── REGLA 6: Cotizaciones aprobadas estancadas ───────────────────────────────

export interface InputCotizacionesEstancadas {
  cotizaciones: CotizacionAudit[]
  /** Días desde aprobación sin factura emitida para alertar. Default: 30. */
  dias_sin_factura: number
  /** Días adicionales con factura pero sin rodaje vinculado. Default: 14. */
  dias_sin_rodaje: number
  hoy: string // YYYY-MM-DD
}

/**
 * Detecta cotizaciones aprobadas o en producción que llevan demasiado tiempo
 * sin avanzar al siguiente paso:
 *   A) Aprobada hace > dias_sin_factura sin factura emitida → MEDIA.
 *   B) Aprobada hace > dias_sin_rodaje sin rodaje vinculado → INFO.
 */
export function regla_cotizacion_estancada(
  input: InputCotizacionesEstancadas,
): Hallazgo[] {
  const { cotizaciones, dias_sin_factura, dias_sin_rodaje, hoy } = input
  const hallazgos: Hallazgo[] = []

  for (const c of cotizaciones) {
    if (!['aprobada', 'en_produccion'].includes(c.estado)) continue
    const ref = c.fecha_respuesta_cliente
    if (!ref) continue
    const diasDesdeAprobacion = diasEntre(ref, hoy)

    // A) Sin factura emitida pasado el umbral
    if (!c.fecha_factura_emitida && diasDesdeAprobacion >= dias_sin_factura) {
      hallazgos.push({
        regla: 'cotizacion_sin_facturar',
        severidad: 'media',
        descripcion: `Cotización aprobada hace ${diasDesdeAprobacion} días sin factura emitida${c.cliente ? ` — ${c.cliente}` : ''}${c.numero ? ` (${c.numero})` : ''}`,
        monto: c.monto,
        referencia: c.id,
        meta: {
          dias_desde_aprobacion: diasDesdeAprobacion,
          numero: c.numero,
          cliente: c.cliente,
        },
      })
    }

    // B) Sin rodaje vinculado pasado el umbral (info)
    if (!c.tiene_rodaje && diasDesdeAprobacion >= dias_sin_rodaje) {
      hallazgos.push({
        regla: 'cotizacion_sin_rodaje',
        severidad: 'info',
        descripcion: `Cotización aprobada hace ${diasDesdeAprobacion} días sin rodaje vinculado${c.numero ? ` (${c.numero})` : ''}`,
        monto: c.monto,
        referencia: c.id,
        meta: {
          dias_desde_aprobacion: diasDesdeAprobacion,
          numero: c.numero,
          cliente: c.cliente,
          tiene_rodaje: c.tiene_rodaje,
        },
      })
    }
  }

  return hallazgos
}

// ─── ORQUESTADOR: aplica todas las reglas al dataset completo ─────────────────

export interface DatasetAuditoria {
  gastos: GastoAudit[]
  cotizaciones: CotizacionAudit[]
  colaboradores: ColaboradorAudit[]
  /** Configuración de umbrales (opcionales — usan defaults si no se pasan). */
  config: {
    aging_dias: number
    dias_sin_factura: number
    dias_sin_rodaje: number
    ventana_duplicados_dias: number
    hoy: string // YYYY-MM-DD
  }
}

/**
 * Punto de entrada principal: aplica las 6 reglas y devuelve los hallazgos
 * agrupados por severidad. El order dentro de cada grupo sigue el orden de
 * producción de las reglas (la más grave primero: sin_documento, duplicado, etc.)
 */
export function aplicarReglas(dataset: DatasetAuditoria): ResultadoAuditoria {
  const { gastos, cotizaciones, colaboradores, config } = dataset

  const todos: Hallazgo[] = [
    ...regla_sin_documento(gastos),
    ...regla_folio_faltante(gastos),
    ...regla_factura_sin_cobrar({
      cotizaciones,
      aging_dias: config.aging_dias,
      hoy: config.hoy,
    }),
    ...regla_duplicados({
      gastos,
      ventana_dias: config.ventana_duplicados_dias,
    }),
    ...regla_sin_contrato(colaboradores),
    ...regla_cotizacion_estancada({
      cotizaciones,
      dias_sin_factura: config.dias_sin_factura,
      dias_sin_rodaje: config.dias_sin_rodaje,
      hoy: config.hoy,
    }),
  ]

  return construirResultado(todos)
}
