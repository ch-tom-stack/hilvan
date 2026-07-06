import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Público (rewrite desde rental.casahiedra.com). Devuelve, para un rango de
// fechas, cuántas reservas CONFIRMADAS (aprobada/entregada) se solapan por
// equipo. El catálogo marca "bloqueado" el equipo cuyo conteo alcanza su stock.
// No bloquea cotizar: sólo informa disponibilidad.
export async function GET(request: NextRequest) {
  const desde = request.nextUrl.searchParams.get('desde')
  const hasta = request.nextUrl.searchParams.get('hasta')

  const FECHA = /^\d{4}-\d{2}-\d{2}$/
  if (!desde || !hasta || !FECHA.test(desde) || !FECHA.test(hasta) || hasta < desde) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('rental_reservas')
      .select('equipo_id')
      .in('estado', ['aprobada', 'entregada'])
      .not('equipo_id', 'is', null)
      .lte('fecha_inicio', hasta)
      .gte('fecha_fin', desde)

    if (error) return NextResponse.json({ bloqueos: {} })

    const bloqueos: Record<string, number> = {}
    for (const r of (data ?? []) as { equipo_id: string | null }[]) {
      if (r.equipo_id) bloqueos[r.equipo_id] = (bloqueos[r.equipo_id] ?? 0) + 1
    }
    return NextResponse.json({ bloqueos })
  } catch {
    return NextResponse.json({ bloqueos: {} })
  }
}
