import { NextRequest, NextResponse } from 'next/server'
import { procesarDigestMatinal } from '@/app/actions/crm'

export const runtime = 'nodejs'

// Cron matinal (días de semana): a cada operador, cuántos prospectos activos y
// borradores listos tiene al empezar la jornada. Autenticado por CRON_SECRET.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ?dry=true calcula y devuelve el resumen SIN enviar. ?solo=<email> limita el envío.
  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry') === 'true'
  const soloEmail = url.searchParams.get('solo') ?? undefined

  try {
    const resultado = await procesarDigestMatinal({ dryRun, soloEmail })
    return NextResponse.json({ ok: true, dryRun, ...resultado })
  } catch (error) {
    console.error('Error en cron crm-digest:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
