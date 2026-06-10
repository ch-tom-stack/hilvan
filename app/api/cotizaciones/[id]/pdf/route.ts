import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import path from "path"
import fs from "fs"
import { getCotizacion, getCotizacionPorToken } from "@/app/actions/cotizaciones"
import { createClient } from "@/lib/supabase/server"
import CotizacionPDF from "@/components/cotizaciones/CotizacionPDF"
import { createElement } from "react"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Autorización: token correcto (acceso público del cliente) O sesión válida
    // (descarga interna desde el dashboard). Sin ninguno → 401.
    // NO altera la tabla cotizaciones: solo lee el token para compararlo.
    const token = request.nextUrl.searchParams.get("token")

    let cotizacion = null

    if (token) {
      // El token es el secreto que el cliente ya posee vía /cotizacion/[token].
      // getCotizacionPorToken valida y carga con admin client (el visitante
      // anónimo no pasa las políticas RLS). Verificar que el id coincide.
      const porToken = await getCotizacionPorToken(token)
      if (porToken && porToken.id === id) cotizacion = porToken
    }

    if (!cotizacion) {
      // Sin token válido: exigir sesión autenticada (descarga interna).
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return new NextResponse("No autorizado", { status: 401 })
      cotizacion = await getCotizacion(id)
    }

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
