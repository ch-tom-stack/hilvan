import { NextRequest, NextResponse } from 'next/server'
import { enviarRecordatorios } from '@/app/actions/rodaje'

export async function GET(request: NextRequest) {
  // Verificar que viene de Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const resultado = await enviarRecordatorios()
    return NextResponse.json({ ok: true, ...resultado })
  } catch (error) {
    console.error('Error en cron recordatorios:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
