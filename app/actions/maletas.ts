'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function crearMaleta(formData: FormData) {
  const supabase = await createClient()

  const data = {
    codigo:       formData.get('codigo') as string,
    nombre:       formData.get('nombre') as string,
    descripcion:  formData.get('descripcion') as string || null,
    foto_empaque: formData.get('foto_empaque') as string || null,
  }

  const { data: maleta, error } = await supabase
    .from('maletas')
    .insert(data)
    .select()
    .single()

  if (error) return { error: error.message }

  // Insertar ítems
  const itemsRaw = formData.get('items') as string
  if (itemsRaw) {
    const items = JSON.parse(itemsRaw)
    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from('maleta_items')
        .insert(items.map((item: { equipo_id: string; cantidad: number; notas: string }) => ({
          maleta_id: maleta.id,
          equipo_id: item.equipo_id,
          cantidad:  item.cantidad,
          notas:     item.notas || null,
        })))
      if (itemsError) return { error: itemsError.message }
    }
  }

  revalidatePath('/equipos/maletas')
  return { success: true, id: maleta.id }
}

export async function actualizarMaleta(id: string, formData: FormData) {
  const supabase = await createClient()

  const data = {
    nombre:       formData.get('nombre') as string,
    descripcion:  formData.get('descripcion') as string || null,
    foto_empaque: formData.get('foto_empaque') as string || null,
  }

  const { error } = await supabase.from('maletas').update(data).eq('id', id)
  if (error) return { error: error.message }

  // Reemplazar ítems
  await supabase.from('maleta_items').delete().eq('maleta_id', id)
  const itemsRaw = formData.get('items') as string
  if (itemsRaw) {
    const items = JSON.parse(itemsRaw)
    if (items.length > 0) {
      await supabase.from('maleta_items').insert(
        items.map((item: { equipo_id: string; cantidad: number; notas: string }) => ({
          maleta_id: id,
          equipo_id: item.equipo_id,
          cantidad:  item.cantidad,
          notas:     item.notas || null,
        }))
      )
    }
  }

  revalidatePath('/equipos/maletas')
  return { success: true }
}

export async function agregarNota(maletaId: string, contenido: string, autorNombre: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('maleta_notas').insert({
    maleta_id:    maletaId,
    autor_id:     user?.id || null,
    autor_nombre: autorNombre,
    contenido,
  })

  if (error) return { error: error.message }
  revalidatePath(`/m/${maletaId}`)
  return { success: true }
}

export async function getMaletas() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('maletas')
    .select('*, items:maleta_items(*, equipo:equipos(*))')
    .order('codigo')
  return data || []
}

export async function getMaleta(codigo: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('maletas')
    .select('*, items:maleta_items(*, equipo:equipos(*)), notas:maleta_notas(*)')
    .eq('codigo', codigo)
    .single()
  return data
}
