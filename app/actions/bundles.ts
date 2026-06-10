'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─────────────────────────────────────────────────────────────────────────────
// AUTH HELPER
// ─────────────────────────────────────────────────────────────────────────────

/** Verifica que hay una sesión activa. Lanza Error('Sin permisos') si no. */
async function requireSesion(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sin permisos')
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface BundleItem {
  id: string
  equipo_id: string | null
  bundle_hijo_id: string | null
  cantidad: number
  equipo: { codigo: string; nombre: string; precio_jornada: number | null } | null
  bundle_hijo: { codigo: string; nombre: string; precio_jornada: number | null } | null
}

export interface Bundle {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  fisico: boolean
  precio_jornada: number | null
  fotos: string[]
  items: BundleItem[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listarBundles(): Promise<Bundle[]> {
  const supabase = createAdminClient()

  // Query 1: bundles + items con equipo
  // Usamos !bundle_id para desambiguar: bundle_items tiene dos FK a bundles (bundle_id y bundle_hijo_id)
  const { data: bundlesRaw, error: eBundles } = await supabase
    .from('bundles')
    .select(`
      *,
      items:bundle_items!bundle_id(
        id, equipo_id, bundle_hijo_id, cantidad,
        equipo:equipos(codigo, nombre, precio_jornada)
      )
    `)
    .order('codigo')

  if (eBundles) {
    console.error('[bundles] error cargando bundles:', eBundles.message)
    return []
  }

  const bundles = bundlesRaw ?? []

  // Query 2: resolver bundle_hijo_id → nombre/código de bundles hijos
  const hijoIds = bundles
    .flatMap((b: any) => (b.items ?? []).map((i: any) => i.bundle_hijo_id))
    .filter(Boolean) as string[]

  let hijosMap: Record<string, { codigo: string; nombre: string; precio_jornada: number | null }> = {}

  if (hijoIds.length > 0) {
    const { data: hijos } = await supabase
      .from('bundles')
      .select('id, codigo, nombre, precio_jornada')
      .in('id', hijoIds)
    for (const h of hijos ?? []) {
      hijosMap[h.id] = { codigo: h.codigo, nombre: h.nombre, precio_jornada: h.precio_jornada }
    }
  }

  return bundles.map((b: any): Bundle => ({
    id: b.id,
    codigo: b.codigo,
    nombre: b.nombre,
    descripcion: b.descripcion,
    fisico: b.fisico,
    precio_jornada: b.precio_jornada,
    fotos: b.fotos ?? [],
    items: (b.items ?? []).map((i: any): BundleItem => ({
      id: i.id,
      equipo_id: i.equipo_id,
      bundle_hijo_id: i.bundle_hijo_id,
      cantidad: i.cantidad,
      equipo: i.equipo ?? null,
      bundle_hijo: i.bundle_hijo_id ? (hijosMap[i.bundle_hijo_id] ?? null) : null,
    })),
  }))
}

// ─── Mutaciones ───────────────────────────────────────────────────────────────

export async function crearBundle(data: {
  codigo: string
  nombre: string
  descripcion?: string
  fisico: boolean
  precio_jornada?: number
}): Promise<{ error?: string }> {
  await requireSesion()
  const supabase = createAdminClient()
  const { error } = await supabase.from('bundles').insert({
    codigo: data.codigo,
    nombre: data.nombre,
    descripcion: data.descripcion || null,
    fisico: data.fisico,
    precio_jornada: data.precio_jornada || null,
    fotos: [],
  })
  if (error) return { error: error.message }
  revalidatePath('/equipos/bundles')
  return {}
}

export async function actualizarBundle(
  id: string,
  data: Partial<{
    codigo: string
    nombre: string
    descripcion: string
    fisico: boolean
    precio_jornada: number
  }>
): Promise<{ error?: string }> {
  await requireSesion()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('bundles')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/equipos/bundles')
  return {}
}

export async function eliminarBundle(id: string): Promise<{ error?: string }> {
  await requireSesion()
  const supabase = createAdminClient()
  // Eliminar items primero (por si no hay CASCADE) — verificar error antes de seguir,
  // para no dejar items huérfanos si el delete del bundle falla después.
  const { error: eItems } = await supabase.from('bundle_items').delete().eq('bundle_id', id)
  if (eItems) return { error: eItems.message }
  const { error } = await supabase.from('bundles').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/equipos/bundles')
  return {}
}

export async function agregarEquipoABundle(
  bundle_id: string,
  equipo_id: string,
  cantidad: number
): Promise<{ error?: string }> {
  await requireSesion()
  const supabase = createAdminClient()
  const { error } = await supabase.from('bundle_items').insert({
    bundle_id,
    equipo_id,
    bundle_hijo_id: null,
    cantidad,
  })
  if (error) return { error: error.message }
  revalidatePath('/equipos/bundles')
  return {}
}

export async function agregarBundleABundle(
  bundle_id: string,
  bundle_hijo_id: string,
  cantidad: number
): Promise<{ error?: string }> {
  await requireSesion()
  const supabase = createAdminClient()
  const { error } = await supabase.from('bundle_items').insert({
    bundle_id,
    equipo_id: null,
    bundle_hijo_id,
    cantidad,
  })
  if (error) return { error: error.message }
  revalidatePath('/equipos/bundles')
  return {}
}

export async function eliminarItemBundle(item_id: string): Promise<{ error?: string }> {
  await requireSesion()
  const supabase = createAdminClient()
  const { error } = await supabase.from('bundle_items').delete().eq('id', item_id)
  if (error) return { error: error.message }
  revalidatePath('/equipos/bundles')
  return {}
}
