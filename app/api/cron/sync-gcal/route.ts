import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listarEventosGCal } from '@/lib/google-calendar'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const ahora = new Date()

    const fechaMin = new Date(ahora)
    fechaMin.setDate(fechaMin.getDate() - 30)

    const fechaMax = new Date(ahora)
    fechaMax.setDate(fechaMax.getDate() + 90)

    const eventos = await listarEventosGCal(fechaMin, fechaMax)

    let upserted = 0
    let errors = 0

    for (const evento of eventos) {
      if (!evento.id || !evento.summary) continue

      const todoElDia = !evento.start?.dateTime
      const fechaInicio = evento.start?.dateTime ?? `${evento.start?.date}T00:00:00-04:00`
      const fechaFin    = evento.end?.dateTime   ?? `${evento.end?.date}T23:59:59-04:00`

      const { error } = await admin
        .from('eventos_calendario')
        .upsert(
          {
            google_event_id: evento.id,
            titulo:          evento.summary,
            descripcion:     evento.description ?? null,
            fecha_inicio:    fechaInicio,
            fecha_fin:       fechaFin,
            todo_el_dia:     todoElDia,
          },
          {
            onConflict:       'google_event_id',
            ignoreDuplicates: false,   // actualiza si el título/fecha cambian
          },
        )

      if (error) {
        console.error('sync-gcal upsert error:', error.message, evento.id)
        errors++
      } else {
        upserted++
      }
    }

    return NextResponse.json({
      ok: true,
      total: eventos.length,
      upserted,
      errors,
      rango: { desde: fechaMin.toISOString(), hasta: fechaMax.toISOString() },
    })
  } catch (err) {
    console.error('sync-gcal fatal:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
