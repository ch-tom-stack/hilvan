import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { buscarHermano, planOrden, type Hermano } from '@/lib/agent-cotizacion-orden'
import { porOrden } from '@/lib/orden'

export const runtime = 'nodejs'

// POST /api/agent/cotizacion-ordenar (JSON)
//   { cotizacion_id | numero,
//     ordenes: [ { nivel: 'departamento', orden: [...] },
//                { nivel: 'subgrupo', departamento, orden: [...] },
//                { nivel: 'item', departamento, subgrupo?, orden: [...] } ] }
//
// Ordena una cotización completa en una llamada. `orden` es una lista de NOMBRES
// o ids: lo nombrado va primero, en ese orden, y lo que no se nombra queda
// después conservando su orden relativo. `departamento` y `subgrupo` también
// aceptan nombre o id.
//
// VALIDA TODO antes de la primera escritura: un nombre que no existe, uno
// ambiguo o uno repetido devuelve 400 sin tocar nada. El orden es presentación
// pura (no entra en ningún total), así que sirve en cualquier estado.
// Reversible con /deshacer (restaura el orden anterior de cada fila).

const TABLA = {
  departamento: 'cotizacion_departamentos',
  subgrupo: 'cotizacion_subgrupos',
  item: 'cotizacion_items',
} as const
type Nivel = keyof typeof TABLA

