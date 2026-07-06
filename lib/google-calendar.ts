import { google } from 'googleapis'
import { randomUUID } from 'node:crypto'

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!
  const key = typeof raw === 'string' ? JSON.parse(raw) : raw
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })
}

export async function getCalendarClient() {
  const auth = getAuth()
  return google.calendar({ version: 'v3', auth })
}

// Auth que IMPERSONA a un usuario de Workspace (delegación de dominio). Necesario
// para crear eventos con Meet ÚNICO: la cuenta gmail del calendario general
// (consumidor) no puede crear conferencias.
function getAuthImpersonando(subject: string) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!
  const key = typeof raw === 'string' ? JSON.parse(raw) : raw
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject,
  })
}

// Crea el evento de una reunión en el calendario de Workspace (REUNIONES_CALENDAR_ID)
// CON un Meet único, impersonando REUNIONES_IMPERSONATE (default tomas@casahiedra.com).
// Devuelve el id del evento y el link de Meet.
export async function crearReunionConMeet(
  titulo: string, inicio: Date, fin: Date, descripcion?: string,
): Promise<{ id: string | null; meetLink: string | null }> {
  const subject = process.env.REUNIONES_IMPERSONATE || 'tomas@casahiedra.com'
  const calId = process.env.REUNIONES_CALENDAR_ID!
  const calendar = google.calendar({ version: 'v3', auth: getAuthImpersonando(subject) })
  const res = await calendar.events.insert({
    calendarId: calId,
    conferenceDataVersion: 1,
    requestBody: {
      summary: titulo,
      description: descripcion,
      start: { dateTime: inicio.toISOString(), timeZone: 'America/Santiago' },
      end: { dateTime: fin.toISOString(), timeZone: 'America/Santiago' },
      conferenceData: { createRequest: { requestId: `r-${randomUUID()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    },
  })
  return { id: res.data.id ?? null, meetLink: res.data.hangoutLink ?? null }
}

export async function listarEventosGCal(fechaMin: Date, fechaMax: Date) {
  const calendar = await getCalendarClient()
  const res = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID!,
    timeMin: fechaMin.toISOString(),
    timeMax: fechaMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 500,
  })
  return res.data.items ?? []
}

// Intervalos OCUPADOS del calendario en un rango (para calcular disponibilidad).
export async function freeBusyGCal(
  fechaMin: Date,
  fechaMax: Date,
): Promise<{ start: string; end: string }[]> {
  const calendar = await getCalendarClient()
  // Ocupado = calendario general + calendario de reuniones (si existe), para no
  // ofrecer un slot que ya tiene una reunión agendada. Ambos deben estar
  // compartidos con el service account.
  const ids = [process.env.GOOGLE_CALENDAR_ID!]
  if (process.env.REUNIONES_CALENDAR_ID) ids.push(process.env.REUNIONES_CALENDAR_ID)
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: fechaMin.toISOString(),
      timeMax: fechaMax.toISOString(),
      timeZone: 'America/Santiago',
      items: ids.map((id) => ({ id })),
    },
  })
  const cals = res.data.calendars ?? {}
  return Object.values(cals)
    .flatMap((c) => c.busy ?? [])
    .filter((b) => b.start && b.end)
    .map((b) => ({ start: b.start as string, end: b.end as string }))
}

export async function crearEventoGCal(
  titulo: string,
  inicio: Date,
  fin: Date,
  descripcion?: string,
) {
  const calendar = await getCalendarClient()
  const res = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID!,
    requestBody: {
      summary: titulo,
      description: descripcion,
      start: { dateTime: inicio.toISOString(), timeZone: 'America/Santiago' },
      end:   { dateTime: fin.toISOString(),   timeZone: 'America/Santiago' },
    },
  })
  return res.data
}
