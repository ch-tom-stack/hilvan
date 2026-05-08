'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ClasificacionEvento, EventoCalendario } from '@/types'

// ── Leer eventos del calendario ───────────────────────────────────────────────

export async function listarEventosCalendario(): Promise<EventoCalendario[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('eventos_calendario')
    .select('*')
    .neq('clasificacion', 'ignorar')
    .order('fecha_inicio', { ascending: true })

  if (error) return []
  return data as EventoCalendario[]
}

export async function listarEventosSinClasificar(): Promise<EventoCalendario[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('eventos_calendario')
    .select('*')
    .eq('clasificacion', 'sin_clasificar')
    .order('fecha_inicio', { ascending: true })

  if (error) return []
  return data as EventoCalendario[]
}

// ── Clasificar un evento ──────────────────────────────────────────────────────

export async function clasificarEvento(
  eventoId: string,
  clasificacion: ClasificacionEvento,
  rodajeId?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: self } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<{ rol: string }>()

  if (!self || !['admin', 'productor'].includes(self.rol)) {
    return { error: 'Sin permisos' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('eventos_calendario')
    .update({
      clasificacion,
      rodaje_id:       clasificacion === 'rodaje' ? (rodajeId ?? null) : null,
      clasificado_por: user.id,
    })
    .eq('id', eventoId)

  if (error) return { error: error.message }

  revalidatePath('/calendario')
  return { ok: true }
}

// ── Trigger manual de sync (para testing desde la UI) ────────────────────────

export async function triggerSyncGCal(): Promise<{ ok?: boolean; error?: string; data?: unknown }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: self } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<{ rol: string }>()

  if (self?.rol !== 'admin') return { error: 'Solo admins pueden sincronizar manualmente' }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/cron/sync-gcal`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })

  const json = await res.json()
  if (!res.ok) return { error: JSON.stringify(json) }

  revalidatePath('/calendario')
  return { ok: true, data: json }
}
