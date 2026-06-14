import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/registrar-factura-emitida (JSON)
// Marca la factura EMITIDA de una cotización (fecha_factura_emitida + número),
// separado del pago. NO toca fecha_pago_recibido.
//
// Guarda los valores ANTERIORES en el log para poder deshacer (restaura lo
// previo, nunca a ciegas null).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { cotizacion_id, numero_factura, fecha_factura_emitida } = body ?? {}

  if (!cotizacion_id || typeof cotizacion_id !== 'string') {
    return NextResponse.json({ error: 'Falta cotizacion_id' }, { status: 400 })
  }
  if (
    !fecha_factura_emitida ||
    typeof fecha_factura_emitida !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha_factura_emitida)
  ) {
    return NextResponse.json(
      { error: 'Falta fecha_factura_emitida (formato YYYY-MM-DD)' },
      { status: 400 },
    )
  }
  if (numero_factura != null && typeof numero_factura !== 'string') {
    return NextResponse.json({ error: 'numero_factura debe ser texto' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verificar existencia y LEER los valores actuales ANTES de escribir.
  const { data: actual, error: eGet } = await admin
    .from('cotizaciones')
    .select('id, fecha_factura_emitida, numero_factura')
    .eq('id', cotizacion_id)
    .maybeSingle()
  if (eGet) return NextResponse.json({ error: eGet.message }, { status: 500 })
  if (!actual) {
    return NextResponse.json({ error: 'cotizacion_id no encontrado' }, { status: 404 })
  }

  const fecha_anterior = actual.fecha_factura_emitida ?? null
  const numero_anterior = actual.numero_factura ?? null

  const updates: Record<string, any> = { fecha_factura_emitida }
  // Solo tocar numero_factura si vino (incluido string vacío → null).
  const tocaNumero = numero_factura !== undefined
  if (tocaNumero) updates.numero_factura = numero_factura || null

  const { data, error } = await admin
    .from('cotizaciones')
    .update(updates)
    .eq('id', cotizacion_id)
    .select('id, fecha_factura_emitida, fecha_pago_recibido, numero_factura')
    .single()

  if (error) {
    await registrarAccion({
      herramienta: 'registrar-factura-emitida',
      payload: body,
      ok: false,
      error: error.message,
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'registrar-factura-emitida',
    payload: { fecha_anterior, numero_anterior },
    resultado_tabla: 'cotizaciones',
    resultado_id: cotizacion_id,
    ok: true,
  })

  return NextResponse.json({ ok: true, cotizacion: data })
}
