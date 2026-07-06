// lib/reuniones-email.ts
// HTML de los correos del agendamiento web + deep-link de Gmail compose (para que
// Tomás/Natalia respondan desde su propio correo, en el navegador, sin mailto).
// Kit de marca en correos: estilos INLINE, stack de fuentes de respaldo (no
// Schibsted directo), rojo #C11700 solo para el CTA, ancho máx ~600px, logo PNG.

const APP = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.casahiedra.com').replace(/\/$/, '')
const LECTURA_URL = process.env.REUNIONES_LECTURA_URL || 'https://casahiedra.com/lectura'
const FONT = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif"
const ROJO = '#C11700'
const TINTA = '#0A0A0A'

export interface ReunionData {
  nombre: string; email: string; sitio_web: string | null; instagram: string | null
  motivo: string | null; inicio: string
}
export interface Responsable { nombre: string; tel: string }

const fmtLargo = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

// Deep-link a la redacción de Gmail (se abre en el navegador, cuenta activa).
export function gmailCompose(to: string, subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// Cuerpo pre-cargado de la RESPUESTA personal (Correo 2) — lo edita quien confirma.
export function cuerpoRespuesta(r: ReunionData, resp: Responsable, meet?: string | null): string {
  return [
    `Hola ${r.nombre}, quedó confirmada tu reunión para el ${fmtLargo(r.inicio)} (hora de Santiago).`,
    meet ? `Nos vemos acá: ${meet}` : '',
    '',
    `Encantado de conversar de ${r.motivo || 'tu proyecto'}. Cualquier duda, llámame o mándame un WhatsApp al ${resp.tel}.`,
    '',
    'Antes de cada reunión alimentamos un motor de prediagnóstico que complementa La Lectura — si tienes material o referencias que quieras enviarnos, las revisamos con gusto.',
    '',
    `— ${resp.nombre} · Casa Hiedra`,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}

// ── Correo 1 — al visitante (branded, breve) ──────────────────────────────
export function emailVisitante(nombre: string): { subject: string; html: string } {
  const subject = `Recibimos tu reserva, ${nombre}`
  const html = `
<div style="font-family:${FONT};max-width:560px;margin:0 auto;padding:8px 4px;color:${TINTA};">
  <img src="${APP}/logos/logo-horizontal-blanco.png" alt="Casa Hiedra" style="height:26px;margin:8px 0 28px;" />
  <p style="font-size:16px;line-height:1.5;margin:0 0 14px;">Hola ${nombre},</p>
  <p style="font-size:16px;line-height:1.5;margin:0 0 14px;">Le avisamos al equipo. Tomás o Natalia te escriben pronto para afinar los detalles.</p>
  <p style="font-size:16px;line-height:1.5;margin:0 0 22px;">Mientras, si quieres ir adelantando: La Lectura es un diagnóstico corto que nos ayuda a llegar preparados.</p>
  <a href="${LECTURA_URL}" style="display:inline-block;background:${ROJO};color:#ffffff;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;font-size:13px;padding:12px 24px;border-radius:2px;text-decoration:none;">Hacer La Lectura</a>
  <p style="font-size:13px;line-height:1.5;color:#353135;margin:28px 0 0;">— Casa Hiedra</p>
</div>`
  return { subject, html }
}

// ── Correo interno — a Tomás y Natalia (utilitario) ───────────────────────
export function emailInterno(r: ReunionData, responsables: Responsable[], confirmarUrl: string, meetLink?: string | null): { subject: string; html: string } {
  const subject = `Nueva reunión: ${r.nombre} — ${fmtLargo(r.inicio)}`
  const filas: [string, string | null][] = [
    ['Cuándo', fmtLargo(r.inicio)],
    ['Nombre', r.nombre],
    ['Email', r.email],
    ['Sitio', r.sitio_web],
    ['Instagram', r.instagram],
    ['Motivo', r.motivo],
  ]
  const info = filas
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#8c8c86;font-size:13px;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:3px 0;font-size:14px;color:${TINTA};">${v}</td></tr>`)
    .join('')
  const botonesResponder = responsables
    .map((resp) => {
      const url = gmailCompose(r.email, 'Confirmé tu reunión con Casa Hiedra', cuerpoRespuesta(r, resp, meetLink))
      return `<a href="${url}" style="display:inline-block;background:${ROJO};color:#fff;font-weight:500;text-transform:uppercase;letter-spacing:0.12em;font-size:12px;padding:11px 20px;border-radius:2px;text-decoration:none;margin:0 8px 8px 0;">Responder — ${resp.nombre}</a>`
    })
    .join('')
  const html = `
<div style="font-family:${FONT};max-width:600px;margin:0 auto;padding:8px 4px;color:${TINTA};">
  <p style="font-size:15px;margin:0 0 12px;"><strong>${r.nombre}</strong> agendó una reunión.</p>
  <table style="border-collapse:collapse;margin:0 0 20px;">${info}</table>
  <p style="font-size:12px;color:#8c8c86;margin:0 0 8px;">Responde desde tu correo (se abre pre-cargado en Gmail):</p>
  <div>${botonesResponder}</div>
  <p style="margin:18px 0 0;"><a href="${confirmarUrl}" style="font-size:13px;color:${TINTA};text-decoration:underline;">Marcar como atendida en Hilván →</a></p>
</div>`
  return { subject, html }
}
