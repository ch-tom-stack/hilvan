import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

interface ItemCotizacion {
  nombre: string
  codigo: string
  cantidad: number
  precio_jornada: number | null
}

interface Body {
  nombre: string
  email: string
  mensaje?: string
  equipos: ItemCotizacion[]
  jornadas: number
}

export async function POST(request: NextRequest) {
  try {
    const body: Body = await request.json()
    const { nombre, email, mensaje, equipos, jornadas } = body

    if (!nombre || !email || !equipos?.length) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    // Calcular totales
    const totalJornada = equipos.reduce((sum, e) => sum + (e.precio_jornada ?? 0) * e.cantidad, 0)
    const totalGeneral = totalJornada * jornadas
    const hayConsultar = equipos.some(e => !e.precio_jornada || e.precio_jornada === 0)

    const filasEquipos = equipos.map(e => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #383836;font-family:'DM Sans',sans-serif;font-size:13px;color:#f5f0e8;">
          ${e.nombre}${e.cantidad > 1 ? ` <span style="color:#9a9a92">×${e.cantidad}</span>` : ''}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #383836;font-family:'DM Sans',sans-serif;font-size:13px;color:#9a9a92;text-align:right;">
          ${e.precio_jornada && e.precio_jornada > 0
            ? `$${(e.precio_jornada * e.cantidad).toLocaleString('es-CL')} / jornada`
            : 'A consultar'}
        </td>
      </tr>
    `).join('')

    const resumenTotal = totalGeneral > 0
      ? `<tr>
          <td style="padding:14px 12px;font-family:'DM Sans',sans-serif;font-size:12px;color:#9a9a92;text-transform:uppercase;letter-spacing:0.1em;">
            Total (${jornadas} jornada${jornadas > 1 ? 's' : ''})
          </td>
          <td style="padding:14px 12px;font-family:'DM Sans',sans-serif;font-size:20px;color:#f5f0e8;text-align:right;font-style:italic;">
            $${totalGeneral.toLocaleString('es-CL')}
          </td>
        </tr>`
      : ''

    const notaConsultar = hayConsultar
      ? `<p style="font-family:'DM Sans',sans-serif;font-size:11px;color:#c9a84c;margin:8px 0 0;">* Algunos equipos tienen precio a confirmar</p>`
      : ''

    const htmlInterno = `
      <div style="background:#111110;padding:40px 32px;max-width:560px;margin:0 auto;">
        <p style="font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:#9a9a92;margin:0 0 24px;">
          Casa Hiedra · Rental
        </p>
        <h1 style="font-family:Georgia,serif;font-style:italic;font-size:32px;color:#f5f0e8;margin:0 0 8px;line-height:1;">
          Nueva solicitud de arriendo
        </h1>
        <p style="font-family:'DM Sans',sans-serif;font-size:13px;color:#9a9a92;margin:0 0 32px;">
          De parte de <strong style="color:#f5f0e8;">${nombre}</strong> — ${email}
        </p>

        <table style="width:100%;border-collapse:collapse;border:1px solid #383836;margin-bottom:8px;">
          ${filasEquipos}
          ${resumenTotal}
        </table>
        ${notaConsultar}

        ${mensaje ? `
        <div style="margin-top:24px;padding:16px;border:1px solid #383836;">
          <p style="font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:0.35em;text-transform:uppercase;color:#9a9a92;margin:0 0 8px;">Mensaje</p>
          <p style="font-family:'DM Sans',sans-serif;font-size:13px;color:#f5f0e8;margin:0;white-space:pre-wrap;">${mensaje}</p>
        </div>` : ''}

        <div style="margin-top:32px;padding-top:24px;border-top:1px solid #383836;">
          <p style="font-family:'DM Sans',sans-serif;font-size:11px;color:#8c8c86;margin:0;">
            Responder a: <a href="mailto:${email}" style="color:#7a9e7e;">${email}</a>
          </p>
        </div>
      </div>
    `

    const htmlCliente = `
      <div style="background:#111110;padding:40px 32px;max-width:560px;margin:0 auto;">
        <p style="font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:#9a9a92;margin:0 0 24px;">
          Casa Hiedra · Rental
        </p>
        <h1 style="font-family:Georgia,serif;font-style:italic;font-size:32px;color:#f5f0e8;margin:0 0 8px;line-height:1;">
          Tu solicitud de arriendo
        </h1>
        <p style="font-family:'DM Sans',sans-serif;font-size:13px;color:#9a9a92;margin:0 0 32px;">
          Hola ${nombre}, recibimos tu solicitud. Te respondemos a la brevedad.
        </p>

        <table style="width:100%;border-collapse:collapse;border:1px solid #383836;margin-bottom:8px;">
          ${filasEquipos}
          ${resumenTotal}
        </table>
        ${notaConsultar}

        ${mensaje ? `
        <div style="margin-top:24px;padding:16px;border:1px solid #383836;">
          <p style="font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:0.35em;text-transform:uppercase;color:#9a9a92;margin:0 0 8px;">Tu mensaje</p>
          <p style="font-family:'DM Sans',sans-serif;font-size:13px;color:#f5f0e8;margin:0;white-space:pre-wrap;">${mensaje}</p>
        </div>` : ''}

        <div style="margin-top:32px;padding-top:24px;border-top:1px solid #383836;">
          <p style="font-family:'DM Sans',sans-serif;font-size:11px;color:#8c8c86;margin:0;">
            Cualquier consulta: <a href="mailto:rental@casahiedra.com" style="color:#7a9e7e;">rental@casahiedra.com</a>
          </p>
        </div>
      </div>
    `

    // Enviar a rental@ (notificación interna) y al cliente
    await Promise.all([
      sendEmail({
        to: 'rental@casahiedra.com',
        subject: `Solicitud de arriendo — ${nombre}`,
        html: htmlInterno,
      }),
      sendEmail({
        to: email,
        subject: 'Tu solicitud de arriendo · Casa Hiedra',
        html: htmlCliente,
      }),
    ])

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Error enviando cotización:', error)
    return NextResponse.json({ error: 'Error al enviar' }, { status: 500 })
  }
}
