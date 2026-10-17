// lib/cotizacion-referencias-io.ts
// Referencias OC/HES — la parte que toca la base. Reglas en lib/cotizacion-referencias.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Referencia } from '@/lib/cotizacion-referencias'

export const COLUMNAS_REFERENCIA =
  'id, cotizacion_id, tipo, folio, fecha, monto, glosa, estado, fuente, correo_id, correo_remitente, correo_asunto, correo_fecha, nota'

/** Referencias de varias cotizaciones, agrupadas por cotización. */
export async function referenciasDe(
  db: SupabaseClient,
  cotizacionIds: string[],
): Promise<{ ok: true; valor: Map<string, Referencia[]> } | { ok: false; error: string }> {
  const mapa = new Map<string, Referencia[]>()
  if (!cotizacionIds.length) return { ok: true, valor: mapa }
  const { data, error } = await db
    .from('cotizacion_referencias')
    .select(COLUMNAS_REFERENCIA)
    .in('cotizacion_id', cotizacionIds)
    .order('created_at', { ascending: true })
  if (error) return { ok: false, error: error.message }
  for (const r of (data ?? []) as Referencia[]) {
    mapa.set(r.cotizacion_id, [...(mapa.get(r.cotizacion_id) ?? []), r])
  }
  return { ok: true, valor: mapa }
}

/** Qué exige el cliente que recibe la factura (la agencia si hay, si no el cliente). */
export async function exigenciasDe(
  db: SupabaseClient,
  cotizacionIds: string[],
): Promise<{ ok: true; valor: Map<string, { oc: boolean; hes: boolean }> } | { ok: false; error: string }> {
  const mapa = new Map<string, { oc: boolean; hes: boolean }>()
  if (!cotizacionIds.length) return { ok: true, valor: mapa }
  const { data, error } = await db
    .from('cotizaciones')
    .select('id, agencia_id, cliente:clientes!cliente_id(exige_oc, exige_hes), agencia:clientes!agencia_id(exige_oc, exige_hes)')
    .in('id', cotizacionIds)
  if (error) return { ok: false, error: error.message }
  for (const c of (data ?? []) as any[]) {
    const factura = c.agencia_id ? c.agencia : c.cliente
    mapa.set(c.id, { oc: !!factura?.exige_oc, hes: !!factura?.exige_hes })
  }
  return { ok: true, valor: mapa }
}
