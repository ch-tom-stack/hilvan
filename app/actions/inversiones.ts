'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Inversion, CategoriaInversion } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

export async function getInversiones(filtros?: {
  categoria?: CategoriaInversion
  año?: number
}): Promise<Inversion[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('inversiones')
    .select('*')
    .order('fecha_compra', { ascending: false })

  if (filtros?.categoria) {
    query = query.eq('categoria', filtros.categoria)
  }

  if (filtros?.año) {
    query = query
      .gte('fecha_compra', `${filtros.año}-01-01`)
      .lte('fecha_compra', `${filtros.año}-12-31`)
  }

  const { data, error } = await query

  if (error) {
    console.error('getInversiones error:', error)
    return []
  }

  return (data ?? []) as Inversion[]
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export async function crearInversion(
  data: Omit<Inversion, 'id' | 'created_at' | 'created_by'>
): Promise<{ error?: string; data?: Inversion }> {
  const supabase = createAdminClient()

  const { data: created, error } = await supabase
    .from('inversiones')
    .insert([data])
    .select()
    .single()

  if (error) {
    console.error('crearInversion error:', error)
    return { error: error.message }
  }

  return { data: created as Inversion }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export async function editarInversion(
  id: string,
  data: Partial<Omit<Inversion, 'id' | 'created_at' | 'created_by'>>
): Promise<{ error?: string }> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('inversiones')
    .update(data)
    .eq('id', id)

  if (error) {
    console.error('editarInversion error:', error)
    return { error: error.message }
  }

  return {}
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export async function eliminarInversion(
  id: string
): Promise<{ error?: string }> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('inversiones')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('eliminarInversion error:', error)
    return { error: error.message }
  }

  return {}
}
