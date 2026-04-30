import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import path from "path"
import fs from "fs"
import { getCotizacion } from "@/app/actions/cotizaciones"
import CotizacionPDF from "@/components/cotizaciones/CotizacionPDF"
import { createElement } from "react"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cotizacion = await getCotizacion(id)

    if (!cotizacion) {
      return new NextResponse("Cotización no encontrada", { status: 404 })
    }

    const logoFilePath = path.join(process.cwd(), "public/logos/logo-pdf.png")
    const logoBuffer = fs.readFileSync(logoFilePath)
    const logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`

    const buffer = await renderToBuffer(
      createElement(CotizacionPDF, { cotizacion, logoSrc: logoBase64 }) as any
    )

    const numVisible = cotizacion.grupo?.numero_base ?? "cotizacion"
    const filename = `${numVisible.replace(/\s/g, "-")}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error("Error generando PDF:", error)
    return new NextResponse(`Error: ${error.message}`, { status: 500 })
  }
}
