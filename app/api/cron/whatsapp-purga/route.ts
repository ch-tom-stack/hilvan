import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { purgar } from '@/lib/whatsapp-io'

export const runtime = 'nodejs'

// GET /api/cron/whatsapp-purga — diario. Autenticado por CRON_SECRET.
//
// Cumple lo que se prometió al conectar el número: los desconocidos no se
// quedan más de 30 días en cuarentena, y el texto crudo de una conversación ya
// resumida en el CRM se borra a los 90.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const res = await purgar(createAdminClient())
  if (res.error) {
    console.error('[whatsapp-purga]', res.error)
    return NextResponse.json(res, { status: 500 })
  }
  return NextResponse.json(res)
}
