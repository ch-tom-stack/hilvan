// lib/agent-sii.ts
// Documentos del SII guardados en sii_documentos → filas que entregan
// hilvan_sii_sync (compras/NC/honorarios, shape de gasto para crear-gastos-bulk)
// y hilvan_sii_sync_ventas (facturas emitidas). SIN I/O.
//
// Desde oct-2026 el SII ya no se consulta desde el servidor (el API Gateway se
// dejó de pagar): la CLI `sii` lee en el Mac y /api/agent/sii-importar guarda
// cada documento en sii_documentos (ver lib/sii-cli.ts). Estas funciones leen
// esas filas, sin importar si las escribió el gateway o la CLI: las columnas
// son las mismas.

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

/** Fecha SII → YYYY-MM-DD (acepta "2026-06-15", "15-06-2026", "15/06/2026", "20260615"). */
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

export type TipoDocumentoSii = 'factura' | 'exenta' | 'boleta' | 'nota_credito'

// Códigos DTE del SII que son exentos (sin IVA) → tipo_documento 'exenta'.
const DTE_EXENTOS = new Set([34, 41]) // 34 factura exenta, 41 boleta exenta

/** Tipo de documento Hilván según el código DTE. 61 = nota de crédito (RESTA una
 *  factura previa); 39 = boleta (solo aparece en ventas). */
export function tipoDocumentoDeDte(dte: number): TipoDocumentoSii {
  if (dte === 61) return 'nota_credito'
  if (DTE_EXENTOS.has(dte)) return 'exenta'
  if (dte === 39) return 'boleta'
  return 'factura'
}

/** Una fila de sii_documentos (lo que lee el sync). */
export interface SiiDocumento {
  periodo: string
  fuente: 'rcv_compra' | 'bhe_recibida' | 'rcv_venta'
  dte: number
  tipo_documento: TipoDocumentoSii | null
  rut_emisor: string | null // en ventas: el RECEPTOR (= cliente)
  razon_social_emisor: string | null
  folio: string | null
  fecha_documento: string | null
  neto: number | null
  iva: number | null
  total: number | null
  monto: number | null
  anulada: boolean
  doc_ref_folio: string | null
  doc_ref_tipo: number | null
  raw: Record<string, any> | null
}

export interface FilaSugerida {
  fuente: 'rcv_compra' | 'bhe_recibida'
  // Campos que entiende crear-gastos-bulk:
  tipo_documento: TipoDocumentoSii
  monto: number
  monto_es: 'neto' | 'bruto'
  rut_emisor: string | null
  razon_social_emisor: string | null
  folio: string | null
  fecha_documento: string | null
  // Solo NC (dte 61): folio/tipo del documento que la NC anula o reduce.
  // Para crear-nota-credito.
  referencia_folio?: string | null
  referencia_tipo?: number | null
  // Si el documento da crédito fiscal IVA (factura/exenta emitida a nuestro RUT).
  factura_casa_hiedra?: boolean
  // Sugerencia de descripción para el humano (no obligatoria en bulk):
  descripcion_sugerida: string
  // PENDIENTES de clasificación humana (no se rellenan aquí):
  //   origen ('mensual'|'proyecto'), categoria | cotizacion_item_id, periodo
  crudo: Record<string, any>
}

/** Fila de sii_documentos (RCV compras o BHE recibida) → fila sugerida de gasto. */
export function filaDesdeDocumento(d: SiiDocumento): FilaSugerida {
  const razon = d.razon_social_emisor
  const folio = d.folio
  if (d.fuente === 'bhe_recibida') {
    return {
      fuente: 'bhe_recibida',
      tipo_documento: 'boleta',
      // Se persiste el bruto (total honorarios); el monto ya viene así guardado.
      monto: numCL(d.monto),
      monto_es: 'bruto',
      rut_emisor: d.rut_emisor,
      razon_social_emisor: razon,
      folio,
      fecha_documento: d.fecha_documento,
      descripcion_sugerida: razon ? `Honorarios ${razon}` : `Boleta honorarios ${folio ?? ''}`.trim(),
      crudo: d.raw ?? {},
    }
  }
  // RCV compras. Para todas se guarda el TOTAL (con IVA) como bruto; si no hay
  // total, el neto (lo resuelve la importación al llenar `monto`).
  const tipo_documento = d.tipo_documento ?? tipoDocumentoDeDte(d.dte)
  const esNC = tipo_documento === 'nota_credito'
  const fila: FilaSugerida = {
    fuente: 'rcv_compra',
    tipo_documento,
    monto: numCL(d.monto),
    monto_es: 'bruto',
    rut_emisor: d.rut_emisor,
    razon_social_emisor: razon,
    folio,
    fecha_documento: d.fecha_documento,
    descripcion_sugerida: razon
      ? `${esNC ? 'Nota de crédito ' : ''}${razon}`
      : `${esNC ? 'Nota de crédito' : 'Factura'} ${folio ?? ''}`.trim(),
    // El RCV compras SOLO lista documentos donde Casa Hiedra es la compradora
    // (nuestro RUT) → toda factura/exenta real da crédito fiscal IVA por defecto.
    // (NC no importa: se carga aparte con crear-nota-credito, no por este flujo.)
    factura_casa_hiedra: !esNC,
    crudo: d.raw ?? {},
  }
  if (esNC) {
    fila.referencia_folio = d.doc_ref_folio
    fila.referencia_tipo = d.doc_ref_tipo
  }
  return fila
}

// ── RCV VENTAS (facturas EMITIDAS por Casa Hiedra) ─────────────────────────
// En ventas rut_emisor/razon_social_emisor de sii_documentos guardan el
// RECEPTOR = el CLIENTE.
export interface FilaVenta {
  fuente: 'rcv_venta'
  tipo_dte: number
  tipo_documento: TipoDocumentoSii
  folio: string | null
  fecha_emision: string | null
  receptor_rut: string | null
  receptor_razon_social: string | null
  monto_neto: number
  iva: number
  monto_total: number
  // NC emitida (dte 61): documento que reduce/anula.
  referencia_folio?: string | null
  referencia_tipo?: number | null
  crudo: Record<string, any>
}

/** Fila de sii_documentos (rcv_venta) → fila de venta. */
export function ventaDesdeDocumento(d: SiiDocumento): FilaVenta {
  const neto = numCL(d.neto)
  const total = numCL(d.total)
  return {
    fuente: 'rcv_venta',
    tipo_dte: d.dte,
    tipo_documento: d.tipo_documento ?? tipoDocumentoDeDte(d.dte),
    folio: d.folio,
    fecha_emision: d.fecha_documento,
    receptor_rut: d.rut_emisor,
    receptor_razon_social: d.razon_social_emisor,
    monto_neto: neto,
    iva: numCL(d.iva),
    monto_total: total > 0 ? total : neto,
    referencia_folio: d.doc_ref_folio,
    referencia_tipo: d.doc_ref_tipo,
    crudo: d.raw ?? {},
  }
}

/** Normaliza un RUT chileno para comparar (sin puntos/espacios, dv en mayúscula). */
export function normalizarRut(rut: string | null | undefined): string {
  return String(rut ?? '').replace(/[.\s]/g, '').toUpperCase().trim()
}

/** Clave de deduplicación de un documento (rut emisor + folio). */
export function claveDedup(rut: string | null, folio: string | null): string {
  return `${(rut ?? '').replace(/[.\s-]/g, '').toLowerCase()}|${folio ?? ''}`
}
