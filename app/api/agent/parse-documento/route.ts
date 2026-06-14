import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { parsearFacturaSII } from '@/lib/parse-factura'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

// POST /api/agent/parse-documento (multipart: file)
// Extrae datos estructurados de un PDF de factura/boleta SII.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Sin archivo' }, { status: 400 })

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'El archivo debe ser un PDF válido' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `PDF excede el límite de ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB` },
        { status: 413 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    // Import dinámico: pdf-parse tiene un side-effect al cargarse que rompe
    // el build de Next.js si se importa a nivel de módulo.
    const pdfParse = (await import('pdf-parse')).default
    const pdf = await pdfParse(buffer, { max: 3 } as any)
    const resultado = parsearFacturaSII(pdf.text)

    return NextResponse.json(resultado)
  } catch (err: any) {
    console.error('[agent/parse-documento]', err?.message)
    return NextResponse.json({ error: 'No se pudo leer el PDF' }, { status: 422 })
  }
}
