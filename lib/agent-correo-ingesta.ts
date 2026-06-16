/**
 * agent-correo-ingesta.ts — Pipeline puro de clasificación/dedup de documentos
 * tributarios (boletas/facturas del correo o del SII) para la ingesta del agente.
 *
 * Sin I/O: no toca DB, no llama a red, no lee env vars.
 * Testeable en aislamiento con vitest.
 */

import { formatCLP } from '@/lib/cotizaciones-calc'

// ── Tipos base ────────────────────────────────────────────────────────────────

/** Documento tributario ya parseado (salida de parsearFacturaSII + tipo inferido). */
export interface DocumentoParsado {
  rut_emisor: string | null
  razon_social: string | null
  folio: string | null
  fecha: string | null          // DD/MM/YYYY o YYYY-MM-DD (ambos aceptados)
  monto: number | null
  tipo_doc: TipoDocumento
}

export type TipoDocumento =
  | 'boleta'
  | 'factura'
  | 'boleta_consumo'
  | 'exenta'
  | 'nota_credito'
  | 'sin_documento'

/** Resultado del pipeline para un documento. */
export type EstadoDedup = 'nuevo' | 'ya_existe' | 'dudoso'

export interface ClasificacionDocumento {
  /** Clave de dedup global: RUT + folio (sin espacios, minúsculas). Null si falta alguno. */
  clave_dedup: string | null
  estado_dedup: EstadoDedup
  /** Destino propuesto: 'mensual' si no se puede vincular a proyecto; siempre se confirma. */
  origen_propuesto: 'mensual' | 'proyecto_manual'
  /** Categoría sugerida para origen mensual. Heurística simple sobre razón social. */
  categoria_sugerida: string | null
  /** Mensaje al humano si el estado es 'dudoso'. */
  motivo_duda: string | null
  /** Fecha normalizada a YYYY-MM-DD; null si no se pudo parsear. */
  fecha_normalizada: string | null
  /** Período YYYY-MM derivado de fecha_normalizada; null si no disponible. */
  periodo_sugerido: string | null
  /** Monto tal como vino del parser (bruto). */
  monto: number | null
  /** El documento original para referencia. */
  documento: DocumentoParsado
}

// ── Clave de dedup ────────────────────────────────────────────────────────────

/**
 * Construye la clave de dedup: `${rut_normalizado}::${folio}`.
 * Ambos valores deben estar presentes; si alguno es null/vacío devuelve null.
 * El RUT se normaliza removiendo puntos/guiones para comparación robusta.
 */
export function construirClaveDedup(
  rut_emisor: string | null | undefined,
  folio: string | null | undefined,
): string | null {
  const rut = (rut_emisor ?? '').replace(/[.\-\s]/g, '').toLowerCase().trim()
  const fol = (folio ?? '').trim()
  if (!rut || !fol) return null
  return `${rut}::${fol}`
}

// ── Normalización de fecha ────────────────────────────────────────────────────

/**
 * Normaliza una fecha DD/MM/YYYY o YYYY-MM-DD a YYYY-MM-DD.
 * Devuelve null si no reconoce el formato.
 */
