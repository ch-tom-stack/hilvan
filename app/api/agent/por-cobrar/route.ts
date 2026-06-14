import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { COT_COBRAR_SELECT, calcularTotalCot, clienteCot } from '@/app/actions/financiero-helpers'

export const runtime = 'nodejs'

// GET /api/agent/por-cobrar
// Cotizaciones facturadas (fecha_factura_emitida no nula) y sin pago
// (fecha_pago_recibido nula), con aging en días.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cotizaciones')
    .select(COT_COBRAR_SELECT)
    .not('fecha_factura_emitida', 'is', null)
    .is('fecha_pago_recibido', null)
    .order('fecha_factura_emitida', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const hoy = new Date()
  const filas = (data ?? []).map((c: any) => {
    const dias = Math.floor(
      (hoy.getTime() - new Date(c.fecha_factura_emitida).getTime()) / 86400000
    )
    return {
      cotizacion_id: c.id,
      numero: (c.grupo as any)?.numero_base ?? null,
      cliente: clienteCot(c),
      monto: calcularTotalCot(c),
      fecha_factura_emitida: c.fecha_factura_emitida,
      dias_aging: dias,
    }
  })

  return NextResponse.json(filas)
}
