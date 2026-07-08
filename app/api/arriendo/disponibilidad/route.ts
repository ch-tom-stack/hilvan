import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { expandirOcupacion } from '@/lib/rental-kits'

// Público (rewrite desde rental.casahiedra.com). Devuelve, para un rango de
// fechas, la ocupación por equipo considerando reservas CONFIRMADAS
// (aprobada/entregada) Y la composición de los kits: arrendar un kit ocupa sus
// componentes y viceversa (evita doble-booking). El catálogo marca "bloqueado"
// el equipo cuyo conteo alcanza su stock. No bloquea cotizar: sólo informa.
export async function GET(request: NextRequest) {
  const desde = request.nextUrl.searchParams.get('desde')
  const hasta = request.nextUrl.searchParams.get('hasta')

  const FECHA = /^\d{4}-\d{2}-\d{2}$/
  if (!desde || !hasta || !FECHA.test(desde) || !FECHA.test(hasta) || hasta < desde) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    const [{ data: reservas, error }, { data: equipos }] = await Promise.all([
      admin
        .from('rental_reservas')
        .select('equipo_id')
        .in('estado', ['aprobada', 'entregada'])
        .not('equipo_id', 'is', null)
        .lte('fecha_inicio', hasta)
        .gte('fecha_fin', desde),
      admin.from('equipos').select('id, codigo, cantidad'),
    ])

    if (error) return NextResponse.json({ bloqueos: {} })

    // Mapas id↔codigo↔stock
    const idToCodigo: Record<string, string> = {}
    const codigoToId: Record<string, string> = {}
    const stockPorCodigo: Record<string, number> = {}
    for (const e of (equipos ?? []) as { id: string; codigo: string; cantidad: number | null }[]) {
      idToCodigo[e.id] = e.codigo
      codigoToId[e.codigo] = e.id
      stockPorCodigo[e.codigo] = e.cantidad ?? 1
    }

    // Códigos con reserva confirmada solapada
    const reservados = ((reservas ?? []) as { equipo_id: string | null }[])
      .map((r) => (r.equipo_id ? idToCodigo[r.equipo_id] : null))
      .filter((c): c is string => Boolean(c))

    // Expandir kits↔componentes → ocupación por código → bloqueos por id
    const load = expandirOcupacion(reservados, stockPorCodigo)
    const bloqueos: Record<string, number> = {}
    for (const [codigo, n] of Object.entries(load)) {
      const id = codigoToId[codigo]
      if (id && n > 0) bloqueos[id] = n
    }

    return NextResponse.json({ bloqueos })
  } catch {
    return NextResponse.json({ bloqueos: {} })
  }
}
