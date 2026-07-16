// lib/descuento-email.ts
// Correo que recibe quien deja su correo en el pop-up de Rental: su código único.
// Estilos INLINE + stack de fuentes de respaldo (los clientes de correo no cargan
// Schibsted), rojo #C11700 solo en el bloque del código y el CTA.

const APP = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.casahiedra.com').replace(/\/$/, '')
const RENTAL = 'https://rental.casahiedra.com'
const FONT = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif"
const ROJO = '#C11700'
const TINTA = '#0A0A0A'
const OPACO = '#353135'

const fmtFecha = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso + 'T12:00:00'))

export function emailCodigoDescuento(
  { codigo, pct, vence_at, nombre }: { codigo: string; pct: number; vence_at: string; nombre?: string | null },
): { subject: string; html: string } {
  const saludo = nombre && !nombre.includes('@') ? `Hola ${nombre},` : 'Hola,'
  const subject = `Tu ${pct}% de descuento — código ${codigo}`
  const html = `
<div style="font-family:${FONT};max-width:560px;margin:0 auto;padding:8px 4px;color:${TINTA};">
  <img src="${APP}/logos/logo-horizontal-blanco.png" alt="Casa Hiedra" style="height:26px;margin:8px 0 28px;" />
  <p style="font-size:16px;line-height:1.5;margin:0 0 14px;">${saludo}</p>
  <p style="font-size:16px;line-height:1.5;margin:0 0 20px;">
    Acá está tu <strong>${pct}% de descuento</strong> para tu primer arriendo con nosotros.
  </p>

  <div style="border:2px solid ${ROJO};border-radius:2px;padding:18px;text-align:center;margin:0 0 20px;">
    <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${OPACO};margin:0 0 8px;">Tu código</p>
    <p style="font-size:30px;font-weight:800;letter-spacing:0.06em;color:${ROJO};margin:0;font-family:${FONT};">${codigo}</p>
  </div>

  <p style="font-size:14px;line-height:1.6;color:${OPACO};margin:0 0 20px;">
    Úsalo en el cotizador de rental: eliges tus fechas, armas tu selección y lo pegas en
    <em>“¿Tienes un código?”</em>. El descuento se aplica solo — y <strong style="color:${TINTA};">se suma</strong> a la promo y al descuento por volumen que ya tengamos vigente.
  </p>

  <a href="${RENTAL}" style="display:inline-block;background:${ROJO};color:#ffffff;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;font-size:13px;padding:13px 26px;border-radius:2px;text-decoration:none;">Armar mi cotización</a>

  <p style="font-size:13px;line-height:1.5;color:${OPACO};margin:24px 0 0;">
    Válido hasta el <strong style="color:${TINTA};">${fmtFecha(vence_at)}</strong>. Un código por persona.
    ¿Dudas? Responde este correo o escríbenos a <a href="mailto:rental@casahiedra.com" style="color:${TINTA};">rental@casahiedra.com</a>.
  </p>
  <p style="font-size:13px;color:${OPACO};margin:20px 0 0;">— Casa Hiedra</p>
</div>`
  return { subject, html }
}