export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const ordenes = body?.ordenes
  if (!Array.isArray(ordenes) || ordenes.length === 0 || ordenes.length > 60) {
    return NextResponse.json({ error: '"ordenes" debe ser una lista de 1 a 60 elementos' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Qué cotización ────────────────────────────────────────────────────────
  let cotizacionId = typeof body?.cotizacion_id === 'string' ? body.cotizacion_id.trim() : ''
  if (!cotizacionId) {
    const numero = typeof body?.numero === 'string' ? body.numero.trim() : ''
    if (!numero) return NextResponse.json({ error: 'Se requiere cotizacion_id o numero' }, { status: 400 })
    const { data: grupo } = await admin.from('cotizacion_grupos').select('id').eq('numero_base', numero).maybeSingle()
    if (!grupo) return NextResponse.json({ error: `No existe la cotización "${numero}"` }, { status: 404 })
    const { data: cots } = await admin.from('cotizaciones').select('id, version, variante, estado').eq('grupo_id', grupo.id)
    if (!cots || cots.length === 0) return NextResponse.json({ error: `"${numero}" no tiene documentos` }, { status: 404 })
    if (cots.length > 1) {
      // Cada versión/variante tiene su propio orden: no se elige por el agente.
      return NextResponse.json({
        error: `"${numero}" tiene ${cots.length} documentos; indica cotizacion_id`,
        documentos: cots.map((c: any) => ({ cotizacion_id: c.id, version: c.version, variante: c.variante, estado: c.estado })),
      }, { status: 400 })
    }
    cotizacionId = cots[0].id
  }

  const [{ data: cot }, deps, sgs, items] = await Promise.all([
    admin.from('cotizaciones').select('id').eq('id', cotizacionId).maybeSingle(),
    admin.from('cotizacion_departamentos').select('id, nombre, orden').eq('cotizacion_id', cotizacionId),
    admin.from('cotizacion_subgrupos').select('id, nombre, orden, departamento_id').eq('cotizacion_id', cotizacionId),
    admin.from('cotizacion_items').select('id, nombre, orden, created_at, departamento_id, subgrupo_id').eq('cotizacion_id', cotizacionId),
  ])
  if (!cot) return NextResponse.json({ error: 'cotizacion_id no encontrado' }, { status: 404 })
  if (deps.error || sgs.error || items.error) {
    return NextResponse.json({ error: (deps.error ?? sgs.error ?? items.error)!.message }, { status: 500 })
  }

  const todosDeps = (deps.data ?? []) as Hermano[]
  const todosSgs = (sgs.data ?? []) as (Hermano & { departamento_id: string })[]
  const todosItems = (items.data ?? []) as (Hermano & { departamento_id: string; subgrupo_id: string | null })[]

  // ── Validar TODO antes de escribir ────────────────────────────────────────
  const escrituras: { tabla: string; id: string; orden: number; previo: number }[] = []
  const listasTocadas = new Set<string>()
  const resumen: { donde: string; queda: string[] }[] = []

  for (let i = 0; i < ordenes.length; i++) {
    const o = ordenes[i]
    const etiqueta = `ordenes[${i}]`
    const nivel = o?.nivel as Nivel
    if (!(nivel in TABLA)) {
      return NextResponse.json({ error: `${etiqueta}: nivel debe ser departamento, subgrupo o item` }, { status: 400 })
    }

    let hermanos: Hermano[] = todosDeps
    let donde = 'grupos'
    let clave = 'departamento'

    if (nivel !== 'departamento') {
      if (typeof o?.departamento !== 'string' || !o.departamento.trim()) {
        return NextResponse.json({ error: `${etiqueta}: nivel "${nivel}" exige "departamento" (nombre o id)` }, { status: 400 })
      }
      const d = buscarHermano(todosDeps, o.departamento)
      if (!d.ok) return NextResponse.json({ error: `${etiqueta}: departamento — ${d.error}` }, { status: 400 })

      if (nivel === 'subgrupo') {
        hermanos = todosSgs.filter(s => s.departamento_id === d.fila.id)
        donde = `sub-grupos de ${d.fila.nombre}`
        clave = `subgrupo|${d.fila.id}`
      } else {
        let sgId: string | null = null
        let sgNombre = ''
        if (typeof o?.subgrupo === 'string' && o.subgrupo.trim()) {
          const s = buscarHermano(todosSgs.filter(x => x.departamento_id === d.fila.id), o.subgrupo)
          if (!s.ok) return NextResponse.json({ error: `${etiqueta}: subgrupo — ${s.error}` }, { status: 400 })
          sgId = s.fila.id
          sgNombre = s.fila.nombre
        }
        hermanos = todosItems.filter(x => x.departamento_id === d.fila.id && (x.subgrupo_id ?? null) === sgId)
        donde = sgId ? `ítems de ${d.fila.nombre} › ${sgNombre}` : `ítems directos de ${d.fila.nombre}`
        clave = `item|${d.fila.id}|${sgId ?? ''}`
      }
    }

    if (listasTocadas.has(clave)) {
      return NextResponse.json({ error: `${etiqueta}: ya hay otra orden para los ${donde}; júntalas en una` }, { status: 400 })
    }
    listasTocadas.add(clave)

    const plan = planOrden(hermanos, o?.orden)
    if (!plan.ok) return NextResponse.json({ error: `${etiqueta} (${donde}): ${plan.error}` }, { status: 400 })

    const previoPor = new Map(hermanos.map(h => [h.id, h.orden]))
    for (const c of plan.cambios) {
      escrituras.push({ tabla: TABLA[nivel], id: c.id, orden: c.orden, previo: previoPor.get(c.id) ?? 0 })
    }
    resumen.push({ donde, queda: plan.despues.map(x => x.nombre) })
  }

  // ── Escribir ──────────────────────────────────────────────────────────────
  const hechas: typeof escrituras = []
  for (const e of escrituras) {
    const { error } = await admin.from(e.tabla).update({ orden: e.orden }).eq('id', e.id).eq('cotizacion_id', cotizacionId)
    if (error) {
      // Se deshace lo que alcanzó a escribirse: o queda todo el orden nuevo o ninguno.
      for (const h of hechas) await admin.from(h.tabla).update({ orden: h.previo }).eq('id', h.id)
      await registrarAccion({ herramienta: 'cotizacion-ordenar', payload: { cotizacion_id: cotizacionId, ordenes }, ok: false, error: error.message })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    hechas.push(e)
  }

  await registrarAccion({
    herramienta: 'cotizacion-ordenar',
    payload: { cotizacion_id: cotizacionId, ordenes, previo: escrituras.map(e => ({ tabla: e.tabla, id: e.id, orden: e.previo })) },
    resultado_tabla: 'cotizaciones',
    resultado_id: cotizacionId,
    ok: true,
  })

  // El esqueleto completo, tal como queda: para verificar sin otra llamada.
  const ordenNuevo = new Map(escrituras.map(e => [e.id, e.orden]))
  const con = <T extends Hermano>(l: T[]) => l.map(x => ({ ...x, orden: ordenNuevo.get(x.id) ?? x.orden })).sort(porOrden)
  const estructura = con(todosDeps).map(d => ({
    grupo: d.nombre,
    items: con(todosItems.filter(x => x.departamento_id === d.id && !x.subgrupo_id)).map(x => x.nombre),
    subgrupos: con(todosSgs.filter(s => s.departamento_id === d.id)).map(s => ({
      subgrupo: s.nombre,
      items: con(todosItems.filter(x => x.subgrupo_id === s.id)).map(x => x.nombre),
    })),
  }))

  return NextResponse.json({ ok: true, cotizacion_id: cotizacionId, filas_modificadas: escrituras.length, cambios: resumen, estructura })
}
