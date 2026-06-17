import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

const ACCIONES = ['crear', 'renombrar', 'reordenar', 'eliminar', 'mover_item']

function tablaDe(nivel: string) {
  return nivel === 'subgrupo' ? 'cotizacion_subgrupos' : 'cotizacion_departamentos'
}

// POST /api/agent/cotizacion-categoria (JSON: { accion, ... })
// Gestiona la estructura de categorías de una cotización. Acciones:
//  - crear:     { cotizacion_id, nivel, nombre, orden?, departamento_id? }
//  - renombrar: { nivel, id, nombre }
//  - reordenar: { nivel, id, orden }
//  - eliminar:  { nivel, id }   (solo si NO tiene ítems ni subgrupos)
//  - mover_item:{ item_id, departamento_id, subgrupo_id? }
// nivel = 'departamento' | 'subgrupo'. Todas reversibles con /api/agent/deshacer.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { accion } = body ?? {}
  if (typeof accion !== 'string' || !ACCIONES.includes(accion)) {
    return NextResponse.json({ error: `accion inválida (una de: ${ACCIONES.join(', ')})` }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── CREAR ───────────────────────────────────────────────────────────────
  if (accion === 'crear') {
    const { cotizacion_id, nivel, nombre, orden, departamento_id } = body
    if (nivel !== 'departamento' && nivel !== 'subgrupo') {
      return NextResponse.json({ error: "nivel debe ser 'departamento' o 'subgrupo'" }, { status: 400 })
    }
    if (!cotizacion_id || typeof cotizacion_id !== 'string') {
      return NextResponse.json({ error: 'Falta cotizacion_id' }, { status: 400 })
    }
    if (typeof nombre !== 'string' || !nombre.trim()) {
      return NextResponse.json({ error: 'nombre inválido' }, { status: 400 })
    }
    if (nivel === 'subgrupo' && (!departamento_id || typeof departamento_id !== 'string')) {
      return NextResponse.json({ error: 'subgrupo requiere departamento_id' }, { status: 400 })
    }
    const tabla = tablaDe(nivel)
    const fila: Record<string, unknown> = { cotizacion_id, nombre: nombre.trim(), orden: Number.isFinite(orden) ? Math.round(orden) : 0 }
    if (nivel === 'subgrupo') fila.departamento_id = departamento_id
    const { data, error } = await admin.from(tabla).insert(fila).select('id').single()
    if (error) {
      await registrarAccion({ herramienta: 'cotizacion-categoria', payload: body, ok: false, error: error.message })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    await registrarAccion({
      herramienta: 'cotizacion-categoria',
      payload: { accion, nivel },
      resultado_tabla: tabla,
      resultado_id: data.id,
      ok: true,
    })
    return NextResponse.json({ ok: true, accion, nivel, id: data.id })
  }

  // ── RENOMBRAR / REORDENAR ─────────────────────────────────────────────────
  if (accion === 'renombrar' || accion === 'reordenar') {
    const { nivel, id, nombre, orden } = body
    if (nivel !== 'departamento' && nivel !== 'subgrupo') {
      return NextResponse.json({ error: "nivel debe ser 'departamento' o 'subgrupo'" }, { status: 400 })
    }
    if (!id || typeof id !== 'string') return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    const tabla = tablaDe(nivel)
    const { data: fila, error: eLeer } = await admin.from(tabla).select('id, nombre, orden').eq('id', id).maybeSingle()
    if (eLeer) return NextResponse.json({ error: eLeer.message }, { status: 500 })
    if (!fila) return NextResponse.json({ error: `${nivel} no encontrado` }, { status: 404 })

    const cambios: Record<string, unknown> = {}
    const previo: Record<string, unknown> = {}
    if (accion === 'renombrar') {
      if (typeof nombre !== 'string' || !nombre.trim()) return NextResponse.json({ error: 'nombre inválido' }, { status: 400 })
      cambios.nombre = nombre.trim(); previo.nombre = fila.nombre
    } else {
      const n = typeof orden === 'number' ? orden : parseFloat(String(orden))
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'orden debe ser un número ≥ 0' }, { status: 400 })
      cambios.orden = Math.round(n); previo.orden = fila.orden
    }
    const { error: eUpd } = await admin.from(tabla).update(cambios).eq('id', id)
    if (eUpd) return NextResponse.json({ error: eUpd.message }, { status: 500 })
    await registrarAccion({
      herramienta: 'cotizacion-categoria',
      payload: { accion, nivel, id, previo, cambios },
      resultado_tabla: tabla,
      resultado_id: id,
      ok: true,
    })
    return NextResponse.json({ ok: true, accion, nivel, id, cambios, previo })
  }

  // ── ELIMINAR (solo si está vacío) ──────────────────────────────────────────
  if (accion === 'eliminar') {
    const { nivel, id } = body
    if (nivel !== 'departamento' && nivel !== 'subgrupo') {
      return NextResponse.json({ error: "nivel debe ser 'departamento' o 'subgrupo'" }, { status: 400 })
    }
    if (!id || typeof id !== 'string') return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    const tabla = tablaDe(nivel)

    // Verificar que no tenga ítems (ni subgrupos, si es departamento).
    const { count: nItems } = await admin
      .from('cotizacion_items')
      .select('id', { count: 'exact', head: true })
      .eq(nivel === 'subgrupo' ? 'subgrupo_id' : 'departamento_id', id)
    if ((nItems ?? 0) > 0) {
      return NextResponse.json({ error: `No se puede eliminar: tiene ${nItems} ítem(s). Muévelos o elimínalos primero.` }, { status: 400 })
    }
    if (nivel === 'departamento') {
      const { count: nSg } = await admin
        .from('cotizacion_subgrupos')
        .select('id', { count: 'exact', head: true })
        .eq('departamento_id', id)
      if ((nSg ?? 0) > 0) {
        return NextResponse.json({ error: `No se puede eliminar: tiene ${nSg} subgrupo(s).` }, { status: 400 })
      }
    }

    const { data: fila, error: eLeer } = await admin.from(tabla).select('*').eq('id', id).maybeSingle()
    if (eLeer) return NextResponse.json({ error: eLeer.message }, { status: 500 })
    if (!fila) return NextResponse.json({ error: `${nivel} no encontrado` }, { status: 404 })

    const { error: eDel } = await admin.from(tabla).delete().eq('id', id)
    if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 })
    await registrarAccion({
      herramienta: 'cotizacion-categoria',
      payload: { accion, nivel, fila },
      resultado_tabla: tabla,
      resultado_id: id,
      ok: true,
    })
    return NextResponse.json({ ok: true, accion, nivel, id })
  }

  // ── MOVER ÍTEM ──────────────────────────────────────────────────────────────
  if (accion === 'mover_item') {
    const { item_id, departamento_id, subgrupo_id } = body
    if (!item_id || typeof item_id !== 'string') return NextResponse.json({ error: 'Falta item_id' }, { status: 400 })
    if (!departamento_id || typeof departamento_id !== 'string') {
      return NextResponse.json({ error: 'Falta departamento_id destino' }, { status: 400 })
    }
    const sg = subgrupo_id && typeof subgrupo_id === 'string' ? subgrupo_id : null

    const { data: fila, error: eLeer } = await admin
      .from('cotizacion_items')
      .select('id, departamento_id, subgrupo_id')
      .eq('id', item_id)
      .maybeSingle()
    if (eLeer) return NextResponse.json({ error: eLeer.message }, { status: 500 })
    if (!fila) return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 })

    const previo = { departamento_id: fila.departamento_id, subgrupo_id: fila.subgrupo_id ?? null }
    const { error: eUpd } = await admin
      .from('cotizacion_items')
      .update({ departamento_id, subgrupo_id: sg })
      .eq('id', item_id)
    if (eUpd) return NextResponse.json({ error: eUpd.message }, { status: 500 })
    await registrarAccion({
      herramienta: 'cotizacion-categoria',
      payload: { accion, item_id, previo, nuevo: { departamento_id, subgrupo_id: sg } },
      resultado_tabla: 'cotizacion_items',
      resultado_id: item_id,
      ok: true,
    })
    return NextResponse.json({ ok: true, accion, item_id, previo })
  }

  return NextResponse.json({ error: 'accion no soportada' }, { status: 400 })
}
