import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { listarCodigos } from '@/lib/descuento-codigos'

export const runtime = 'nodejs'

// GET /api/agent/codigos?estado=emitido|usado|anulado|vencido|todos&email=&limite=
// Lista los códigos de descuento para revisarlos (quién tiene, estado, vencimiento).
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado') ?? undefined
  const email = searchParams.get('email') ?? undefined
  const limite = parseInt(searchParams.get('limite') ?? '50', 10) || 50

  const admin = createAdminClient()
  const codigos = await listarCodigos(admin, { estado, email, limite })

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  const filas = codigos.map((c) => ({
    codigo: c.codigo,
    email: c.email,
    pct: c.pct,
    origen: c.origen,
    estado: c.estado === 'emitido' && c.vence_at < hoy ? 'vencido' : c.estado,
    vence_at: c.vence_at,
    usado_at: c.usado_at,
    cotizacion_id: c.cotizacion_id,
  }))

  return NextResponse.json({
    total: filas.length,
    resumen: {
      emitidos: filas.filter((f) => f.estado === 'emitido').length,
      usados: filas.filter((f) => f.estado === 'usado').length,
      vencidos: filas.filter((f) => f.estado === 'vencido').length,
      anulados: filas.filter((f) => f.estado === 'anulado').length,
    },
    codigos: filas,
  })
}
