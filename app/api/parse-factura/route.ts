import { NextRequest, NextResponse } from 'next/server'
import pdfParse from 'pdf-parse'

export const runtime = 'nodejs'
export const maxDuration = 15

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normaliza un RUT: agrega puntos si vienen sin formato */
function normalizarRut(raw: string): string {
  const clean = raw.replace(/[.\-]/g, '')
  const cuerpo = clean.slice(0, -1)
  const dv = clean.slice(-1)
  if (cuerpo.length < 7) return raw
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv
}

/** Parsea montos chilenos: "$196.990" o "196.990" → 196990 */
function parsearMontoCLP(raw: string): number | null {
  const cleaned = raw.replace(/\$/, '').replace(/\./g, '').replace(',', '').trim()
  const val = parseInt(cleaned, 10)
  return isNaN(val) || val <= 0 ? null : val
}

// ── Parser principal ────────────────────────────────────────────────────────
//
// Estructura estándar de DTE SII chileno (extraído como texto):
//   - "R.U.T.: XX.XXX.XXX-X"  → RUT EMISOR (siempre lleva el prefijo "R.U.T.:")
//   - El RUT del receptor aparece SIN prefijo "R.U.T.:"
//   - Razón social del emisor: línea con solo MAYÚSCULAS que aparece
//     justo después de la condición de pago (CONTADO / CRÉDITO)
//   - Total: última línea de formato $X.XXX después del label "Total"

function parsearFacturaSII(text: string) {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const fullText = lines.join('\n')

  // ── RUT Emisor ────────────────────────────────────────────────────────────
  // El emisor siempre aparece con el prefijo "R.U.T.:" (dos puntos explícitos)
  const rutEmisorMatch = fullText.match(/R\.U\.T\.\s*:?\s*(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])/i)
  const rut_emisor = rutEmisorMatch ? normalizarRut(rutEmisorMatch[1]) : null

  // ── Razón social ──────────────────────────────────────────────────────────
  let razon_social: string | null = null

  // Patrón 1: label explícito "Razón Social:"
  const razonLabel = fullText.match(/Raz[oó]n\s+Social\s*:?\s*([^\n:]+)/i)
  if (razonLabel) {
    razon_social = razonLabel[1].trim().split(/\t|  +/)[0].trim()
  }

  // Patrón 2 (DTE típico sin label): línea ALL CAPS después de CONTADO/CRÉDITO
  // La condición de pago separa el bloque receptor del bloque emisor en estos PDFs
  if (!razon_social) {
    const condPagoIdx = lines.findIndex(l =>
      /^(CONTADO|CR[EÉ]DITO|A \d+ D[IÍ]AS|CONTRA FACTURA)$/i.test(l)
    )
    if (condPagoIdx > -1) {
      for (let i = condPagoIdx + 1; i < Math.min(condPagoIdx + 6, lines.length); i++) {
        const l = lines[i]
        // Línea de solo letras mayúsculas (nombre de empresa), sin ser un label conocido
        if (
          l.length > 5 &&
          /^[A-ZÁÉÍÓÚÑÜA-Z0-9\s.,&()\-]+$/i.test(l) &&
          !/^(GIRO|FONO|FECHA|CIUDAD|DIRECCI|CASA MATRIZ|AV\.|SUCURS|E-MAIL|EMAIL)/i.test(l) &&
          !/\$/.test(l)
        ) {
          razon_social = l
          break
        }
      }
    }
  }

  // Patrón 3 fallback: línea ALL CAPS justo antes del primer "R.U.T.:" en el texto
  if (!razon_social && rut_emisor) {
    const rutLineIdx = lines.findIndex(l =>
      /R\.U\.T\.\s*:/.test(l)
    )
    if (rutLineIdx > 0) {
      for (let i = rutLineIdx - 1; i >= Math.max(0, rutLineIdx - 4); i--) {
        const l = lines[i]
        if (l && !/^(FACTURA|BOLETA|NOTA|LIQUIDACI|GUIA)/i.test(l) && l.length > 5) {
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
  // Estrategia: encontrar el label "Total", luego tomar el ÚLTIMO monto
  // que aparezca en el grupo de líneas de montos subsiguiente.
  // Formato CLP: $X.XXX o $X.XXX.XXX (puntos como separador de miles)
  let monto: number | null = null

  const totalLabelIdx = lines.findIndex(l => /^Total$/i.test(l))
  if (totalLabelIdx > -1) {
    // Recopilar todas las líneas con formato $X.XXX después del label "Total"
    const moneyLines: number[] = []
    for (let i = totalLabelIdx + 1; i < Math.min(totalLabelIdx + 10, lines.length); i++) {
      if (/^\$\d{1,3}(?:\.\d{3})*$/.test(lines[i])) {
        const val = parsearMontoCLP(lines[i])
        if (val !== null) moneyLines.push(val)
      } else if (moneyLines.length > 0) {
        break // salir si ya encontramos montos y aparece otra cosa
      }
    }
    // El total es el último monto del grupo (Descuento, Exento, Neto, IVA, **Total**)
    if (moneyLines.length > 0) {
      monto = moneyLines[moneyLines.length - 1]
    }
  }

  // Fallback: buscar "Total $X.XXX" en línea directa
  if (!monto) {
    const totalInline = fullText.match(/Total\s+\$?([\d.]+)/i)
    if (totalInline) monto = parsearMontoCLP(totalInline[1])
  }

  return { rut_emisor, razon_social, folio, fecha, monto }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Sin archivo' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const pdf = await pdfParse(buffer, { max: 3 } as any)
    const resultado = parsearFacturaSII(pdf.text)

    return NextResponse.json(resultado)
  } catch (err: any) {
    console.error('[parse-factura]', err?.message)
    return NextResponse.json({ error: 'No se pudo leer el PDF' }, { status: 422 })
  }
}
