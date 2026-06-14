import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/pago-recibido (JSON)
// Marca el pago (y opcionalmente la factura) de una cotización.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { cotizacion_id, fecha_pago_recibido, fecha_factura_emitida, numero_factura } = body ?? {}

  if (!cotizacion_id || typeof cotizacion_id !== 'string') {
    return NextResponse.json({ error: 'Falta cotizacion_id' }, { status: 400 })
  }
  if (!fecha_pago_recibido || typeof fecha_pago_recibido !== 'string') {
    return NextResponse.json({ error: 'Falta fecha_pago_recibido' }, { status: 400 })
  }

  const admin = createAdminClient()

  const updates: Record<string, any> = { fecha_pago_recibido }
  if (fecha_factura_emitida) updates.fecha_factura_emitida = fecha_factura_emitida
  if (numero_factura) updates.numero_factura = numero_factura

  const { data, error } = await admin
    .from('cotizaciones')
    .update(updates)
    .eq('id', cotizacion_id)
    .select('id, fecha_factura_emitida, fecha_pago_recibido, numero_factura')
    .single()

  if (error) {
    await registrarAccion({ herramienta: 'pago-recibido', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'pago-recibido',
    payload: body,
    resultado_tabla: 'cotizaciones',
    resultado_id: cotizacion_id,
    ok: true,
  })

  return NextResponse.json({ ok: true, cotizacion: data })
}
