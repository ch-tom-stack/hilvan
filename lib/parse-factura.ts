/**
 * Lógica pura de parseo de facturas SII (DTE chileno).
 *
 * Extraído de app/api/parse-factura/route.ts SIN cambios de comportamiento
 * para permitir tests unitarios. El route handler importa estas funciones.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normaliza un RUT: agrega puntos si vienen sin formato */
export function normalizarRut(raw: string): string {
  const clean = raw.replace(/[.\-]/g, '')
  const cuerpo = clean.slice(0, -1)
  const dv = clean.slice(-1)
  if (cuerpo.length < 7) return raw
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv
}

/** Parsea montos CLP: "$196.990", "196.990", "196990" → 196990 */
export function parsearMontoCLP(raw: string): number | null {
  const cleaned = raw.replace(/\$/g, '').replace(/\./g, '').replace(',', '').trim()
  const val = parseInt(cleaned, 10)
  return isNaN(val) || val <= 0 ? null : val
}

/** Verdadero si la línea parece nombre de empresa (no label ni dirección) */
export function esNombreEmpresa(l: string): boolean {
  if (l.length < 6) return false
  if (l.includes(':')) return false                // "label: valor" → descartar
  if (/^\d/.test(l)) return false                  // empieza con dígito
  if (/^(Nº|N°)/i.test(l)) return false           // número de documento
  if (/\d{2}[-/]\d{2}[-/]\d{4}/.test(l)) return false // parece fecha
  if (/^(FACTURA|BOLETA|NOTA DE|LIQUIDACI|GUÍA|GUIA|S\.I\.I|SII\b)/i.test(l)) return false
  if (/^(ELECTRONICA|ELECTRÓNICA|AFECTA|EXENTA)/i.test(l)) return false
  if (/^(SEÑOR|SEÑORES|CLIENTE|RECEPTOR)/i.test(l)) return false
  if (l.length > 80) return false                  // demasiado largo → párrafo
  return true
}

// ── Parser principal ────────────────────────────────────────────────────────
//
// Cubre dos grandes familias de DTE chileno:
//
//  Familia A — Encabezado izquierda/derecha (IIA, GDExpress, etc.):
//    El nombre del emisor aparece DESPUÉS de la condición de pago (CONTADO/CRÉDITO),
//    porque el generador renderiza primero el bloque del receptor y luego el del emisor.
//    El total viene en líneas separadas con prefijo "$".
//
//  Familia B — Encabezado arriba (Copec, BSALE, Facturador SII propio, etc.):
//    El nombre del emisor es la PRIMERA línea sustancial del documento.
//    El total aparece concatenado con el label ("Total48.603") o en tabla inline.

export interface FacturaParseResult {
  rut_emisor: string | null
  razon_social: string | null
  folio: string | null
  fecha: string | null
  monto: number | null
}

export function parsearFacturaSII(text: string): FacturaParseResult {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const fullText = lines.join('\n')

  // ── RUT Emisor ────────────────────────────────────────────────────────────
  // El RUT del emisor siempre lleva prefijo "R.U.T.:" en el DTE estándar.
  const rutEmisorMatch = fullText.match(/R\.U\.T\.\s*:?\s*(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])/i)
  const rut_emisor = rutEmisorMatch ? normalizarRut(rutEmisorMatch[1]) : null

  // ── Razón social ──────────────────────────────────────────────────────────
  let razon_social: string | null = null

  // P1: label explícito "Razón Social: ..."
  const razonLabel = fullText.match(/Raz[oó]n\s+Social\s*:?\s*([^\n:]+)/i)
  if (razonLabel) {
    razon_social = razonLabel[1].trim().split(/\t|  +/)[0].trim()
  }

  // P2 (Familia B): primera línea sustancial ANTES del primer "R.U.T.:"
  // En facturas como Copec/PIMENISA, el nombre está arriba del todo,
  // las líneas siguientes son "Giro: ...", "Casa Matriz: ...", luego R.U.T.
  if (!razon_social) {
    const rutLineIdx = lines.findIndex(l => /R\.U\.T\.\s*:/i.test(l))
    const limite = rutLineIdx > -1 ? rutLineIdx : Math.min(10, lines.length)
    for (let i = 0; i < limite; i++) {
      if (esNombreEmpresa(lines[i])) {
        razon_social = lines[i]
        break
      }
    }
  }

  // P3 (Familia A): línea ALL-CAPS después de CONTADO / CRÉDITO
  // En formatos IIA/GDExpress el nombre del emisor aparece después
  // de la condición de pago porque el bloque receptor se renderiza primero.
  if (!razon_social) {
    const condPagoIdx = lines.findIndex(l =>
      /^(CONTADO|CR[EÉ]DITO|A \d+ D[IÍ]AS|CONTRA FACTURA)$/i.test(l)
    )
    if (condPagoIdx > -1) {
      for (let i = condPagoIdx + 1; i < Math.min(condPagoIdx + 6, lines.length); i++) {
        const l = lines[i]
        if (
          l.length > 5 &&
          !/^(GIRO|FONO|FECHA|CIUDAD|DIRECCI|CASA MATRIZ|AV\.|SUCURS|E-MAIL|EMAIL)/i.test(l) &&
          !l.includes('$') &&
          !l.includes(':')
        ) {
          razon_social = l
          break
        }
      }
    }
  }

  // ── Folio ─────────────────────────────────────────────────────────────────
  const folioMatch = fullText.match(/N[°º]\s*:?\s*(\d+)/)
  const folio = folioMatch ? folioMatch[1] : null

  // ── Fecha ─────────────────────────────────────────────────────────────────
  const fechaMatch = fullText.match(/\b(\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/)
  const fecha = fechaMatch ? fechaMatch[1] : null

  // ── Total ─────────────────────────────────────────────────────────────────
  let monto: number | null = null

  // T1 (Familia A): label "Total" en su propia línea + columna de montos "$X.XXX"
  //    Descuento   $0
  //    Neto        $165.538
  //    IVA         $31.452
  //    Total       $196.990   ← el último
  const totalLabelIdx = lines.findIndex(l => /^Total$/i.test(l))
  if (totalLabelIdx > -1) {
    const moneyLines: number[] = []
    for (let i = totalLabelIdx + 1; i < Math.min(totalLabelIdx + 10, lines.length); i++) {
      if (/^\$?\d{1,3}(?:\.\d{3})*$/.test(lines[i])) {
        const val = parsearMontoCLP(lines[i])
        if (val !== null) moneyLines.push(val)
      } else if (moneyLines.length > 0) {
        break
      }
    }
    if (moneyLines.length > 0) monto = moneyLines[moneyLines.length - 1]
  }

  // T2 (Familia B): "Total" concatenado o con espacio con el monto, sin "$"
  //    "Total48.603"  →  48603   (Copec / PIMENISA style)
  //    "Total 48.603" →  48603
  //    "Total  $196.990" → también cubierto
  if (!monto) {
    const totalInlineMatch = fullText.match(/\bTotal\s*\$?\s*(\d{1,3}(?:\.\d{3})+)/i)
    if (totalInlineMatch) {
      const parsed = parsearMontoCLP(totalInlineMatch[1])
      if (parsed && parsed > 100) monto = parsed
    }
  }

  return { rut_emisor, razon_social, folio, fecha, monto }
}
