import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/cotizacion-eliminar-item (JSON: { item_id, motivo? })
// Elimina una línea (ítem) de una cotización. Obtén item_id con
// hilvan_cotizacion_detalle o hilvan_items_cotizacion.
// Reversible con /api/agent/deshacer: re-inserta la fila completa (mismo id).
// CONFIRMA con el usuario antes de llamar.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { item_id } = body ?? {}
  if (!item_id || typeof item_id !== 'string') {
    return NextResponse.json({ error: 'Falta item_id' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: fila, error: eLeer } = await admin
    .from('cotizacion_items')
    .select('*')
    .eq('id', item_id)
    .maybeSingle()
  if (eLeer) return NextResponse.json({ error: eLeer.message }, { status: 500 })
  if (!fila) return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 })

  const { error: eDel } = await admin.from('cotizacion_items').delete().eq('id', item_id)
  if (eDel) {
    await registrarAccion({ herramienta: 'cotizacion-eliminar-item', payload: body, ok: false, error: eDel.message })
    return NextResponse.json({ error: eDel.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'cotizacion-eliminar-item',
    payload: { item_id, motivo: body.motivo ?? null, fila },
    resultado_tabla: 'cotizacion_items',
    resultado_id: item_id,
    ok: true,
  })

  return NextResponse.json({ ok: true, item_id, nombre: fila.nombre })
}
