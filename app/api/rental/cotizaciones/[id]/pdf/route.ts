import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import path from 'path'
import fs from 'fs'
import { createElement } from 'react'
import { obtenerRentalCotizacion } from '@/app/actions/rental'
import { createClient } from '@/lib/supabase/server'
import RentalCotizacionPDF from '@/components/rental/RentalCotizacionPDF'

export const maxDuration = 30

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    // Autorización: esta cotización de arriendo solo se descarga desde el
    // dashboard interno (/rental/cotizaciones/[id], página con sesión). No hay
    // flujo público que enlace a este PDF, así que se exige sesión válida.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new NextResponse('No autorizado', { status: 401 })
    }

    const cotizacion = await obtenerRentalCotizacion(id)

    if (!cotizacion) {
      return new NextResponse('Cotización no encontrada', { status: 404 })
    }

    const logoPath = path.join(process.cwd(), 'public/logos/logo-pdf.png')
    const logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`

    const buffer = await renderToBuffer(
      createElement(RentalCotizacionPDF, { cotizacion, logoSrc: logoBase64 }) as any,
    )

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${cotizacion.numero}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error('PDF rental error:', error)
    return new NextResponse('Error generando PDF', { status: 500 })
  }
}
