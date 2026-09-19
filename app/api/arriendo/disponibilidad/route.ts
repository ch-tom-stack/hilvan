import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { expandirOcupacion } from '@/lib/rental-kits'
import { contextoOcupacion } from '@/lib/rental-ocupacion'

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

    // Reservas confirmadas de equipos Y de maletas: una maleta reservada ocupa
    // lo que lleva adentro, así que su contenido se ve bloqueado en el catálogo.
    const ctx = await contextoOcupacion(admin, desde, hasta)
    if ('error' in ctx) return NextResponse.json({ bloqueos: {} })
    const { reservados, stockPorCodigo, codigoToId } = ctx

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
