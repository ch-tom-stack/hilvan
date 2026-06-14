import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/cuotas-credito
// Lista las cuotas de créditos / gastos fijos (gastos_fijos_cuotas) con el
// nombre y acreedor de su crédito (gastos_fijos). Para cruzar pagos de crédito
// con movimientos bancarios.
//
// Query opcional:
//   pagada — 'true' | 'false' (default 'false' → solo cuotas pendientes)
//
// Devuelve hasta 200 cuotas ordenadas por fecha_vencimiento asc.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const pagadaParam = searchParams.get('pagada')?.trim() ?? ''
  // default: pendientes (false)
  const pagada = pagadaParam === 'true' ? true : false

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('gastos_fijos_cuotas')
    .select(
      'id,gasto_fijo_id,numero_cuota,fecha_vencimiento,monto,pagada,fecha_pago,' +
        'gasto_fijo:gastos_fijos(id,nombre,acreedor,tipo)',
    )
    .eq('pagada', pagada)
    .order('fecha_vencimiento', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cuotas = (data ?? []).map((c: any) => ({
    id: c.id,
    gasto_fijo_id: c.gasto_fijo_id,
    credito: c.gasto_fijo?.nombre ?? null,
    acreedor: c.gasto_fijo?.acreedor ?? null,
    tipo_credito: c.gasto_fijo?.tipo ?? null,
    numero_cuota: c.numero_cuota,
    fecha_vencimiento: c.fecha_vencimiento,
    monto: c.monto,
    pagada: c.pagada,
    fecha_pago: c.fecha_pago ?? null,
  }))

  return NextResponse.json(cuotas)
}
