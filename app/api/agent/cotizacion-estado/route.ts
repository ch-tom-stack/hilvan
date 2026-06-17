import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

const ESTADOS = ['borrador', 'enviada', 'aprobada', 'rechazada', 'en_produccion', 'cerrada']

// POST /api/agent/cotizacion-estado (JSON: { cotizacion_id, estado })
// Cambia el estado de una cotización (ej. desaprobar para corregir y reaprobar).
// Reversible con /api/agent/deshacer: restaura el estado previo.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { cotizacion_id, estado } = body ?? {}
  if (!cotizacion_id || typeof cotizacion_id !== 'string') {
    return NextResponse.json({ error: 'Falta cotizacion_id' }, { status: 400 })
  }
  if (typeof estado !== 'string' || !ESTADOS.includes(estado)) {
    return NextResponse.json({ error: `estado inválido (uno de: ${ESTADOS.join(', ')})` }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: cot, error: eLeer } = await admin
    .from('cotizaciones')
    .select('id, estado')
    .eq('id', cotizacion_id)
    .maybeSingle()
  if (eLeer) return NextResponse.json({ error: eLeer.message }, { status: 500 })
  if (!cot) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })

  const previo_estado = cot.estado

  const { error: eUpd } = await admin.from('cotizaciones').update({ estado }).eq('id', cotizacion_id)
  if (eUpd) {
    await registrarAccion({ herramienta: 'cotizacion-estado', payload: body, ok: false, error: eUpd.message })
    return NextResponse.json({ error: eUpd.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'cotizacion-estado',
    payload: { cotizacion_id, previo_estado, nuevo_estado: estado },
    resultado_tabla: 'cotizaciones',
    resultado_id: cotizacion_id,
    ok: true,
  })

  return NextResponse.json({ ok: true, cotizacion_id, estado, previo_estado })
}
