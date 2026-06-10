import { NextRequest, NextResponse } from 'next/server'
import { parsearFacturaSII } from '@/lib/parse-factura'

export const runtime = 'nodejs'
export const maxDuration = 15

// La lógica pura de parseo vive en lib/parse-factura.ts (testeable sin pdf-parse).

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Sin archivo' }, { status: 400 })

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
