import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/flujo-caja
// Lista las filas de flujo_caja_manual (ingresos/gastos varios), incluidas las
// creadas al conciliar movimientos sin match.
//
// Query params (todos opcionales):
//   periodo — YYYY-MM (filtra por el mes de `fecha`)
//   tipo    — 'entrada' | 'salida'
//
// Devuelve hasta 200 filas ordenadas por fecha desc, con todos sus campos.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const periodo = searchParams.get('periodo')?.trim() ?? ''
  const tipo = searchParams.get('tipo')?.trim() ?? ''

  const admin = createAdminClient()

  let query = admin
    .from('flujo_caja_manual')
    .select('id, descripcion, monto, fecha, tipo, created_at, created_by')
    .order('fecha', { ascending: false })
    .limit(200)

  if (/^\d{4}-\d{2}$/.test(periodo)) {
    const [y, m] = periodo.split('-').map(Number)
    const inicio = periodo + '-01'
    // Primer día del mes siguiente (límite exclusivo), sin líos de fin de mes.
    const finExcl =
      m === 12
        ? `${y + 1}-01-01`
        : `${y}-${String(m + 1).padStart(2, '0')}-01`
    query = query.gte('fecha', inicio).lt('fecha', finExcl)
  }

  if (tipo === 'entrada' || tipo === 'salida') query = query.eq('tipo', tipo)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
