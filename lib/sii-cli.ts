// lib/sii-cli.ts
// Salida de la CLI `sii` (albertomarturelo/sii, JSON por defecto) → filas de
// sii_documentos + estado de la importación. SIN I/O: lo usa
// /api/agent/sii-importar, que recibe lo que manda `npm run sii:importar`.
//
// Por qué existe: el API Gateway pagado se dejó de usar (oct-2026). La CLI lee el
// SII en el Mac con la sesión de Casa Hiedra (la clave nunca sale del computador)
// y Hilván aplica acá su lógica de siempre.
//
// Regla central (el defecto que tenía el sync del gateway): un lado que no llegó
// entero queda 'incompleto' con el motivo textual, y los sync lo reportan como
// ERROR, nunca como lista vacía. Formatos observados en vivo el 16-oct-2026 con
// sii-cli 0.10.0 (docs/sii/informe-ensayo-sii-2026-10-16.md).
import { fechaISO, normalizarRut, tipoDocumentoDeDte, type SiiDocumento } from './agent-sii'

export type LadoSii = 'compras' | 'ventas' | 'bhe'
export const LADOS_SII: readonly LadoSii[] = ['compras', 'ventas', 'bhe']

/** Período de entrada (`2026-06` o `202606`) → `202606`; inválido → null. */
export function periodoAAAAMM(v: unknown): string | null {
  const m = String(v ?? '').trim().match(/^(\d{4})-?(\d{2})$/)
  if (!m) return null
  const mes = Number(m[2])
  if (mes < 1 || mes > 12) return null
  return `${m[1]}${m[2]}`
}

/** Fila lista para el upsert en sii_documentos. Sin `codigo` a propósito: el
 *  upsert solo pisa las columnas que manda, así se conserva el código de BHE que
 *  guardó el gateway en los períodos viejos. */
export type FilaSiiDocumento = Omit<SiiDocumento, 'raw'> & { raw: Record<string, unknown> }

export interface LadoPreparado {
  lado: LadoSii
  fuente: SiiDocumento['fuente']
  estado: 'completo' | 'incompleto'
  errores: string[]
  /** Documentos que trajo el SII (incluye boletas anuladas). */
  documentos: number
  filas: FilaSiiDocumento[]
}

export type Preparacion =
  | { ok: true; periodo: string; herramienta: string | null; lados: LadoPreparado[] }
  | { ok: false; error: string }

type Obj = Record<string, unknown>
const esObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
const entero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

class Rechazo extends Error {}

/** Valida el encabezado común (rut, periodo, side) de una salida de la CLI. */
function validarEncabezado(
  x: unknown,
  nombre: string,
  sideEsperado: string,
  periodo: string,
  rutEsperado: string | null,
): Obj {
  if (!esObj(x)) throw new Rechazo(`${nombre}: falta o no es un objeto`)
  if (x.side !== sideEsperado) {
    throw new Rechazo(`${nombre}: se esperaba side ${sideEsperado} y llegó ${String(x.side)}`)
  }
  if (periodoAAAAMM(x.periodo) !== periodo) {
    throw new Rechazo(`${nombre}: es del período ${String(x.periodo)}, no de ${periodo}`)
  }
  if (rutEsperado && normalizarRut(texto(x.rut)) !== rutEsperado) {
    throw new Rechazo(`${nombre}: es del RUT ${String(x.rut)}, no del de Casa Hiedra`)
  }
  return x
}

