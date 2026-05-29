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

export async function eliminarMaleta(id: string) {
  const supabase = await createClient()
  await supabase.from('maleta_items').delete().eq('maleta_id', id)
  await supabase.from('maleta_notas').delete().eq('maleta_id', id)
  const { error } = await supabase.from('maletas').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/equipos/maletas')
  return { success: true }
}

export async function convertirMaletaABundle(id: string) {
  const supabase = await createClient()

  // Cargar maleta con sus ítems
  const { data: maleta, error: eMaleta } = await supabase
    .from('maletas')
    .select('*, items:maleta_items(equipo_id, cantidad)')
    .eq('id', id)
    .single()

  if (eMaleta || !maleta) return { error: 'Maleta no encontrada' }

  // Crear el bundle con los datos de la maleta
  const { data: bundle, error: eBundle } = await supabase
    .from('bundles')
    .insert({
      codigo: maleta.codigo,
      nombre: maleta.nombre,
      descripcion: maleta.descripcion || null,
      fisico: true,
      precio_jornada: null,
      fotos: maleta.foto_empaque ? [maleta.foto_empaque] : [],
    })
    .select()
    .single()

  if (eBundle) return { error: eBundle.code === '23505' ? 'Ya existe un bundle con ese código' : eBundle.message }

  // Migrar ítems
  if (maleta.items?.length > 0) {
    await supabase.from('bundle_items').insert(
      maleta.items.map((item: { equipo_id: string; cantidad: number }) => ({
        bundle_id: bundle.id,
        equipo_id: item.equipo_id,
        bundle_hijo_id: null,
        cantidad: item.cantidad,
      }))
    )
  }

  revalidatePath('/equipos/maletas')
  revalidatePath('/equipos/bundles')
  return { success: true, bundleId: bundle.id, bundleCodigo: bundle.codigo }
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
