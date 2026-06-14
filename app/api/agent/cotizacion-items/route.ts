import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/cotizacion-items
// Lista plana de ítems (con sus IDs) de una cotización.
// Necesario para hilvan_crear_gasto_proyecto, que exige cotizacion_item_id.
//
// Query params (al menos uno):
//   numero         — número visible del grupo (ej. CH-COT-005)
//   cotizacion_id  — UUID de una cotización específica
//
// Si se pasa `numero`, devuelve los ítems de TODAS las versiones del grupo
// (puede haber varias cotizaciones por grupo: v1, v2, variante A, etc.).
// Si se pasa `cotizacion_id`, devuelve solo los ítems de esa cotización.
//
// Devuelve lista plana ordenada por departamento.orden, item.orden:
//   { cotizacion_id, numero, version, variante, departamento, subgrupo, item_id, nombre, tipo }

export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const numero = searchParams.get('numero')?.trim() ?? ''
  const cotizacion_id = searchParams.get('cotizacion_id')?.trim() ?? ''

  if (!numero && !cotizacion_id) {
    return NextResponse.json(
      { error: 'Se requiere al menos uno: numero o cotizacion_id' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // ── Resolver qué cotizaciones cargar ─────────────────────────────────────
  let cotizacionIds: string[] = []
  let grupoNumero: string | null = null

  if (cotizacion_id) {
    cotizacionIds = [cotizacion_id]
  } else {
    // Resolver numero → grupo → cotizaciones
    const { data: grupo, error: grupoError } = await admin
      .from('cotizacion_grupos')
      .select('id, numero_base')
      .eq('numero_base', numero)
      .single()

    if (grupoError || !grupo) {
      return NextResponse.json(
        { error: `No se encontró ningún grupo con número "${numero}"` },
        { status: 404 },
      )
    }

    grupoNumero = grupo.numero_base as string

    const { data: cots, error: cotsError } = await admin
      .from('cotizaciones')
      .select('id')
      .eq('grupo_id', grupo.id)

    if (cotsError) return NextResponse.json({ error: cotsError.message }, { status: 500 })
    cotizacionIds = (cots ?? []).map((c: { id: string }) => c.id)
  }

  if (cotizacionIds.length === 0) {
    return NextResponse.json([])
  }

  // ── Cargar cotizaciones con departamentos e ítems ─────────────────────────
  // Patrón idéntico a cargarCotizacionCompleta en app/actions/cotizaciones.ts
  const { data: cotizaciones, error: cError } = await admin
    .from('cotizaciones')
    .select(
      `id, version, variante,
       grupo:cotizacion_grupos(numero_base),
       departamentos:cotizacion_departamentos(
         id, nombre, orden,
         subgrupos:cotizacion_subgrupos(
           id, nombre, orden,
           items:cotizacion_items(id, nombre, tipo, orden)
         ),
         items:cotizacion_items(id, nombre, tipo, orden, subgrupo_id)
       )`,
    )
    .in('id', cotizacionIds)

  if (cError) return NextResponse.json({ error: cError.message }, { status: 500 })

  // ── Aplanar en lista plana ────────────────────────────────────────────────
  type ItemPlano = {
    cotizacion_id: string
    numero: string | null
    version: string | null
    variante: string | null
    departamento: string
    subgrupo: string | null
    item_id: string
    nombre: string
    tipo: string | null
  }

  const items: ItemPlano[] = []

  for (const cot of cotizaciones ?? []) {
    const numero_base =
      grupoNumero ??
      (cot.grupo as unknown as { numero_base: string } | null)?.numero_base ??
      null

    const departamentos = [...(cot.departamentos ?? [])]
    departamentos.sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))

    for (const dep of departamentos) {
      // Ítems directos del departamento (subgrupo_id === null)
      const itemsDirect = ((dep.items ?? []) as any[])
        .filter((i: any) => i.subgrupo_id === null)
        .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))

      for (const item of itemsDirect) {
        items.push({
          cotizacion_id: cot.id as string,
          numero: numero_base,
          version: (cot.version as string | null) ?? null,
          variante: (cot.variante as string | null) ?? null,
          departamento: dep.nombre as string,
          subgrupo: null,
          item_id: item.id as string,
          nombre: item.nombre as string,
          tipo: (item.tipo as string | null) ?? null,
        })
      }

      // Ítems dentro de subgrupos
      const subgrupos = [...(dep.subgrupos ?? [])]
      subgrupos.sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))

      for (const sg of subgrupos) {
        const itemsSg = [...(sg.items ?? [])]
        itemsSg.sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))

        for (const item of itemsSg) {
          items.push({
            cotizacion_id: cot.id as string,
            numero: numero_base,
            version: (cot.version as string | null) ?? null,
            variante: (cot.variante as string | null) ?? null,
            departamento: dep.nombre as string,
            subgrupo: sg.nombre as string,
            item_id: item.id as string,
            nombre: item.nombre as string,
            tipo: (item.tipo as string | null) ?? null,
          })
        }
      }
    }
  }

  return NextResponse.json(items)
}
