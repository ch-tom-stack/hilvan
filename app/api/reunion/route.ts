import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { freeBusyGCal, crearReunionConMeet } from '@/lib/google-calendar'
import { slotDisponible, REUNIONES_CONFIG } from '@/lib/reuniones'
import { sendEmail } from '@/lib/email'
import { emailVisitante, emailInterno } from '@/lib/reuniones-email'

export const runtime = 'nodejs'

// Aviso interno: quién recibe la notificación + puede responder (Gmail compose).
const INTERNOS = ['tomas@casahiedra.com', 'natalia@casahiedra.com']
const RESPONSABLES = [
  { nombre: 'Tomás', tel: '+56991653035' },
  { nombre: 'Natalia', tel: '+56957121713' },
]
const APP = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.casahiedra.com').replace(/\/$/, '')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/reunion (público) — reserva directa de una reunión desde la web.
// Anti-abuso: honeypot (`empresa` oculto) + rate-limit por IP (máx 3/hora).
// Re-VALIDA en el backend que el slot siga libre (no confía en el cliente),
// crea el evento en Google Calendar y guarda en reuniones_web.
//
// NOTA: el comportamiento/copy de los correos está PENDIENTE de definir con Tomás
// (ver task "Correos reunión"). Lo de acá es un placeholder provisional.
export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }

  // Honeypot: campo oculto que un humano nunca llena.
  if (typeof body?.empresa === 'string' && body.empresa.trim() !== '') {
    return NextResponse.json({ ok: true }) // fingir éxito, no crear nada
  }

  const nombre = String(body?.nombre ?? '').trim()
  const email = String(body?.email ?? '').trim()
  const sitio_web = body?.sitio_web ? String(body.sitio_web).trim() : null
  const instagram = body?.instagram ? String(body.instagram).trim() : null
  const motivo = body?.motivo ? String(body.motivo).trim() : null
  const inicioISO = String(body?.inicio ?? '').trim()

  if (!nombre) return NextResponse.json({ error: 'Falta tu nombre' }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  if (!inicioISO) return NextResponse.json({ error: 'Elige un horario' }, { status: 400 })

  const admin = createAdminClient()
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconocida'

  // Rate-limit: máx 3 reservas por IP en la última hora.
  const haceUnaHora = new Date(Date.now() - 3600000).toISOString()
  const { count } = await admin
    .from('reuniones_web')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', haceUnaHora)
  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, { status: 429 })
  }

  // Re-validar disponibilidad contra el calendario real.
  const ahora = new Date()
  const desde = new Date(ahora.getTime())
  const hasta = new Date(ahora.getTime() + (REUNIONES_CONFIG.horizonteDias + 1) * 86400000)
  let ocupados: { start: string; end: string }[] = []
  try {
    ocupados = await freeBusyGCal(desde, hasta)
  } catch (e: any) {
    return NextResponse.json({ error: 'No pudimos verificar la disponibilidad. Intenta de nuevo.' }, { status: 503 })
  }
  const slot = slotDisponible(inicioISO, ahora, ocupados)
  if (!slot) {
    return NextResponse.json({ error: 'Ese horario ya no está disponible. Elige otro.' }, { status: 409 })
  }

  // Crear el evento en el calendario de reuniones (Workspace) CON Meet único.
  const descripcion = [
    'Reunión agendada desde la web.',
    `Nombre: ${nombre}`,
    `Email: ${email}`,
    sitio_web ? `Sitio: ${sitio_web}` : null,
    instagram ? `Instagram: ${instagram}` : null,
    motivo ? `Motivo: ${motivo}` : null,
  ].filter(Boolean).join('\n')

  let gcalId: string | null = null
  let meetLink: string | null = null
  try {
    const ev = await crearReunionConMeet(`Reunión · ${nombre}`, slot.inicio, slot.fin, descripcion)
    gcalId = ev.id
    meetLink = ev.meetLink
  } catch (e: any) {
    return NextResponse.json({ error: 'No pudimos agendar. Intenta de nuevo.' }, { status: 502 })
  }

  const token = crypto.randomUUID()
  const { error: eIns } = await admin.from('reuniones_web').insert({
    nombre, email, sitio_web, instagram, motivo,
    inicio: slot.inicio.toISOString(), fin: slot.fin.toISOString(),
    modalidad: 'videollamada', estado: 'agendada', gcal_event_id: gcalId, meet_link: meetLink, ip, token,
  })
  if (eIns) {
    // El evento ya se creó en GCal; no rompemos, solo lo registramos.
    console.error('reuniones_web insert falló:', eIns.message)
  }

  // ── Correos ────────────────────────────────────────────────────────────────
  // 1) Al visitante: acuse suave + La Lectura (la respuesta personal la mandan
  //    Tomás/Natalia después, desde su correo, vía el botón del correo interno).
  // 2) Interno a Tomás+Natalia: toda la info + botones "Responder" (Gmail compose
  //    pre-cargado) + link "Marcar como atendida" (token, sin login).
  const datos = { nombre, email, sitio_web, instagram, motivo, inicio: slot.inicio.toISOString() }
  try {
    const c1 = emailVisitante(nombre)
    await sendEmail({ from: 'Casa Hiedra <natalia@casahiedra.com>', to: email, subject: c1.subject, html: c1.html, contexto: 'reuniones:acuse' })
  } catch (e) { console.error('email visitante falló', e) }
  try {
    const confirmarUrl = `${APP}/api/reunion/confirmar?token=${token}`
    const ci = emailInterno(datos, RESPONSABLES, confirmarUrl, meetLink)
    await sendEmail({ from: 'Hilván <natalia@casahiedra.com>', to: INTERNOS.join(', '), subject: ci.subject, html: ci.html, contexto: 'reuniones:aviso_interno' })
  } catch (e) { console.error('email interno falló', e) }

  return NextResponse.json({ ok: true, inicio: slot.inicio.toISOString() })
}
