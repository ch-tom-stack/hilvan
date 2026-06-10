import { NextRequest, NextResponse } from 'next/server'
import { parsearFacturaSII } from '@/lib/parse-factura'

export const runtime = 'nodejs'
export const maxDuration = 30

// ── Límites de validación ──────────────────────────────────────────────────
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

// La lógica pura de parseo vive en lib/parse-factura.ts (testeable sin pdf-parse).

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Sin archivo' }, { status: 400 })

    // ── Validar tipo MIME ──────────────────────────────────────────────────
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'El archivo debe ser un PDF válido' },
        { status: 400 }
      )
    }

    // ── Validar tamaño ────────────────────────────────────────────────────
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `PDF excede el límite de ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB` },
        { status: 413 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    // Import dinámico: pdf-parse tiene un side-effect al cargarse que lee
    // un PDF de test y rompe el build de Next.js si se importa a nivel de módulo.
    const pdfParse = (await import('pdf-parse')).default
    const pdf = await pdfParse(buffer, { max: 3 } as any)
    const resultado = parsearFacturaSII(pdf.text)

    return NextResponse.json(resultado)
  } catch (err: any) {
    console.error('[parse-factura]', err?.message)
    return NextResponse.json({ error: 'No se pudo leer el PDF' }, { status: 422 })
  }
}
