import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { COT_COBRAR_SELECT, calcularTotalCot, clienteCot } from '@/app/actions/financiero-helpers'

export const runtime = 'nodejs'

// GET /api/agent/cotizaciones?q=
// Busca cotizaciones por nombre, número de grupo o cliente.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('cotizaciones')
    .select(COT_COBRAR_SELECT)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filtro en memoria: cubre nombre, número de grupo y nombre de cliente
  // (libre o relacionado), que viven en columnas/relaciones distintas.
  const ql = q.toLowerCase()
  const filas = (data ?? [])
    .map((c: any) => ({
      id: c.id,
      numero: (c.grupo as any)?.numero_base ?? null,
      cliente: clienteCot(c),
      estado: c.estado,
      total: calcularTotalCot(c),
      fecha_factura_emitida: c.fecha_factura_emitida ?? null,
      fecha_pago_recibido: c.fecha_pago_recibido ?? null,
    }))
    .filter((c: any) =>
      !ql ||
      String(c.numero ?? '').toLowerCase().includes(ql) ||
      String(c.cliente ?? '').toLowerCase().includes(ql) ||
      String(c.estado ?? '').toLowerCase().includes(ql) ||
      // el nombre original de la cotización
      (data.find((d: any) => d.id === c.id)?.nombre ?? '').toLowerCase().includes(ql)
    )
    .slice(0, 50)

  return NextResponse.json(filas)
}
