/**
 * logica.ts — Pipeline puro de clasificación/dedup de documentos tributarios
 * + helpers de armado del texto del digest financiero.
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

// ── Helpers de texto para el digest ──────────────────────────────────────────

export interface ResumenDigest {
  periodo: string
  alertas: Array<{ nivel: string; mensaje: string; monto?: number }>
  recomendaciones: Array<{ prioridad: string; mensaje: string; monto?: number }>
  ingresos: {
    facturado_periodo: number
    cobrado_periodo: number
    por_cobrar: { total: number }
    por_facturar: { total: number }
  }
  egresos: {
    total: number
    por_pagar: { total_neto: number; count: number }
  }
  creditos: {
    pendientes: number
    deuda_vigente_total: number
    proxima_cuota: { credito: string | null; monto: number; fecha_vencimiento: string } | null
  }
  resumen: {
    resultado_devengado: number
    caja_aprox: number
  }
}

/**
 * Construye el cuerpo HTML del digest financiero.
 * Función PURA: recibe el resumen ya calculado (desde /api/agent/estado-financiero)
 * y devuelve el HTML listo para enviar por email vía nodemailer.
 */
export function construirHtmlDigest(data: ResumenDigest): string {
  const { periodo, alertas, recomendaciones, ingresos, egresos, creditos, resumen } = data

  const alertasHtml = alertas.length === 0
    ? '<p style="color:#7a9e7e">Sin alertas críticas este mes.</p>'
    : alertas.map((a) => {
        const color = a.nivel === 'alta' ? '#c0392b' : '#c9a84c'
        const emoji = a.nivel === 'alta' ? '🔴' : '🟡'
        return `<li style="color:${color};margin-bottom:6px">${emoji} ${a.mensaje}</li>`
      }).join('')

  const recsHtml = recomendaciones.length === 0
    ? '<p style="color:#7a9e7e">Sin recomendaciones pendientes.</p>'
    : recomendaciones.map((r) => {
        const emoji = r.prioridad === 'alta' ? '⚠️' : r.prioridad === 'media' ? '📌' : 'ℹ️'
        return `<li style="margin-bottom:6px">${emoji} ${r.mensaje}</li>`
      }).join('')

  const proximaCuota = creditos.proxima_cuota
    ? `<tr><td>Próxima cuota</td><td><strong>${creditos.proxima_cuota.credito ?? 'Crédito'}</strong> — ${formatCLP(creditos.proxima_cuota.monto)} (vence ${creditos.proxima_cuota.fecha_vencimiento})</td></tr>`
    : ''

  const resultadoColor = resumen.resultado_devengado >= 0 ? '#7a9e7e' : '#c0392b'
  const cajaColor = resumen.caja_aprox >= 0 ? '#7a9e7e' : '#c0392b'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Digest financiero Hilván — ${periodo}</title>
  <style>
    body { font-family: 'DM Sans', Arial, sans-serif; background:#f5f0e8; color:#111110; margin:0; padding:0; }
    .wrap { max-width:620px; margin:32px auto; background:#fff; border-radius:4px; overflow:hidden; }
    .header { background:#111110; color:#f5f0e8; padding:28px 32px; }
    .header h1 { font-size:22px; margin:0; font-style:italic; }
    .header p { margin:4px 0 0; color:#9a9a92; font-size:13px; }
    .section { padding:24px 32px; border-bottom:1px solid #e8e3db; }
    .section h2 { font-size:13px; text-transform:uppercase; letter-spacing:.4em; color:#9a9a92; margin:0 0 16px; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    td { padding:6px 4px; vertical-align:top; }
    td:first-child { color:#9a9a92; width:50%; }
    td:last-child { font-weight:600; text-align:right; }
    ul { margin:0; padding-left:18px; }
    .footer { padding:20px 32px; font-size:12px; color:#9a9a92; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Digest financiero</h1>
    <p>Período ${periodo} · Casa Hiedra</p>
  </div>

  <div class="section">
    <h2>Alertas</h2>
    ${alertas.length > 0 ? `<ul>${alertasHtml}</ul>` : alertasHtml}
  </div>

  <div class="section">
    <h2>Resumen</h2>
    <table>
      <tr>
        <td>Resultado devengado</td>
        <td style="color:${resultadoColor}">${formatCLP(resumen.resultado_devengado)}</td>
      </tr>
      <tr>
        <td>Caja aproximada</td>
        <td style="color:${cajaColor}">${formatCLP(resumen.caja_aprox)}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>Ingresos</h2>
    <table>
      <tr><td>Facturado</td><td>${formatCLP(ingresos.facturado_periodo)}</td></tr>
      <tr><td>Cobrado</td><td>${formatCLP(ingresos.cobrado_periodo)}</td></tr>
      <tr><td>Por cobrar</td><td>${formatCLP(ingresos.por_cobrar.total)}</td></tr>
      <tr><td>Por facturar (aprobado)</td><td>${formatCLP(ingresos.por_facturar.total)}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Egresos</h2>
    <table>
      <tr><td>Total del período</td><td>${formatCLP(egresos.total)}</td></tr>
      <tr><td>Por pagar (deuda real)</td><td>${formatCLP(egresos.por_pagar.total_neto)} (${egresos.por_pagar.count} ítem${egresos.por_pagar.count !== 1 ? 's' : ''})</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Créditos</h2>
    <table>
      <tr><td>Cuotas pendientes del mes</td><td>${formatCLP(creditos.pendientes)}</td></tr>
      <tr><td>Deuda total vigente</td><td>${formatCLP(creditos.deuda_vigente_total)}</td></tr>
      ${proximaCuota}
    </table>
  </div>

  <div class="section">
    <h2>Qué hacer</h2>
    ${recomendaciones.length > 0 ? `<ul>${recsHtml}</ul>` : recsHtml}
  </div>

  <div class="footer">
    Generado automáticamente por Hilván · <a href="https://app.casahiedra.com/financiero">Ver en app</a>
  </div>
</div>
</body>
</html>`
}

/**
 * Construye el asunto del email del digest según el estado financiero.
 * Si hay alertas de nivel 'alta', el asunto lo refleja.
 */
export function construirAsuntoDigest(
  periodo: string,
  alertas: Array<{ nivel: string }>,
): string {
  const tieneAlta = alertas.some((a) => a.nivel === 'alta')
  const prefijo = tieneAlta ? '⚠️ ' : ''
  return `${prefijo}Digest financiero ${periodo} — Casa Hiedra`
}