export function normalizarFecha(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  // DD/MM/YYYY o DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // YYYY-MM-DD ya en formato correcto
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

/** Extrae el período YYYY-MM de una fecha YYYY-MM-DD. */
export function periodoDesFecha(fechaIso: string | null): string | null {
  if (!fechaIso) return null
  return fechaIso.slice(0, 7)
}

// ── Categoría sugerida ─────────────────────────────────────────────────────────

/**
 * Heurística simple: dada la razón social del emisor, sugiere una categoría
 * para gastos mensuales. La lógica es MERAMENTE orientativa; el humano decide.
 *
 * Mapa de palabras clave → categoría (primera que coincide, case-insensitive).
 */
const MAPA_HEURISTICA: Array<{ palabras: string[]; categoria: string }> = [
  { palabras: ['copec', 'shell', 'petrobras', 'bencina', 'combustible'], categoria: 'Transporte' },
  { palabras: ['uber', 'cabify', 'transfer', 'transfer', 'taxi', 'bus', 'metro'], categoria: 'Transporte' },
  { palabras: ['unimarc', 'jumbo', 'lider', 'walmart', 'santa isabel', 'supermercado'], categoria: 'Alimentación' },
  { palabras: ['rappi', 'pedidosya', 'uber eats', 'delivery'], categoria: 'Alimentación' },
  { palabras: ['netflix', 'spotify', 'adobe', 'google', 'microsoft', 'dropbox', 'slack', 'zoom', 'notion', 'figma'], categoria: 'Suscripciones' },
  { palabras: ['stationery', 'papeleria', 'papelería', 'imprenta', 'office'], categoria: 'Artículos de oficina' },
  { palabras: ['honor', 'honorario', 'prestación', 'servicio profesional'], categoria: 'Honorarios' },
]

export function sugerirCategoria(razon_social: string | null | undefined): string | null {
  if (!razon_social) return null
  const lower = razon_social.toLowerCase()
  for (const entry of MAPA_HEURISTICA) {
    if (entry.palabras.some((p) => lower.includes(p))) return entry.categoria
  }
  return null
}

// ── Pipeline principal ────────────────────────────────────────────────────────

export interface PipelineInput {
  documento: DocumentoParsado
  /** Claves ya existentes en DB (RUT::folio). Puede ser un Set para O(1). */
  clavesExistentes: Set<string>
  /** Si el documento puede vincularse a un proyecto concreto (lógica externa). */
  tieneProyecto?: boolean
}

/**
 * Clasifica un documento parseado:
 * 1. Construye clave de dedup RUT+folio.
 * 2. Detecta si ya existe (ya_existe), si es nuevo, o si es dudoso.
 * 3. Propone origen (mensual / proyecto_manual).
 * 4. Sugiere categoría y período.
 *
 * No escribe en DB. El caller decide qué hacer con el resultado.
 */
export function clasificarDocumento(input: PipelineInput): ClasificacionDocumento {
  const { documento, clavesExistentes, tieneProyecto = false } = input

  const clave_dedup = construirClaveDedup(documento.rut_emisor, documento.folio)
  const fecha_normalizada = normalizarFecha(documento.fecha)
  const periodo_sugerido = periodoDesFecha(fecha_normalizada)
  const categoria_sugerida = sugerirCategoria(documento.razon_social)

  // ── Dedup ──────────────────────────────────────────────────────────────────
  let estado_dedup: EstadoDedup
  let motivo_duda: string | null = null

  if (clave_dedup && clavesExistentes.has(clave_dedup)) {
    estado_dedup = 'ya_existe'
  } else if (!clave_dedup) {
    // Sin clave de dedup: el documento no tiene RUT o folio identificable.
    // Es dudoso porque no podemos garantizar que no sea un duplicado.
    estado_dedup = 'dudoso'
    const faltante = !documento.rut_emisor && !documento.folio
      ? 'RUT y folio'
      : !documento.rut_emisor
        ? 'RUT del emisor'
        : 'folio del documento'
    motivo_duda = `No se pudo armar clave de dedup: falta ${faltante}. Verificar manualmente.`
  } else if (!documento.monto || documento.monto <= 0) {
    estado_dedup = 'dudoso'
    motivo_duda = 'El monto parseado es nulo o cero. Revisar el PDF manualmente.'
  } else {
    estado_dedup = 'nuevo'
  }

  // ── Origen propuesto ────────────────────────────────────────────────────────
  // Por defecto: mensual. Si se detecta que el documento tiene proyecto asociado
  // (lógica externa, p.ej. el asunto del correo menciona un número de cotización),
  // se marca como proyecto_manual para que el humano confirme el item_id.
  const origen_propuesto: 'mensual' | 'proyecto_manual' = tieneProyecto
    ? 'proyecto_manual'
    : 'mensual'

  return {
    clave_dedup,
    estado_dedup,
    origen_propuesto,
    categoria_sugerida,
    motivo_duda,
    fecha_normalizada,
    periodo_sugerido,
    monto: documento.monto,
    documento,
  }
}

/**
 * Procesa un lote de documentos en orden, acumulando las claves ya vistas en
 * este mismo lote para detectar duplicados DENTRO del lote (además de los
 * existentes en DB).
 *
 * Útil para procesar un correo con múltiples adjuntos sin cargar nada dos veces.
 */
export function clasificarLote(
  documentos: DocumentoParsado[],
  clavesEnDB: Set<string>,
  tieneProyecto: (doc: DocumentoParsado) => boolean = () => false,
): ClasificacionDocumento[] {
  const clavesVistas = new Set<string>(clavesEnDB)
  const resultados: ClasificacionDocumento[] = []

  for (const doc of documentos) {
    const resultado = clasificarDocumento({
      documento: doc,
      clavesExistentes: clavesVistas,
      tieneProyecto: tieneProyecto(doc),
    })
    // Si es nuevo y tiene clave, la marcamos como vista para los siguientes del lote.
    if (resultado.estado_dedup === 'nuevo' && resultado.clave_dedup) {
      clavesVistas.add(resultado.clave_dedup)
    }
    resultados.push(resultado)
  }

  return resultados
}
