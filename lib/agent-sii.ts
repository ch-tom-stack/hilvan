// lib/agent-sii.ts
// Normalización PURA de los documentos que devuelve API Gateway (RCV compras +
// BHE recibidas del SII) al shape de "fila de gasto" que consume
// /api/agent/crear-gastos-bulk. SIN I/O: recibe el registro crudo del SII y
// devuelve una fila sugerida lista para que un humano la clasifique (origen,
// categoría o cotizacion_item_id) antes de cargar.
//
// IMPORTANTE: los nombres de campo de la respuesta de API Gateway/SII no están
// 100% confirmados (la doc es Swagger JS). El acceso es DEFENSIVO (probamos
// varias llaves comunes) y cada fila conserva `crudo` para fijar el mapeo con
// exactitud tras la primera corrida real. Ajustar las llaves aquí si hace falta.

/** Lee la primera llave existente de un objeto (case-insensitive, defensivo). */
function pick(obj: Record<string, any>, ...llaves: string[]): any {
  if (!obj) return undefined
  const lower: Record<string, any> = {}
  for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k]
  for (const llave of llaves) {
    const v = obj[llave] ?? lower[llave.toLowerCase()]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

/** Número defensivo: soporta "1.234.567", "1234,56", "$ 1.234" y number. */
export function numCL(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (v == null) return 0
  let s = String(v).trim().replace(/[^\d,.-]/g, '')
  // Formato es-CL: la coma es decimal y el punto es separador de miles. Si hay
  // coma, los puntos son miles; si NO hay coma, los puntos también son miles
  // (el CLP no usa decimales), así "1.234.567" → 1234567 y "1.234,56" → 1234.56.
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/\./g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/** Fecha SII → YYYY-MM-DD (acepta "2026-06-15", "15-06-2026", "2026/06/15", "20260615"). */
export function fechaISO(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/) // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/) // DD-MM-YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/) // YYYYMMDD
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

// Códigos DTE del SII que son exentos (sin IVA) → tipo_documento 'exenta'.
const DTE_EXENTOS = new Set([34, 41]) // 34 factura exenta, 41 BHE exenta (no aplica acá)

export interface FilaSugerida {
  fuente: 'rcv_compra' | 'bhe_recibida'
  // Campos que entiende crear-gastos-bulk:
  tipo_documento: 'factura' | 'exenta' | 'boleta'
  monto: number
  monto_es: 'neto' | 'bruto'
  rut_emisor: string | null
  razon_social_emisor: string | null
  folio: string | null
  fecha_documento: string | null
  // Sugerencia de descripción para el humano (no obligatoria en bulk):
  descripcion_sugerida: string
  // PENDIENTES de clasificación humana (no se rellenan aquí):
  //   origen ('mensual'|'proyecto'), categoria | cotizacion_item_id, periodo
  crudo: Record<string, any>
}

/** Normaliza un registro de RCV compras (factura recibida) a fila sugerida. */
export function normalizarCompra(rec: Record<string, any>): FilaSugerida {
  const dte = Number(pick(rec, 'dte', 'tipoDte', 'tipo_dte', 'TipoDTE', 'codigoTipoDte')) || 0
  const exenta = DTE_EXENTOS.has(dte)
  const total = numCL(pick(rec, 'montoTotal', 'monto_total', 'MntTotal', 'total'))
  const neto = numCL(pick(rec, 'montoNeto', 'monto_neto', 'MntNeto', 'neto'))
  const razon = pick(rec, 'razonSocial', 'razon_social', 'RznSoc', 'razonSocialEmisor') ?? null
  const rut = pick(rec, 'rutEmisor', 'rut_emisor', 'RUTEmisor', 'detRutDoc', 'rut') ?? null
  const folio = pick(rec, 'folio', 'Folio', 'nroDoc', 'detNroDoc') ?? null
  const fecha = fechaISO(pick(rec, 'fechaEmision', 'fecha_emision', 'FchEmis', 'detFchDoc', 'fecha'))
  // Para facturas se persiste el TOTAL (con IVA) como bruto; si no hay total, el neto.
  return {
    fuente: 'rcv_compra',
    tipo_documento: exenta ? 'exenta' : 'factura',
    monto: total > 0 ? total : neto,
    monto_es: 'bruto',
    rut_emisor: rut != null ? String(rut) : null,
    razon_social_emisor: razon != null ? String(razon) : null,
    folio: folio != null ? String(folio) : null,
    fecha_documento: fecha,
    descripcion_sugerida: razon ? String(razon) : `Factura ${folio ?? ''}`.trim(),
    crudo: rec,
  }
}

/** Normaliza una BHE recibida (boleta de honorarios de un tercero) a fila sugerida. */
export function normalizarBhe(rec: Record<string, any>): FilaSugerida {
  // Campos CONFIRMADOS de API Gateway (BHE recibidas):
  //   numero, rut, dv, nombre, fecha, total_honorarios (BRUTO), total_retencion,
  //   total_liquido, sociedad_profesional, comuna, estado, anulada, codigo.
  const bruto = numCL(pick(rec, 'total_honorarios', 'montoBruto', 'honorarios'))
  const liquido = numCL(pick(rec, 'total_liquido', 'montoLiquido', 'liquido'))
  const razon = pick(rec, 'nombre', 'nombreEmisor', 'razonSocial', 'razon_social') ?? null
  // El RUT viene partido en rut + dv → recomponer "12345678-9".
  const rutBase = pick(rec, 'rut', 'rutEmisor', 'rut_emisor')
  const dv = pick(rec, 'dv')
  const rut = rutBase != null ? (dv != null ? `${rutBase}-${dv}` : String(rutBase)) : null
  const folio = pick(rec, 'numero', 'folio', 'nroBoleta') ?? null
  const fecha = fechaISO(pick(rec, 'fecha', 'fechaEmision', 'fecha_emision'))
  return {
    fuente: 'bhe_recibida',
    tipo_documento: 'boleta',
    // Persistimos el bruto; si solo viene líquido, dejamos ese (el humano revisa).
    monto: bruto > 0 ? bruto : liquido,
    monto_es: 'bruto',
    rut_emisor: rut != null ? String(rut) : null,
    razon_social_emisor: razon != null ? String(razon) : null,
    folio: folio != null ? String(folio) : null,
    fecha_documento: fecha,
    descripcion_sugerida: razon ? `Honorarios ${razon}` : `Boleta honorarios ${folio ?? ''}`.trim(),
    crudo: rec,
  }
}

/** Extrae el array de documentos de una respuesta de API Gateway (shape variable). */
export function extraerDocumentos(payload: any): Record<string, any>[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  // Llaves contenedoras comunes.
  for (const k of ['data', 'documentos', 'detalle', 'compras', 'boletas', 'items', 'result']) {
    if (Array.isArray(payload[k])) return payload[k]
  }
  return []
}

/** Clave de deduplicación de un documento (rut emisor + folio). */
export function claveDedup(rut: string | null, folio: string | null): string {
  return `${(rut ?? '').replace(/[.\s-]/g, '').toLowerCase()}|${folio ?? ''}`
}
