'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface Reconocimiento {
  id: string
  persona_id: string
  persona: string
  otorgado_por_nombre: string
  titulo: string
  texto: string
  created_at: string
  visto_en?: string | null
}

/**
 * Los reconocimientos del equipo, para todos.
 *
 * **Es lo único que ve todo el mundo.** Las medallas y las misiones diarias de
 * cada uno siguen siendo de cada uno: lo especial se ve, lo diario no. Sin ese
 * umbral el muro se llena de logros menores ajenos y se vuelve una tabla de
 * comparación, que es justo lo que este sistema evita.
 */
export async function getReconocimientos(limite = 12): Promise<Reconocimiento[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('reconocimientos')
    .select('*, persona:profiles!reconocimientos_persona_id_fkey(nombre, email), autor:profiles!reconocimientos_otorgado_por_fkey(nombre, email)')
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error || !data) return []

  return (data as any[]).map(r => ({
    id: r.id,
    persona_id: r.persona_id,
    persona: r.persona?.nombre ?? r.persona?.email ?? '—',
    otorgado_por_nombre: r.autor?.nombre ?? r.autor?.email ?? '—',
    titulo: r.titulo,
    texto: r.texto,
    created_at: r.created_at,
    visto_en: r.visto_en,
  }))
}

/** Los que le llegaron a quien está en sesión y todavía no ha visto. */
export async function getReconocimientosSinVer(): Promise<Reconocimiento[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('reconocimientos')
    .select('*, autor:profiles!reconocimientos_otorgado_por_fkey(nombre, email)')
    .eq('persona_id', user.id)
    .is('visto_en', null)
    .order('created_at')

  if (error || !data) return []

  return (data as any[]).map(r => ({
    id: r.id,
    persona_id: r.persona_id,
    persona: '',
    otorgado_por_nombre: r.autor?.nombre ?? r.autor?.email ?? '—',
    titulo: r.titulo,
    texto: r.texto,
    created_at: r.created_at,
    visto_en: null,
  }))
}

/** Marca como visto. Solo el destinatario — nadie ve por otro. */
export async function marcarVisto(ids: string[]) {
  if (ids.length === 0) return { ok: true }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sin sesión' }

  const { error } = await supabase
    .from('reconocimientos')
    .update({ visto_en: new Date().toISOString() })
    .in('id', ids)
    .eq('persona_id', user.id)

  return error ? { error: 'No se pudo guardar' } : { ok: true }
}

/** Las personas a las que se le puede escribir un reconocimiento. */
export async function getDestinatarios(): Promise<{ id: string; nombre: string }[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: perfil } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return []

  const { data } = await supabase
    .from('profiles').select('id, nombre, email').order('nombre')

  return (data ?? [])
    .filter(p => p.id !== user.id)
    .map(p => ({ id: p.id, nombre: p.nombre || p.email }))
}

/**
 * Escribir un reconocimiento.
 *
 * Solo admin, y con motivo obligatorio: un reconocimiento sin texto es una
 * palmada en la espalda —se agradece y se olvida—. Lo que lo hace valer es que
 * alguien se sentó a escribir por qué.
 */
export async function crearReconocimiento(persona_id: string, titulo: string, texto: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sin sesión' }

  const { data: perfil } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return { error: 'No autorizado' }

  const t = titulo.trim()
  const x = texto.trim()
  if (!persona_id) return { error: 'Falta a quién' }
  if (!t) return { error: 'Falta el título' }
  if (x.length < 15) return { error: 'Escribe el motivo — es lo que lo hace valer' }

  const { error } = await supabase
    .from('reconocimientos')
    .insert({ persona_id, otorgado_por: user.id, titulo: t, texto: x })

  if (error) return { error: 'No se pudo guardar' }

  revalidatePath('/dashboard')
  revalidatePath('/perfil')
  return { ok: true }
}
