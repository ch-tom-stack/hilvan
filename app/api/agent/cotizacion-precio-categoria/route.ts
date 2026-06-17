import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/cotizacion-precio-categoria (JSON)
// Fija (o limpia) el precio nativo de bundle de una categoría (departamento) o
// subcategoría (subgrupo). Si precio_manual es un número, el total de esa
// categoría es ese valor y los ítems pasan a ser solo descripción. Si es null,
// se vuelve a sumar los ítems.
// Reversible con /api/agent/deshacer: restaura el precio_manual previo.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { nivel, id, precio_manual } = body ?? {}

  if (nivel !== 'departamento' && nivel !== 'subgrupo') {
    return NextResponse.json({ error: "nivel debe ser 'departamento' o 'subgrupo'" }, { status: 400 })
  }
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Falta id (de la categoría/subcategoría)' }, { status: 400 })
  }

  // precio_manual: número ≥ 0, o null para limpiar.
  let precio: number | null
  if (precio_manual === null || precio_manual === undefined) {
    precio = null
  } else {
    const n = typeof precio_manual === 'number' ? precio_manual : parseFloat(String(precio_manual))
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'precio_manual debe ser un número ≥ 0 o null' }, { status: 400 })
    }
    precio = Math.round(n)
  }

  const tabla = nivel === 'subgrupo' ? 'cotizacion_subgrupos' : 'cotizacion_departamentos'
  const admin = createAdminClient()

  const { data: fila, error: eLeer } = await admin
    .from(tabla)
    .select('id, nombre, precio_manual')
    .eq('id', id)
    .maybeSingle()
  if (eLeer) return NextResponse.json({ error: eLeer.message }, { status: 500 })
  if (!fila) return NextResponse.json({ error: `${nivel} no encontrado` }, { status: 404 })

  const previo = { precio_manual: fila.precio_manual ?? null }

  const { error: eUpd } = await admin.from(tabla).update({ precio_manual: precio }).eq('id', id)
  if (eUpd) {
    await registrarAccion({ herramienta: 'cotizacion-precio-categoria', payload: body, ok: false, error: eUpd.message })
    return NextResponse.json({ error: eUpd.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'cotizacion-precio-categoria',
    payload: { id, nivel, nombre: fila.nombre, previo, nuevo: { precio_manual: precio } },
    resultado_tabla: tabla,
    resultado_id: id,
    ok: true,
  })

  return NextResponse.json({ ok: true, nivel, id, nombre: fila.nombre, precio_manual: precio, previo })
}
