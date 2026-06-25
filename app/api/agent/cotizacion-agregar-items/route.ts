import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { validarItem } from '@/lib/agent-cotizacion'

export const runtime = 'nodejs'

// POST /api/agent/cotizacion-agregar-items (JSON)
// Inserta líneas NUEVAS en una cotización EXISTENTE (lo que faltaba: agregar/copiar
// ítems a algo ya creado, sin rehacer la cotización completa).
//   { cotizacion_id, items: [ { departamento, subgrupo?, nombre, precio_cliente?, cantidad?, dias?, unidad?, tipo?, descripcion?, incluido?, ... } ] }
// - departamento es por NOMBRE: si no existe en la cotización, se crea.
// - subgrupo (opcional) por nombre: si no existe en ese departamento, se crea.
// - Valida TODOS los ítems antes de escribir. Si algo falla a mitad, revierte lo
//   creado en este intento (no deja a medias).
// Reversible con /api/agent/deshacer: borra los ítems (y depto/subgrupo) creados.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { cotizacion_id, items } = body ?? {}
  if (!cotizacion_id || typeof cotizacion_id !== 'string') {
    return NextResponse.json({ error: 'Falta cotizacion_id' }, { status: 400 })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items debe ser un array no vacío' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: cot, error: eCot } = await admin
    .from('cotizaciones')
    .select('id')
    .eq('id', cotizacion_id)
    .maybeSingle()
  if (eCot) return NextResponse.json({ error: eCot.message }, { status: 500 })
  if (!cot) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })

  // ── Validar TODOS los ítems antes de escribir ──────────────────────────────
  const norm: { dep: string; subgrupo: string | null; item: any }[] = []
  for (let i = 0; i < items.length; i++) {
    const raw = items[i]
    const dep = typeof raw?.departamento === 'string' ? raw.departamento.trim() : ''
    if (!dep) return NextResponse.json({ error: `ítem ${i}: falta "departamento" (nombre)` }, { status: 400 })
    const v = validarItem(raw, `ítem ${i}`, 99)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    norm.push({ dep, subgrupo: typeof raw?.subgrupo === 'string' ? raw.subgrupo.trim() : null, item: v.data })
  }

  // ── Resolver/crear departamentos y subgrupos por nombre ────────────────────
  const { data: deps } = await admin
    .from('cotizacion_departamentos')
    .select('id, nombre, orden')
    .eq('cotizacion_id', cotizacion_id)
  const { data: sgs } = await admin
    .from('cotizacion_subgrupos')
    .select('id, nombre, departamento_id')
    .eq('cotizacion_id', cotizacion_id)

  const creados: { tabla: string; id: string }[] = []
  const depByName = new Map((deps ?? []).map((d: any) => [d.nombre.toLowerCase(), d]))
  let maxDepOrden = Math.max(-1, ...(deps ?? []).map((d: any) => d.orden ?? 0))
  const sgKey = (depId: string, nombre: string) => `${depId}|${nombre.toLowerCase()}`
  const sgMap = new Map((sgs ?? []).map((s: any) => [sgKey(s.departamento_id, s.nombre), s.id]))

  async function getDep(nombre: string): Promise<string> {
    const ex = depByName.get(nombre.toLowerCase())
    if (ex) return ex.id
    maxDepOrden++
    const { data, error } = await admin
      .from('cotizacion_departamentos')
      .insert({ cotizacion_id, nombre, orden: maxDepOrden })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    depByName.set(nombre.toLowerCase(), { id: data.id, nombre, orden: maxDepOrden })
    creados.push({ tabla: 'cotizacion_departamentos', id: data.id })
    return data.id
  }
  async function getSg(depId: string, nombre: string): Promise<string> {
    const k = sgKey(depId, nombre)
    const ex = sgMap.get(k)
    if (ex) return ex
    const { data, error } = await admin
      .from('cotizacion_subgrupos')
      .insert({ cotizacion_id, departamento_id: depId, nombre, orden: 0 })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    sgMap.set(k, data.id)
    creados.push({ tabla: 'cotizacion_subgrupos', id: data.id })
    return data.id
  }

  try {
    const insertados: any[] = []
    for (const n of norm) {
      const depId = await getDep(n.dep)
      const sgId = n.subgrupo ? await getSg(depId, n.subgrupo) : null
      const it = n.item
      const { data, error } = await admin
        .from('cotizacion_items')
        .insert({
          cotizacion_id,
          departamento_id: depId,
          subgrupo_id: sgId,
          tipo: it.tipo,
          equipo_id: it.equipo_id,
          tarifa_id: it.tarifa_id,
          nombre: it.nombre,
          descripcion: it.descripcion,
          con_boleta: it.con_boleta,
          tasa_boleta: it.tasa_boleta,
          precio_neto_proveedor: it.precio_neto_proveedor,
          precio_bruto: it.precio_bruto,
          precio_cliente_personalizado: it.precio_cliente_personalizado,
          precio_cliente: it.precio_cliente,
          cantidad: it.cantidad,
          dias: it.dias,
          unidad: it.unidad,
          incluido: it.incluido,
          descuento_item: it.descuento_item,
          descuento_item_tipo: it.descuento_item_tipo,
          orden: it.orden,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      creados.push({ tabla: 'cotizacion_items', id: data.id })
      insertados.push({ id: data.id, nombre: it.nombre, departamento: n.dep, subgrupo: n.subgrupo })
    }

    await registrarAccion({
      herramienta: 'cotizacion-agregar-items',
      payload: { cotizacion_id, creados },
      resultado_tabla: 'cotizaciones',
      resultado_id: cotizacion_id,
      ok: true,
    })

    return NextResponse.json({ ok: true, cotizacion_id, agregados: insertados.length, items: insertados })
  } catch (e) {
    // Rollback parcial: borrar lo creado en este intento (ítems primero, luego sub/dep).
    for (const c of [...creados].reverse()) await admin.from(c.tabla).delete().eq('id', c.id)
    await registrarAccion({ herramienta: 'cotizacion-agregar-items', payload: body, ok: false, error: e instanceof Error ? e.message : 'error' })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error agregando ítems' }, { status: 500 })
  }
}
