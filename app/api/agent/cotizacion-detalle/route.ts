import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { subtotalItem, subtotalSubgrupo, subtotalDepartamento, calcularTotales } from '@/lib/cotizaciones-calc'

export const runtime = 'nodejs'

// GET /api/agent/cotizacion-detalle?numero=CH-COT-005  |  ?cotizacion_id=<uuid>
// Desglose CON precios + RESUMEN (subtotal por depto, neto, descuento, IVA, total).
// Para verificar montos sin abrir el navegador. Si se pasa `numero` con varias
// versiones, devuelve cada una. Solo lectura.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const numero = searchParams.get('numero')?.trim() ?? ''
  const cotizacion_id = searchParams.get('cotizacion_id')?.trim() ?? ''
  if (!numero && !cotizacion_id) {
    return NextResponse.json({ error: 'Se requiere numero o cotizacion_id' }, { status: 400 })
  }

  const admin = createAdminClient()

  let ids: string[] = []
  if (cotizacion_id) {
    ids = [cotizacion_id]
  } else {
    const { data: grupo } = await admin.from('cotizacion_grupos').select('id').eq('numero_base', numero).single()
    if (!grupo) return NextResponse.json({ error: `No existe el grupo "${numero}"` }, { status: 404 })
    const { data: cots } = await admin.from('cotizaciones').select('id').eq('grupo_id', grupo.id)
    ids = (cots ?? []).map((c: any) => c.id)
  }
  if (ids.length === 0) return NextResponse.json([])

  const { data: cots, error } = await admin
    .from('cotizaciones')
    .select(`id, version, variante, estado, nombre, con_iva, descuento_global, descuento_global_tipo,
      grupo:cotizacion_grupos(numero_base),
      departamentos:cotizacion_departamentos(id, nombre, orden, precio_manual,
        subgrupos:cotizacion_subgrupos(id, nombre, orden, precio_manual, items:cotizacion_items(*)),
        items:cotizacion_items(*))`)
    .in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const itemOut = (i: any) => ({
    item_id: i.id, nombre: i.nombre, tipo: i.tipo,
    precio_cliente: i.precio_cliente, cantidad: i.cantidad, dias: i.dias, unidad: i.unidad,
    incluido: i.incluido, con_boleta: i.con_boleta, tasa_boleta: i.tasa_boleta,
    descuento_item: i.descuento_item, descuento_item_tipo: i.descuento_item_tipo,
    subtotal: subtotalItem(i),
  })

  const salida = (cots ?? []).map((cot: any) => {
    // Filtrar ítems directos (subgrupo_id === null) y ordenar, como en la app.
    const deps = [...(cot.departamentos ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    for (const d of deps) {
      d.items = (d.items ?? []).filter((i: any) => i.subgrupo_id === null).sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
      d.subgrupos = [...(d.subgrupos ?? [])].sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
      for (const sg of d.subgrupos) sg.items = (sg.items ?? []).sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
    }
    const totales = calcularTotales({ ...cot, departamentos: deps } as any)
    return {
      cotizacion_id: cot.id,
      numero: (cot.grupo as any)?.numero_base ?? null,
      version: cot.version, variante: cot.variante, estado: cot.estado, nombre: cot.nombre,
      con_iva: cot.con_iva,
      departamentos: deps.map((d: any) => ({
        nombre: d.nombre,
        es_bundle: d.precio_manual != null,
        subtotal: subtotalDepartamento(d),
        subgrupos: (d.subgrupos ?? []).map((sg: any) => ({
          nombre: sg.nombre, es_bundle: sg.precio_manual != null, subtotal: subtotalSubgrupo(sg),
          items: (sg.items ?? []).map(itemOut),
        })),
        items: (d.items ?? []).map(itemOut),
      })),
      resumen: {
        neto: totales.neto,
        descuento_global: totales.descuento_global_monto,
        neto_con_descuento: totales.neto_con_descuento,
        iva: totales.iva,
        total: totales.total,
      },
    }
  })

  return NextResponse.json(salida)
}
