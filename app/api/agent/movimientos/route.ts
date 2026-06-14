import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/movimientos
// Lista los movimientos bancarios importados (extractos de tarjeta/cuenta).
//
// Query params (todos opcionales):
//   conciliado — 'true' | 'false'
//   tipo       — 'cargo' | 'abono'
//   fuente     — texto exacto de la fuente
//   desde      — YYYY-MM-DD (fecha >=)
//   hasta      — YYYY-MM-DD (fecha <=)
//   q          — texto libre (case-insensitive) sobre descripcion / referencia
//
// Devuelve hasta 200 movimientos ordenados por fecha desc, cada uno con todos
// sus campos.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const conciliado = searchParams.get('conciliado')?.trim() ?? ''
  const tipo = searchParams.get('tipo')?.trim() ?? ''
  const fuente = searchParams.get('fuente')?.trim() ?? ''
  const desde = searchParams.get('desde')?.trim() ?? ''
  const hasta = searchParams.get('hasta')?.trim() ?? ''
  const q = searchParams.get('q')?.trim() ?? ''

  const admin = createAdminClient()

  let query = admin
    .from('movimientos_bancarios')
    .select(
      'id,fecha,descripcion,monto,tipo,fuente,referencia,conciliado,conciliado_tabla,conciliado_id,created_at',
    )
    .order('fecha', { ascending: false })
    .limit(200)

  if (conciliado === 'true') query = query.eq('conciliado', true)
  else if (conciliado === 'false') query = query.eq('conciliado', false)

  if (tipo === 'cargo' || tipo === 'abono') query = query.eq('tipo', tipo)
  if (fuente) query = query.eq('fuente', fuente)
  if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) query = query.gte('fecha', desde)
  if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) query = query.lte('fecha', hasta)
  if (q) query = query.or(`descripcion.ilike.*${q}*,referencia.ilike.*${q}*`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
