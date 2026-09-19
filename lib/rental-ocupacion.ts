// lib/rental-ocupacion.ts
// Ocupación de equipos por reservas confirmadas, contando kits Y maletas.
// Lo comparten el formulario interno de reservas, la aprobación y el catálogo
// público de rental: una sola regla para "¿está libre esto en estas fechas?".

import type { SupabaseClient } from '@supabase/supabase-js'
import { codigosDeReserva, type Componente } from '@/lib/rental-kits'

export interface ContextoOcupacion {
  idToCodigo: Record<string, string>
  codigoToId: Record<string, string>
  stockPorCodigo: Record<string, number>
  nombrePorCodigo: Record<string, string>
  itemsPorMaleta: Record<string, Componente[]>
  /** Reservas confirmadas que se cruzan con el rango, con lo que cada una ocupa. */
  reservas: { id: string; fecha_inicio: string; fecha_fin: string; codigos: string[] }[]
  /** Todos los códigos ocupados, con repetición (entrada de expandirOcupacion). */
  reservados: string[]
}

export async function contextoOcupacion(
  admin: SupabaseClient,
  desde: string,
  hasta: string,
  excluirReservaId?: string,
): Promise<ContextoOcupacion | { error: string }> {
  let q = admin
    .from('rental_reservas')
    .select('id, equipo_id, maleta_id, fecha_inicio, fecha_fin')
    .in('estado', ['aprobada', 'entregada'])
    .lte('fecha_inicio', hasta)
    .gte('fecha_fin', desde)
  if (excluirReservaId) q = q.neq('id', excluirReservaId)

  const [res, equipos, items, maletas] = await Promise.all([
    q,
    admin.from('equipos').select('id, codigo, cantidad, nombre'),
    admin.from('maleta_items').select('maleta_id, equipo_id, cantidad'),
    admin.from('maletas').select('id, codigo, nombre'),
  ])
  if (res.error) return { error: res.error.message }
  if (equipos.error) return { error: equipos.error.message }

  const idToCodigo: Record<string, string> = {}
  const codigoToId: Record<string, string> = {}
  const stockPorCodigo: Record<string, number> = {}
  const nombrePorCodigo: Record<string, string> = {}
  for (const e of (equipos.data ?? []) as { id: string; codigo: string; cantidad: number | null; nombre: string }[]) {
    idToCodigo[e.id] = e.codigo
    codigoToId[e.codigo] = e.id
    stockPorCodigo[e.codigo] = e.cantidad ?? 1
    nombrePorCodigo[e.codigo] = e.nombre
  }
  for (const m of (maletas.data ?? []) as { id: string; codigo: string; nombre: string }[]) {
    nombrePorCodigo[`MALETA:${m.id}`] = `${m.codigo} · ${m.nombre}`
  }

  const itemsPorMaleta: Record<string, Componente[]> = {}
  for (const it of (items.data ?? []) as { maleta_id: string; equipo_id: string; cantidad: number | null }[]) {
    const codigo = idToCodigo[it.equipo_id]
    if (!codigo) continue
    ;(itemsPorMaleta[it.maleta_id] ??= []).push({ codigo, cantidad: it.cantidad ?? 1 })
  }

  const reservas = ((res.data ?? []) as { id: string; equipo_id: string | null; maleta_id: string | null; fecha_inicio: string; fecha_fin: string }[])
    .map((r) => ({
      id: r.id, fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin,
      codigos: codigosDeReserva(
        { equipoCodigo: r.equipo_id ? idToCodigo[r.equipo_id] : null, maletaId: r.maleta_id },
        itemsPorMaleta,
      ),
    }))

  return {
    idToCodigo, codigoToId, stockPorCodigo, nombrePorCodigo, itemsPorMaleta, reservas,
    reservados: reservas.flatMap((r) => r.codigos),
  }
}
