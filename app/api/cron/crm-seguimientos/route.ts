import { NextRequest, NextResponse } from 'next/server'
import { procesarSeguimientosCrm } from '@/app/actions/crm'

export const runtime = 'nodejs'

// Cron diario: alerta de seguimientos vencidos y prospectos estancados.
// Envía un digest por responsable (a su email). Autenticado por CRON_SECRET.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ?dry=true calcula y devuelve el resumen SIN enviar correos (pruebas/ops).
  const dryRun = new URL(request.url).searchParams.get('dry') === 'true'

  try {
    const resultado = await procesarSeguimientosCrm({ dryRun })
    return NextResponse.json({ ok: true, dryRun, ...resultado })
  } catch (error) {
    console.error('Error en cron crm-seguimientos:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
