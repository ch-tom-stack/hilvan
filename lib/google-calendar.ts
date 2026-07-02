import { google } from 'googleapis'

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
  const calId = process.env.GOOGLE_CALENDAR_ID!
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: fechaMin.toISOString(),
      timeMax: fechaMax.toISOString(),
      timeZone: 'America/Santiago',
      items: [{ id: calId }],
    },
  })
  const busy = res.data.calendars?.[calId]?.busy ?? []
  return busy
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
