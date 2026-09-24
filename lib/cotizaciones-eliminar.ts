// lib/cotizaciones-eliminar.ts
// Eliminar una cotización (una versión/variante) de forma REVERSIBLE.
//
// Borrado real, no soft-delete: así ningún listado, métrica o pipeline tiene
// que acordarse de filtrar. Lo reversible se logra capturando el árbol completo
// antes (cotización, grupos, sub-grupos, ítems y —si era la última versión— el
// grupo numerado) y guardándolo como op de historial: Ctrl+Z / hilvan_deshacer
// lo reinsertan con los mismos ids. El número NO se reutiliza: el contador es
// continuo y no depende de las filas existentes.
//
// No se borra lo que ya tiene vida financiera: rendiciones, gastos rendidos
// contra sus ítems o rodajes colgados de ella. Ahí se avisa qué la sostiene.

import type { SupabaseClient } from '@supabase/supabase-js'
import { opDelete, type Fila, type Op } from '@/lib/historial'

export interface ArbolCotizacion {
  numero: string | null
  nombre: string
  version: number
  variante: string | null
  borraGrupo: boolean
  op: Op
  items: number
}

/** Qué impide borrarla, en palabras. Vacío = se puede. */
export async function bloqueosCotizacion(admin: SupabaseClient, cotizacionId: string): Promise<string[]> {
  const motivos: string[] = []
  const [rend, rod, items] = await Promise.all([
    admin.from('rendiciones').select('id', { count: 'exact', head: true }).eq('cotizacion_id', cotizacionId),
    admin.from('rodajes').select('id', { count: 'exact', head: true }).eq('cotizacion_id', cotizacionId),
    admin.from('cotizacion_items').select('id').eq('cotizacion_id', cotizacionId),
  ])
  if ((rend.count ?? 0) > 0) motivos.push(`${rend.count} rendición(es) de gastos apuntan a ella`)
  if ((rod.count ?? 0) > 0) motivos.push(`${rod.count} rodaje(s) se sembraron desde ella`)
  const ids = (items.data ?? []).map(i => (i as { id: string }).id)
  if (ids.length > 0) {
    const { count } = await admin.from('rendicion_gastos').select('id', { count: 'exact', head: true }).in('cotizacion_item_id', ids)
    if ((count ?? 0) > 0) motivos.push(`${count} gasto(s) rendido(s) contra sus ítems`)
  }
  return motivos
}

/** Captura todo lo que hay que reinsertar para deshacer. Null si no existe. */
export async function capturarArbolCotizacion(admin: SupabaseClient, cotizacionId: string): Promise<ArbolCotizacion | null> {
  const { data: cot } = await admin.from('cotizaciones').select('*').eq('id', cotizacionId).maybeSingle()
  if (!cot) return null
  const c = cot as Fila & { grupo_id: string; nombre: string; version: number; variante: string | null }

  const [grupo, hermanas, deps, sgs, items] = await Promise.all([
    admin.from('cotizacion_grupos').select('*').eq('id', c.grupo_id).maybeSingle(),
    admin.from('cotizaciones').select('id', { count: 'exact', head: true }).eq('grupo_id', c.grupo_id),
    admin.from('cotizacion_departamentos').select('*').eq('cotizacion_id', cotizacionId),
    admin.from('cotizacion_subgrupos').select('*').eq('cotizacion_id', cotizacionId),
    admin.from('cotizacion_items').select('*').eq('cotizacion_id', cotizacionId),
  ])
  const borraGrupo = (hermanas.count ?? 1) <= 1 && !!grupo.data
  const arbol: { tabla: string; filas: Fila[] }[] = []
  if (borraGrupo) arbol.push({ tabla: 'cotizacion_grupos', filas: [grupo.data as Fila] })
  arbol.push({ tabla: 'cotizaciones', filas: [c] })
  arbol.push({ tabla: 'cotizacion_departamentos', filas: (deps.data ?? []) as Fila[] })
  arbol.push({ tabla: 'cotizacion_subgrupos', filas: (sgs.data ?? []) as Fila[] })
  arbol.push({ tabla: 'cotizacion_items', filas: (items.data ?? []) as Fila[] })
  const op = opDelete(arbol)
  if (!op) return null
  return {
    numero: (grupo.data as { numero_base?: string } | null)?.numero_base ?? null,
    nombre: c.nombre, version: c.version, variante: c.variante ?? null,
    borraGrupo, op, items: (items.data ?? []).length,
  }
}

/** Borra la cotización (y el grupo si quedó vacío). El árbol ya fue capturado. */
export async function borrarCotizacion(admin: SupabaseClient, cotizacionId: string, arbol: ArbolCotizacion): Promise<string | null> {
  // Hijos explícitos primero por si alguna FK no tiene cascada.
  for (const tabla of ['cotizacion_items', 'cotizacion_subgrupos', 'cotizacion_departamentos']) {
    const { error } = await admin.from(tabla).delete().eq('cotizacion_id', cotizacionId)
    if (error) return `${tabla}: ${error.message}`
  }
  const { error } = await admin.from('cotizaciones').delete().eq('id', cotizacionId)
  if (error) return error.message
  if (arbol.borraGrupo) {
    const grupoId = ((arbol.op as { arbol: { tabla: string; filas: Fila[] }[] }).arbol.find(n => n.tabla === 'cotizacion_grupos')?.filas[0] as Fila | undefined)?.id
    if (grupoId) {
      const { error: eG } = await admin.from('cotizacion_grupos').delete().eq('id', grupoId)
      if (eG) return `grupo: ${eG.message}`
    }
  }
  return null
}
