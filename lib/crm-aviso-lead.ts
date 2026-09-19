// lib/crm-aviso-lead.ts
// Aviso inmediato de lead nuevo.
//
// Un lead del sitio entra directo al Kanban, sin responsable, y nadie se entera
// hasta que abre el CRM o hasta el digest del día siguiente. Elipse.ai —tamaño
// grande— entró el 4-ago-2026 y recibió su primer correo de una persona 7 días
// después. La velocidad de la primera respuesta es de lo poco que se controla
// en un lead entrante; este correo existe para que nadie tenga que acordarse de
// mirar.

import { sendEmail } from '@/lib/email'

// Las mismas casillas a las que llega el digest matinal.
const DESTINATARIOS_DEFECTO = ['natalia@casahiedra.com', 'tomas@casahiedra.com']

export function destinatariosAvisoLead(): string[] {
  const env = (process.env.CRM_AVISO_LEAD_EMAILS ?? '')
    .split(',').map(s => s.trim()).filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
  return env.length > 0 ? env : DESTINATARIOS_DEFECTO
}

/** Todo lo que viene del formulario es texto de un desconocido: se escapa siempre. */
export function escaparHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export interface DatosAvisoLead {
  prospecto_id: string
  empresa: string
  nombre?: string | null
  email: string
  origen: string
  producto?: string | null
  accion?: string | null
  pagina?: string | null
  campana?: string | null
  url?: string | null
  contenido?: string | null
  hayLectura: boolean
}

const ACCION_LEGIBLE: Record<string, string> = {
  dejo_correo: 'dejó su correo',
  descargo_precios: 'descargó los precios',
  pidio_brief: 'pidió un brief',
  hizo_lectura: 'hizo La Lectura',
}

export function asuntoAvisoLead(d: DatosAvisoLead): string {
  const limpio = (s: string) => s.replace(/[\r\n]+/g, ' ').trim().slice(0, 80)
  return `Lead nuevo · ${limpio(d.empresa)}${d.producto ? ` · ${limpio(d.producto)}` : ''}`
}

export function htmlAvisoLead(d: DatosAvisoLead): string {
  const e = escaparHtml
  const fila = (k: string, v?: string | null) =>
    v ? `<tr><td style="padding:3px 12px 3px 0;color:#777;vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:3px 0;">${e(v)}</td></tr>` : ''
  const accion = d.accion ? (ACCION_LEGIBLE[d.accion] ?? d.accion) : null
  const extracto = d.contenido
    ? d.contenido.length > 600 ? d.contenido.slice(0, 600) + '…' : d.contenido
    : null
  const mismoNombre = !d.nombre || d.nombre === d.empresa || d.nombre === d.email

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <h2 style="font-size:18px;margin:0 0 4px;">Entró un lead: ${e(d.empresa)}</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#777;">Levantó la mano por su cuenta. Lo que más pesa ahora es contestar pronto.</p>
      <table style="font-size:13px;border-collapse:collapse;">
        ${mismoNombre ? '' : fila('Contacto', d.nombre)}
        ${fila('Correo', d.email)}
        ${fila('Qué hizo', accion)}
        ${fila('Producto', d.producto)}
        ${fila('En la página', d.pagina)}
        ${fila('Venía de', d.campana)}
        ${fila('Su sitio / IG', d.url)}
        ${fila('Origen', d.hayLectura ? `${d.origen} · trae La Lectura completa` : d.origen)}
      </table>
      ${extracto ? `<div style="margin:16px 0 0;padding:10px 12px;border-left:3px solid #ddd;font-size:13px;color:#333;white-space:pre-wrap;">${e(extracto)}</div>` : ''}
      <p style="margin:20px 0 0;"><a href="https://app.casahiedra.com/crm/${e(d.prospecto_id)}" style="color:#7a9e7e;">Abrir la ficha →</a></p>
      <p style="margin:14px 0 0;font-size:12px;color:#999;">Entró sin responsable: queda de quien la tome primero o de quien la reparta.</p>
    </div>`
}

/**
 * Manda el aviso. NUNCA lanza: que falle un correo no puede botar el alta del
 * lead, pero el fallo queda registrado.
 */
export async function avisarLeadNuevo(d: DatosAvisoLead): Promise<boolean> {
  try {
    await sendEmail({
      to: destinatariosAvisoLead(),
      subject: asuntoAvisoLead(d),
      html: htmlAvisoLead(d),
      contexto: 'crm:lead-nuevo',
    })
    return true
  } catch (err) {
    console.error('[crm-aviso-lead] no se pudo avisar del lead', d.prospecto_id, err)
    return false
  }
}