/** `rcv summary` + `rcv all` de un lado → filas + estado. */
function prepararRcv(
  parte: unknown,
  lado: 'compras' | 'ventas',
  periodo: string,
  rutEsperado: string | null,
): LadoPreparado {
  if (!esObj(parte)) throw new Rechazo(`${lado}: se esperaba { resumen, detalle }`)
  const side = lado === 'compras' ? 'COMPRA' : 'VENTA'
  const resumen = validarEncabezado(parte.resumen, `${lado}.resumen`, side, periodo, rutEsperado)
  const detalle = validarEncabezado(parte.detalle, `${lado}.detalle`, side, periodo, rutEsperado)
  if (!Array.isArray(resumen.rows)) throw new Rechazo(`${lado}.resumen: falta rows[]`)
  if (!Array.isArray(detalle.docs)) throw new Rechazo(`${lado}.detalle: falta docs[]`)

  const errores: string[] = []
  // Lo que el resumen del SII dice que hay, por tipo DTE.
  const esperados = new Map<string, number>()
  for (const r of resumen.rows) {
    if (!esObj(r)) continue
    const tipo = texto(r.codigoTipoDoc)
    if (tipo) esperados.set(tipo, entero(r.totalDocumentos) ?? 0)
  }

  // Tipos que el SII rechazó en el detalle. Un tipo con 0 documentos en el
  // resumen (ej. el 48 "Total mes Comprobantes Pago Electrónico" en ventas) se
  // rechaza siempre y no falta nada: no cuenta. Cualquier otro sí.
  const rechazados = Array.isArray(detalle.rejectedTypes) ? detalle.rejectedTypes.map((t) => String(t)) : []
  const rechazoReal = new Set<string>()
  for (const t of rechazados) {
    if (esperados.get(t) === 0) continue
    rechazoReal.add(t)
    errores.push(`Tipo ${t}: el SII rechazó el detalle (el resumen dice ${esperados.get(t) ?? '?'} documentos)`)
  }

  const filas: FilaSiiDocumento[] = []
  const porTipo = new Map<string, number>()
  for (const d of detalle.docs) {
    if (!esObj(d)) continue
    const tipo = texto(d.codigoTipoDoc) ?? '?'
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1)
    const raw = esObj(d.raw) ? d.raw : {}
    const rut = texto(d.rutEmisor)
    const folio = texto(d.folio)
    if (!rut || !folio) {
      errores.push(`Tipo ${tipo}: un documento llegó sin RUT o folio`)
      continue
    }
    const dte = Number(tipo) || 0
    const tipo_documento = tipoDocumentoDeDte(dte)
    const neto = entero(d.montoNeto)
    const total = entero(d.montoTotal)
    const esNC = tipo_documento === 'nota_credito'
    const refTipo = entero(raw.detTipoDocRef)
    filas.push({
      periodo,
      fuente: lado === 'compras' ? 'rcv_compra' : 'rcv_venta',
      dte,
      tipo_documento,
      rut_emisor: normalizarRut(rut), // en ventas es el RECEPTOR (= cliente)
      razon_social_emisor: texto(d.razonSocial),
      folio,
      fecha_documento: fechaISO(d.fechaEmision),
      neto,
      iva: entero(d.montoIva),
      total,
      // Se guarda el TOTAL (con IVA) como bruto; si no hay total, el neto. La NC
      // viene en positivo: el signo lo pone el tipo 61.
      monto: total && total > 0 ? total : neto,
      anulada: ['S', 's', '1', 'true'].includes(String(raw.detAnulado)),
      doc_ref_folio: esNC ? texto(raw.detFolioDocRef) : null,
      doc_ref_tipo: esNC && refTipo ? refTipo : null,
      raw,
    })
  }

  // Cuadre resumen ↔ detalle: si el SII dice 24 facturas y llegaron 23, el lado
  // no está completo aunque nadie haya reportado error.
  for (const [tipo, n] of esperados) {
    if (rechazoReal.has(tipo)) continue
    const llegaron = porTipo.get(tipo) ?? 0
    if (llegaron !== n) errores.push(`Tipo ${tipo}: el resumen del SII dice ${n} documentos y llegaron ${llegaron}`)
  }
  for (const [tipo, n] of porTipo) {
    if (!esperados.has(tipo)) errores.push(`Tipo ${tipo}: llegaron ${n} documentos que el resumen no menciona`)
  }

  return {
    lado,
    fuente: lado === 'compras' ? 'rcv_compra' : 'rcv_venta',
    estado: errores.length ? 'incompleto' : 'completo',
    errores,
    documentos: detalle.docs.length,
    filas,
  }
}

