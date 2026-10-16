import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LADOS_SII } from '@/lib/sii-cli'
import { periodosSemanales } from '@/lib/sii-cola'
import { encolar } from '@/lib/sii-cola-io'

export const runtime = 'nodejs'

// GET /api/cron/sii-semanal — lunes. Autenticado por CRON_SECRET.
//
// Encola la importación del SII del mes en curso y, hasta el día 15, también la
// del anterior. La procesa el Mac de Tomás cuando esté en línea
// (scripts/sii/trabajador.mjs). Si ya hay un pedido abierto, no duplica.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const encolados: { periodo: string; creada: boolean }[] = []
  for (const periodo of periodosSemanales(new Date())) {
    const r = await encolar(admin, periodo, [...LADOS_SII], 'cron')
    if (!r.ok) {
      console.error('[sii-semanal]', periodo, r.error)
      return NextResponse.json({ error: r.error, encolados }, { status: 500 })
    }
    encolados.push({ periodo, creada: r.valor.creada })
  }
  return NextResponse.json({ encolados })
}
