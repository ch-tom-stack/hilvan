import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { porOrden } from '@/lib/orden'
import { encabezadoCotizacion } from '@/lib/cotizaciones-encabezado'
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
  // incluir_textos=false deja fuera descripciones y notas (respuesta más liviana).
  const incluirTextos = searchParams.get('incluir_textos') !== 'false'
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
      descripcion, notas_cliente, notas_internas, solicita, cliente_final, medios, referencia,
      cliente_id, cliente_nombre_libre, agencia_id, agencia_nombre_libre,
      cliente:clientes!cliente_id(nombre, empresa), agencia:clientes!agencia_id(nombre, empresa),
      grupo:cotizacion_grupos(numero_base),
      departamentos:cotizacion_departamentos(id, nombre, orden, precio_manual,
        subgrupos:cotizacion_subgrupos(id, nombre, orden, precio_manual, items:cotizacion_items(*)),
        items:cotizacion_items(*))`)
    .in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const itemOut = (i: any) => ({
    item_id: i.id, nombre: i.nombre, tipo: i.tipo,
    departamento_id: i.departamento_id, subgrupo_id: i.subgrupo_id ?? null,
    ...(incluirTextos ? { descripcion: i.descripcion ?? null } : {}),
    precio_cliente: i.precio_cliente, cantidad: i.cantidad, dias: i.dias, unidad: i.unidad,
    incluido: i.incluido, con_boleta: i.con_boleta, tasa_boleta: i.tasa_boleta,
    descuento_item: i.descuento_item, descuento_item_tipo: i.descuento_item_tipo,
    subtotal: subtotalItem(i),
  })

  const salida = (cots ?? []).map((cot: any) => {
    // Filtrar ítems directos (subgrupo_id === null) y ordenar, como en la app.
    const deps = [...(cot.departamentos ?? [])].sort(porOrden)
    for (const d of deps) {
      d.items = (d.items ?? []).filter((i: any) => i.subgrupo_id === null).sort(porOrden)
      d.subgrupos = [...(d.subgrupos ?? [])].sort(porOrden)
      for (const sg of d.subgrupos) sg.items = (sg.items ?? []).sort(porOrden)
    }
    const totales = calcularTotales({ ...cot, departamentos: deps } as any)
    const enc = encabezadoCotizacion(cot)
    return {
      cotizacion_id: cot.id,
      numero: (cot.grupo as any)?.numero_base ?? null,
      version: cot.version, variante: cot.variante, estado: cot.estado, nombre: cot.nombre,
      con_iva: cot.con_iva,
      // Encabezado: cliente (la marca) y, si hay intermediario, agencia.
      cliente: enc.cliente, agencia: enc.agencia,
      cliente_id: cot.cliente_id ?? null, agencia_id: cot.agencia_id ?? null,
      solicita: cot.solicita ?? null, medios: cot.medios ?? null, referencia: cot.referencia ?? null,
      ...(incluirTextos ? {
        descripcion: cot.descripcion ?? null,
        notas_cliente: cot.notas_cliente ?? null,
        notas_internas: cot.notas_internas ?? null,
      } : {}),
      departamentos: deps.map((d: any) => ({
        departamento_id: d.id,
        nombre: d.nombre,
        es_bundle: d.precio_manual != null,
        // vacio: sin ítems directos ni sub-grupos → se puede eliminar con hilvan_cotizacion_categoria.
        vacio: (d.items ?? []).length === 0 && (d.subgrupos ?? []).length === 0,
        subtotal: subtotalDepartamento(d),
        subgrupos: (d.subgrupos ?? []).map((sg: any) => ({
          subgrupo_id: sg.id, departamento_id: d.id,
          nombre: sg.nombre, es_bundle: sg.precio_manual != null, subtotal: subtotalSubgrupo(sg),
          vacio: (sg.items ?? []).length === 0,
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
