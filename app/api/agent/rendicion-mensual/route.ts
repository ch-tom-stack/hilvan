import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/rendicion-mensual?periodo=YYYY-MM
// Devuelve la rendición mensual del período + sus gastos. Solo lee:
// si no existe devuelve { existe: false }.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const periodoRaw = new URL(req.url).searchParams.get('periodo')?.trim() ?? ''
  if (!/^\d{4}-\d{2}$/.test(periodoRaw)) {
    return NextResponse.json({ error: 'periodo inválido (formato YYYY-MM)' }, { status: 400 })
  }
  // El período se persiste como primer día del mes (YYYY-MM-01).
  const periodo = `${periodoRaw}-01`

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('rendiciones_mensuales')
    .select('*, gastos:rendicion_mensual_gastos(*)')
    .eq('periodo', periodo)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ existe: false })

  return NextResponse.json({ existe: true, ...data })
}
