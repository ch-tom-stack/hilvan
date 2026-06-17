import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/cotizacion-editar-item (JSON)
// Edita un ítem existente de una cotización: precio_cliente, nombre, descripcion,
// incluido, cantidad, dias. Debe venir al menos uno. Si se manda precio_cliente,
// se marca precio_cliente_personalizado=true. Obtén item_id con hilvan_items_cotizacion.
// Reversible con /api/agent/deshacer: restaura los valores previos.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { item_id, precio_cliente, nombre, descripcion, incluido, cantidad, dias } = body ?? {}
  if (!item_id || typeof item_id !== 'string') {
    return NextResponse.json({ error: 'Falta item_id' }, { status: 400 })
  }

  const cambios: Record<string, unknown> = {}

  if (precio_cliente !== undefined) {
    const n = typeof precio_cliente === 'number' ? precio_cliente : parseFloat(String(precio_cliente))
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'precio_cliente debe ser un número ≥ 0' }, { status: 400 })
    }
    cambios.precio_cliente = Math.round(n)
    cambios.precio_cliente_personalizado = true
  }
  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || !nombre.trim()) {
      return NextResponse.json({ error: 'nombre inválido' }, { status: 400 })
    }
    cambios.nombre = nombre.trim()
  }
  if (descripcion !== undefined) {
    if (descripcion !== null && typeof descripcion !== 'string') {
      return NextResponse.json({ error: 'descripcion inválida (string o null)' }, { status: 400 })
    }
    cambios.descripcion = descripcion || null
  }
  if (incluido !== undefined) {
    if (typeof incluido !== 'boolean') {
      return NextResponse.json({ error: 'incluido debe ser boolean' }, { status: 400 })
    }
    cambios.incluido = incluido
  }
  for (const [k, v] of [['cantidad', cantidad], ['dias', dias]] as const) {
    if (v !== undefined) {
      const n = typeof v === 'number' ? v : parseFloat(String(v))
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json({ error: `${k} debe ser un número ≥ 1` }, { status: 400 })
      }
      cambios[k] = Math.round(n)
    }
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json(
      { error: 'Debe venir al menos uno de: precio_cliente, nombre, descripcion, incluido, cantidad, dias' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // Leer los valores previos SOLO de los campos que se van a tocar (para deshacer).
  const camposPrevio = ['precio_cliente', 'precio_cliente_personalizado', 'nombre', 'descripcion', 'incluido', 'cantidad', 'dias']
  const { data: fila, error: eLeer } = await admin
    .from('cotizacion_items')
    .select(['id', ...camposPrevio].join(', '))
    .eq('id', item_id)
    .maybeSingle()
  if (eLeer) return NextResponse.json({ error: eLeer.message }, { status: 500 })
  if (!fila) return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 })

  const filaAny = fila as unknown as Record<string, unknown>
  const previo: Record<string, unknown> = {}
  for (const k of Object.keys(cambios)) previo[k] = filaAny[k] ?? null

  const { error: eUpd } = await admin.from('cotizacion_items').update(cambios).eq('id', item_id)
  if (eUpd) {
    await registrarAccion({ herramienta: 'cotizacion-editar-item', payload: body, ok: false, error: eUpd.message })
    return NextResponse.json({ error: eUpd.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'cotizacion-editar-item',
    payload: { item_id, previo, cambios },
    resultado_tabla: 'cotizacion_items',
    resultado_id: item_id,
    ok: true,
  })

  return NextResponse.json({ ok: true, item_id, cambios, previo })
}
