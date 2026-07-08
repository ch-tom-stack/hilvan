import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { diasArriendoInclusive, calcularArriendoWeb, ARRIENDO_MINIMO, formatCLP } from '@/lib/cotizaciones-calc'

interface ItemEntrada {
  equipo_id?: string | null
  nombre: string
  codigo: string
  cantidad: number
  precio_jornada: number | null
}

interface Body {
  nombre: string
  email: string
  mensaje?: string
  desde: string
  hasta: string
  equipos: ItemEntrada[]
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROJO = '#C11700'
const TINTA = '#0A0A0A'
const OPACO = '#353135'
const FONT = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif"
const APP = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.casahiedra.com').replace(/\/$/, '')

const fmtFecha = (d: string) =>
  new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d + 'T12:00:00'))

export async function POST(request: NextRequest) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const nombre = (body.nombre ?? '').trim()
  const email = (body.email ?? '').trim()
  const mensaje = (body.mensaje ?? '').trim()
  const { desde, hasta } = body
  const equipos = Array.isArray(body.equipos) ? body.equipos : []

  if (!nombre || !EMAIL_RE.test(email) || !equipos.length) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  }
  if (!FECHA.test(desde ?? '') || !FECHA.test(hasta ?? '') || hasta < desde) {
    return NextResponse.json({ error: 'Fechas inválidas' }, { status: 400 })
  }

  const dias = diasArriendoInclusive(desde, hasta)
  if (dias < 1) return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 })

  const admin = createAdminClient()

  // Precios REALES desde la DB (no se confía en el precio que manda el cliente).
  const idsPedidos = equipos.map((e) => e.equipo_id).filter((v): v is string => typeof v === 'string' && v.length > 0)
  const precioPorId: Record<string, number> = {}
  if (idsPedidos.length) {
    const { data: eqs } = await admin.from('equipos').select('id, precio_jornada').in('id', idsPedidos)
    for (const e of (eqs ?? []) as { id: string; precio_jornada: number | null }[]) {
      precioPorId[e.id] = Number.isFinite(e.precio_jornada) && (e.precio_jornada ?? 0) > 0 ? Math.round(e.precio_jornada as number) : 0
    }
  }

  // Normalizar ítems: precio tomado de la DB por equipo_id; cantidad ≥ 1.
  const items = equipos
    .map((e) => {
      const cantidad = Math.max(1, Math.round(Number(e.cantidad) || 1))
      const precio = e.equipo_id ? (precioPorId[e.equipo_id] ?? 0) : 0
      return {
        equipo_id: e.equipo_id ?? null,
        nombre: String(e.nombre ?? '').slice(0, 200),
        codigo: String(e.codigo ?? '').slice(0, 60),
        cantidad,
        precio,
      }
    })
    .filter((e) => e.nombre)

  if (!items.length) return NextResponse.json({ error: 'Sin equipos válidos' }, { status: 400 })

  const neto = items.reduce((s, i) => s + i.precio * i.cantidad * dias, 0)
  if (neto < ARRIENDO_MINIMO) {
    return NextResponse.json({ error: `Arriendo mínimo ${formatCLP(ARRIENDO_MINIMO)} neto` }, { status: 400 })
  }
  const { promoPct, volumenPct, descuentoPct, descuentoMonto, iva, total, consultar } = calcularArriendoWeb(neto)
  const hayConsultar = items.some((i) => i.precio === 0)

  // ── Número correlativo R-XXX ──────────────────────────────────────────
  const { data: ultima } = await admin
    .from('rental_cotizaciones')
    .select('numero')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ numero: string }>()

  let siguiente = 1
  const match = ultima?.numero?.match(/R-(\d+)/)
  if (match) siguiente = parseInt(match[1]) + 1
  const numero = `R-${String(siguiente).padStart(3, '0')}`

  const periodo = `Período solicitado: ${desde} al ${hasta} (${dias} ${dias === 1 ? 'jornada' : 'jornadas'}). Retiro desde 08:00, devolución hasta 22:00.`
  const detalleDesc = descuentoPct > 0
    ? `Descuento aplicado: ${descuentoPct}%${promoPct > 0 ? ` (promo Jul–Ago ${promoPct}%${volumenPct > 0 ? ` + volumen ${volumenPct}%` : ''})` : ` (volumen)`}.`
    : ''
  const notasInternas = [
    'Generada desde el sitio web (rental.casahiedra.com).',
    periodo,
    detalleDesc,
    mensaje ? `Nota del cliente: ${mensaje}` : '',
  ].filter(Boolean).join('\n')

  // ── Cabecera de la cotización ─────────────────────────────────────────
  const { data: cot, error: errCot } = await admin
    .from('rental_cotizaciones')
    .insert({
      numero,
      estado: 'enviada',
      con_iva: true,
      descuento_global: descuentoPct,
      descuento_global_tipo: 'porcentaje',
      cliente_nombre_libre: nombre,
      cliente_email_libre: email,
      notas_internas: notasInternas,
    })
    .select('id')
    .single<{ id: string }>()

  if (errCot || !cot) {
    console.error('[arriendo] insert cotizacion:', errCot)
    return NextResponse.json({ error: 'No se pudo generar la cotización' }, { status: 500 })
  }

  // ── Sección + ítems ───────────────────────────────────────────────────
  const { data: seccion } = await admin
    .from('rental_cotizacion_secciones')
    .insert({ cotizacion_id: cot.id, nombre: 'Equipos', orden: 1 })
    .select('id')
    .single<{ id: string }>()

  const filasItems = items.map((it, idx) => ({
    cotizacion_id: cot.id,
    seccion_id: seccion?.id ?? null,
    equipo_id: it.equipo_id,
    maleta_id: null,
    descripcion: it.codigo ? `${it.codigo} · ${it.nombre}` : it.nombre,
    cantidad: it.cantidad,
    dias,
    precio_unitario: it.precio,
    descuento: 0,
    descuento_tipo: 'porcentaje',
    incluido: false,
    orden: idx + 1,
  }))

  const { error: errItems } = await admin.from('rental_cotizacion_items').insert(filasItems)
  if (errItems) {
    console.error('[arriendo] insert items:', errItems)
    // La cabecera ya existe; se puede completar a mano. No abortamos el correo.
  }

  // ── Correos (marca Casa Hiedra, fondo claro) ──────────────────────────
  const filasHTML = items.map((it) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #0A0A0A14;font-size:14px;color:${TINTA};">
        ${it.codigo ? `${it.codigo} · ` : ''}${it.nombre}${it.cantidad > 1 ? ` <span style="color:${OPACO}">×${it.cantidad}</span>` : ''}
      </td>
      <td style="padding:9px 0;border-bottom:1px solid #0A0A0A14;font-size:14px;color:${OPACO};text-align:right;white-space:nowrap;">
        ${it.precio > 0 ? formatCLP(it.precio * it.cantidad * dias) : 'A confirmar'}
      </td>
    </tr>`).join('')

  const filaTotal = (etq: string, val: string, fuerte = false) => `
    <tr>
      <td style="padding:6px 0;font-size:${fuerte ? 15 : 13}px;color:${fuerte ? TINTA : OPACO};${fuerte ? 'font-weight:600;' : ''}">${etq}</td>
      <td style="padding:6px 0;font-size:${fuerte ? 17 : 13}px;color:${fuerte ? TINTA : OPACO};text-align:right;${fuerte ? 'font-weight:600;' : ''}">${val}</td>
    </tr>`

  const bloqueTotales = `
    <table style="width:100%;border-collapse:collapse;margin-top:6px;">
      ${filaTotal('Neto', formatCLP(neto))}
      ${descuentoPct > 0 ? filaTotal(
        promoPct > 0 && volumenPct > 0 ? `Promo Jul–Ago 30% + volumen ${volumenPct}%`
          : promoPct > 0 ? 'Promo Julio–Agosto (30%)'
          : `Descuento por volumen (${volumenPct}%)`,
        `− ${formatCLP(descuentoMonto)}`) : ''}
      ${filaTotal('IVA (19%)', formatCLP(iva))}
      ${filaTotal('Total', formatCLP(total), true)}
    </table>`

  const notas: string[] = []
  if (hayConsultar) notas.push('Algunos equipos tienen precio a confirmar; te lo afinamos al responder.')
  if (consultar) notas.push('Por este volumen podemos ofrecerte un valor especial: consúltanos al responder este correo.')

  const cuerpo = (intro: string, mostrarContacto: boolean) => `
    <div style="font-family:${FONT};max-width:580px;margin:0 auto;padding:8px 4px;color:${TINTA};">
      <img src="${APP}/logos/logo-horizontal-blanco.png" alt="Casa Hiedra" style="height:24px;margin:8px 0 26px;" />
      <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${OPACO};margin:0 0 6px;">Cotización de arriendo · ${numero}</p>
      <p style="font-size:16px;line-height:1.5;margin:0 0 18px;">${intro}</p>
      <p style="font-size:13px;color:${OPACO};margin:0 0 4px;">${periodo}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0 4px;">${filasHTML}</table>
      ${bloqueTotales}
      ${notas.map((n) => `<p style="font-size:12px;color:${ROJO};margin:12px 0 0;">${n}</p>`).join('')}
      ${mensaje ? `<div style="margin-top:20px;padding:14px 16px;border:1px solid #0A0A0A22;border-radius:2px;"><p style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${OPACO};margin:0 0 6px;">Nota</p><p style="font-size:14px;color:${TINTA};margin:0;white-space:pre-wrap;">${mensaje}</p></div>` : ''}
      ${mostrarContacto ? `<p style="font-size:13px;line-height:1.5;color:${OPACO};margin:26px 0 0;">Esto es una estimación referencial sujeta a disponibilidad. Te escribimos para confirmar y coordinar retiro/devolución. Cualquier duda, responde este correo o escríbenos a <a href="mailto:rental@casahiedra.com" style="color:${TINTA};">rental@casahiedra.com</a>.</p>` : ''}
      <p style="font-size:13px;color:${OPACO};margin:22px 0 0;">— Casa Hiedra</p>
    </div>`

  try {
    await Promise.all([
      sendEmail({
        to: 'rental@casahiedra.com',
        subject: `Nueva cotización web ${numero} — ${nombre}`,
        html: cuerpo(
          `<strong>${nombre}</strong> (${email}) generó una cotización desde el sitio. Revísala en <a href="${APP}/rental/cotizaciones" style="color:${TINTA};">Hilván</a> para aprobar o ajustar.`,
          false,
        ),
        contexto: 'arriendo:cotizacion_web_interna',
      }),
      sendEmail({
        to: email,
        subject: `Tu cotización de arriendo ${numero} · Casa Hiedra`,
        html: cuerpo(`Hola ${nombre}, acá está tu cotización.`, true),
        contexto: 'arriendo:cotizacion_web_cliente',
      }),
    ])
  } catch (e) {
    console.error('[arriendo] email cotización web:', e)
    // El correo no aborta: la cotización ya quedó registrada en Hilván.
  }

  return NextResponse.json({ ok: true, numero, total, dias, descuentoPct, consultar })
}
