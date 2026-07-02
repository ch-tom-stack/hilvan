import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/cerrar-item (JSON)  { cotizacion_item_id, cerrado?, }
// Marca un ítem de cotización como RENDIDO/CERRADO (rendicion_completada) — el
// "cuadre" del presupuesto del ítem contra los gastos reales, que el productor (o
// el agente por instrucción) cierra aunque sobre o se exceda el presupuesto.
// Devuelve el cuadre (presupuesto vs gastado) para que quede claro qué se cierra.
// Reversible con /api/agent/deshacer: restaura rendicion_completada previo.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const cotizacion_item_id = String(body?.cotizacion_item_id ?? '').trim()
  if (!cotizacion_item_id) {
    return NextResponse.json({ error: 'Falta cotizacion_item_id' }, { status: 400 })
  }
  const cerrado = body?.cerrado === undefined ? true : body.cerrado
  if (typeof cerrado !== 'boolean') {
    return NextResponse.json({ error: 'cerrado debe ser boolean' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Leer el ítem (presupuesto + estado previo).
  const { data: item, error: eItem } = await admin
    .from('cotizacion_items')
    .select('id, nombre, precio_neto_proveedor, cantidad, rendicion_completada')
    .eq('id', cotizacion_item_id)
    .maybeSingle()
  if (eItem) return NextResponse.json({ error: eItem.message }, { status: 500 })
  if (!item) return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 })

  const previo = { rendicion_completada: item.rendicion_completada ?? false }

  const { error: eUpd } = await admin
    .from('cotizacion_items')
    .update({ rendicion_completada: cerrado })
    .eq('id', cotizacion_item_id)
  if (eUpd) {
    await registrarAccion({ herramienta: 'cerrar-item', payload: body, ok: false, error: eUpd.message })
    return NextResponse.json({ error: eUpd.message }, { status: 500 })
  }

  // Cuadre: presupuesto (costo proveedor del ítem) vs gastado (gastos reales, sin
  // los rechazados) — mismos estados que muestra la UI.
  const presupuesto = Math.round((item.precio_neto_proveedor ?? 0) * (item.cantidad ?? 0))
  const { data: gastos } = await admin
    .from('rendicion_gastos')
    .select('monto, estado')
    .eq('cotizacion_item_id', cotizacion_item_id)
  const gastado = (gastos ?? [])
    .filter((g: any) => ['enviada', 'aprobada', 'pago_aprobado'].includes(g.estado))
    .reduce((s: number, g: any) => s + (g.monto ?? 0), 0)

  await registrarAccion({
    herramienta: 'cerrar-item',
    payload: { cotizacion_item_id, cerrado, previo },
    resultado_tabla: 'cotizacion_items',
    resultado_id: cotizacion_item_id,
    ok: true,
  })

  return NextResponse.json({
    ok: true,
    cotizacion_item_id,
    nombre: item.nombre,
    rendicion_completada: cerrado,
    cuadre: {
      presupuesto,
      gastado,
      diferencia: presupuesto - gastado,
      estado: gastado > presupuesto ? 'excedido' : gastado < presupuesto ? 'bajo_presupuesto' : 'exacto',
    },
    previo,
  })
}