/** `bte list --recibidas` → filas + estado. */
function prepararBhe(parte: unknown, periodo: string, rutEsperado: string | null): LadoPreparado {
  const bte = validarEncabezado(parte, 'bhe', 'RECIBIDAS', periodo, rutEsperado)
  if (!Array.isArray(bte.boletas)) throw new Rechazo('bhe: falta boletas[]')

  const errores: string[] = []
  const totalSii = entero(bte.totalBoletas)
  if (totalSii === null) errores.push('El SII no informó el total de boletas del mes')
  else if (totalSii !== bte.boletas.length) {
    errores.push(`El SII dice ${totalSii} boletas y llegaron ${bte.boletas.length}`)
  }

  const filas: FilaSiiDocumento[] = []
  for (const b of bte.boletas) {
    if (!esObj(b)) continue
    const rut = texto(b.contraparteRut)
    const folio = texto(b.folio)
    if (!rut || !folio) {
      errores.push('Una boleta llegó sin RUT del emisor o folio')
      continue
    }
    const bruto = entero(b.totalHonorarios)
    const liquido = entero(b.honorariosLiquidos)
    filas.push({
      periodo,
      fuente: 'bhe_recibida',
      dte: 0,
      tipo_documento: 'boleta',
      rut_emisor: normalizarRut(rut),
      razon_social_emisor: texto(b.contraparteNombre),
      folio,
      fecha_documento: fechaISO(b.fecha), // la CLI la entrega DD/MM/YYYY
      neto: null,
      iva: null,
      total: bruto,
      // Se persiste el bruto; si solo viene líquido, ese (el humano revisa).
      monto: bruto && bruto > 0 ? bruto : liquido,
      // Las anuladas se guardan (respaldo fiel) pero el sync no las ofrece.
      anulada: b.estado === 'ANUL',
      doc_ref_folio: null,
      doc_ref_tipo: null,
      raw: b,
    })
  }

  return {
    lado: 'bhe',
    fuente: 'bhe_recibida',
    estado: errores.length ? 'incompleto' : 'completo',
    errores,
    documentos: bte.boletas.length,
    filas,
  }
}

/**
 * Valida TODO el cuerpo antes de escribir nada. Un cuerpo mal formado (otro
 * período, otro RUT, otro lado) se rechaza entero; un lado bien formado pero
 * que no cuadra queda 'incompleto' con sus motivos.
 *
 * Cuerpo: { periodo, compras?: {resumen, detalle}, ventas?: {resumen, detalle},
 *           bhe?: <bte list --recibidas>, herramienta? }
 */
export function prepararImportacion(body: unknown, rutEsperado?: string | null): Preparacion {
  if (!esObj(body)) return { ok: false, error: 'JSON inválido' }
  const periodo = periodoAAAAMM(body.periodo)
  if (!periodo) return { ok: false, error: 'periodo inválido (AAAA-MM o AAAAMM, ej. 2026-06)' }
  const rut = rutEsperado ? normalizarRut(rutEsperado) : null

  try {
    const lados: LadoPreparado[] = []
    if (body.compras !== undefined) lados.push(prepararRcv(body.compras, 'compras', periodo, rut))
    if (body.ventas !== undefined) lados.push(prepararRcv(body.ventas, 'ventas', periodo, rut))
    if (body.bhe !== undefined) lados.push(prepararBhe(body.bhe, periodo, rut))
    if (!lados.length) return { ok: false, error: 'No viene ningún lado (compras, ventas o bhe)' }
    return { ok: true, periodo, herramienta: texto(body.herramienta), lados }
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.message }
    throw e
  }
}

/** Estado guardado de una importación (fila de sii_importaciones). */
export interface ImportacionSii {
  periodo: string
  lado: LadoSii
  estado: 'completo' | 'incompleto'
  documentos: number
  errores: string[]
  importado_at: string
}

/** Decide si el sync puede responder: cada lado pedido debe tener una
 *  importación COMPLETA. Si no, devuelve el error que ve el agente. */
export function verificarImportaciones(
  periodo: string,
  lados: readonly LadoSii[],
  importaciones: readonly ImportacionSii[],
): { ok: true } | { ok: false; error: string; faltan: LadoSii[]; incompletos: { lado: LadoSii; errores: string[]; importado_at: string }[] } {
  const porLado = new Map(importaciones.filter((i) => i.periodo === periodo).map((i) => [i.lado, i]))
  const faltan = lados.filter((l) => !porLado.has(l))
  const incompletos = lados
    .map((l) => porLado.get(l))
    .filter((i): i is ImportacionSii => !!i && i.estado !== 'completo')
    .map((i) => ({ lado: i.lado, errores: i.errores, importado_at: i.importado_at }))
  if (!faltan.length && !incompletos.length) return { ok: true }
  const mes = `${periodo.slice(0, 4)}-${periodo.slice(4)}`
  const partes = [
    faltan.length ? `sin importar: ${faltan.join(', ')}` : null,
    incompletos.length ? `importación incompleta: ${incompletos.map((i) => i.lado).join(', ')}` : null,
  ].filter(Boolean)
  return {
    ok: false,
    error:
      `No hay datos confiables del SII para ${mes} (${partes.join('; ')}). Esto NO significa que no haya ` +
      `documentos. Hay que importar desde el Mac de Tomás: \`npm run sii:importar -- ${mes}\` ` +
      '(si pide sesión: `sii auth login` UNA vez). No reintentes este sync hasta que se importe.',
    faltan,
    incompletos,
  }
}
