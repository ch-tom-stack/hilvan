// lib/sii-cola-io.ts
// Cola de importaciones del SII — la parte que toca la base (sql/sii_solicitudes.sql).
// Reglas puras en lib/sii-cola.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LadoSii } from '@/lib/sii-cli'
import { EN_CURSO_HUERFANO_MIN, solicitudTomable, type EstadoTrabajador, type Solicitud } from '@/lib/sii-cola'

const COLUMNAS = 'id, periodo, lados, estado, origen, solicitado_at, tomado_at, terminado_at, resultado, error'

type Res<T> = { ok: true; valor: T } | { ok: false; error: string }

/** Encola un período. Si ya hay un pedido abierto para ese período lo devuelve
 *  (pedir dos veces no duplica trabajo). */
export async function encolar(
  admin: SupabaseClient,
  periodo: string,
  lados: LadoSii[],
  origen: 'agente' | 'cron',
): Promise<Res<{ creada: boolean; solicitud: Solicitud }>> {
  const { data, error } = await admin
    .from('sii_solicitudes')
    .insert({ periodo, lados, origen })
    .select(COLUMNAS)
    .single()
  if (!error) return { ok: true, valor: { creada: true, solicitud: data as Solicitud } }
  if (error.code !== '23505') return { ok: false, error: error.message }

  // Ya había uno abierto (índice único parcial): devolver ese.
  const { data: abierta, error: e2 } = await admin
    .from('sii_solicitudes')
    .select(COLUMNAS)
    .eq('periodo', periodo)
    .in('estado', ['pendiente', 'en_curso'])
    .maybeSingle()
  if (e2 || !abierta) return { ok: false, error: e2?.message ?? 'No se pudo leer el pedido abierto' }
  return { ok: true, valor: { creada: false, solicitud: abierta as Solicitud } }
}

export async function leerTrabajador(admin: SupabaseClient): Promise<Res<EstadoTrabajador | null>> {
  const { data, error } = await admin
    .from('sii_trabajador')
    .select('ultimo_latido, version, bloqueado, motivo_bloqueo, bloqueado_at')
    .eq('id', 1)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, valor: (data as EstadoTrabajador | null) ?? null }
}

/** El Mac pregunta: deja el latido y, si no está bloqueado, toma los pedidos
 *  abiertos (pendientes o huérfanos) marcándolos en curso. */
export async function tomar(
  admin: SupabaseClient,
  version: string | null,
  ahora: Date,
): Promise<Res<{ bloqueado: boolean; motivo_bloqueo: string | null; solicitudes: Solicitud[] }>> {
  const latido = { id: 1, ultimo_latido: ahora.toISOString(), ...(version ? { version } : {}) }
  const { error: eLat } = await admin.from('sii_trabajador').upsert(latido, { onConflict: 'id' })
  if (eLat) return { ok: false, error: eLat.message }

  const trab = await leerTrabajador(admin)
  if (!trab.ok) return trab
  if (trab.valor?.bloqueado) {
    return { ok: true, valor: { bloqueado: true, motivo_bloqueo: trab.valor.motivo_bloqueo, solicitudes: [] } }
  }

  const { data, error } = await admin
    .from('sii_solicitudes')
    .select(COLUMNAS)
    .in('estado', ['pendiente', 'en_curso'])
    .order('solicitado_at', { ascending: true })
  if (error) return { ok: false, error: error.message }

  const corte = new Date(ahora.getTime() - EN_CURSO_HUERFANO_MIN * 60_000).toISOString()
  const tomadas: Solicitud[] = []
  for (const s of (data ?? []) as Solicitud[]) {
    if (!solicitudTomable(s, ahora)) continue
    // Condicionado al estado leído: si otro proceso la tomó entremedio, no vuelve nada.
    let q = admin
      .from('sii_solicitudes')
      .update({ estado: 'en_curso', tomado_at: ahora.toISOString() })
      .eq('id', s.id)
    q = s.estado === 'pendiente' ? q.eq('estado', 'pendiente') : q.eq('estado', 'en_curso').lt('tomado_at', corte)
    const { data: t, error: eT } = await q.select(COLUMNAS).maybeSingle()
    if (eT) return { ok: false, error: eT.message }
    if (t) tomadas.push(t as Solicitud)
  }
  return { ok: true, valor: { bloqueado: false, motivo_bloqueo: null, solicitudes: tomadas } }
}

export async function reportar(
  admin: SupabaseClient,
  id: string,
  estado: 'hecha' | 'fallida',
  resultado: unknown,
  error: string | null,
  ahora: Date,
): Promise<Res<Solicitud | null>> {
  const { data, error: e } = await admin
    .from('sii_solicitudes')
    .update({ estado, resultado: resultado ?? null, error, terminado_at: ahora.toISOString() })
    .eq('id', id)
    .eq('estado', 'en_curso')
    .select(COLUMNAS)
    .maybeSingle()
  if (e) return { ok: false, error: e.message }
  return { ok: true, valor: (data as Solicitud | null) ?? null }
}

export async function fijarBloqueo(
  admin: SupabaseClient,
  bloqueado: boolean,
  motivo: string | null,
  ahora: Date,
): Promise<Res<null>> {
  const { error } = await admin.from('sii_trabajador').upsert(
    {
      id: 1,
      bloqueado,
      motivo_bloqueo: bloqueado ? motivo : null,
      bloqueado_at: bloqueado ? ahora.toISOString() : null,
    },
    { onConflict: 'id' },
  )
  return error ? { ok: false, error: error.message } : { ok: true, valor: null }
}

/** Últimos pedidos (de un período, o de todos). */
export async function ultimasSolicitudes(
  admin: SupabaseClient,
  periodo: string | null,
  limite = 10,
): Promise<Res<Solicitud[]>> {
  let q = admin.from('sii_solicitudes').select(COLUMNAS).order('solicitado_at', { ascending: false }).limit(limite)
  if (periodo) q = q.eq('periodo', periodo)
  const { data, error } = await q
  if (error) return { ok: false, error: error.message }
  return { ok: true, valor: (data ?? []) as Solicitud[] }
}
