'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type MaletaItemInput = { equipo_id: string; cantidad: number; notas: string }

/** Parsea el JSON de ítems del FormData. Devuelve [] si está vacío; lanza si el JSON es inválido. */
function parsearItemsMaleta(itemsRaw: string | null): MaletaItemInput[] {
  if (!itemsRaw) return []
  const parsed = JSON.parse(itemsRaw)
  if (!Array.isArray(parsed)) throw new Error('items no es un arreglo')
  return parsed as MaletaItemInput[]
}

export async function crearMaleta(formData: FormData) {
  const supabase = await createClient()

  const data = {
    codigo:       formData.get('codigo') as string,
    nombre:       formData.get('nombre') as string,
    descripcion:  formData.get('descripcion') as string || null,
    foto_empaque: formData.get('foto_empaque') as string || null,
  }

  // Parsear ítems ANTES de cualquier escritura: si el JSON viene corrupto
  // abortamos sin haber creado una maleta sin ítems.
  let items: MaletaItemInput[]
  try {
    items = parsearItemsMaleta(formData.get('items') as string | null)
  } catch {
    return { error: 'Datos de ítems inválidos' }
  }

  const { data: maleta, error } = await supabase
    .from('maletas')
    .insert(data)
    .select()
    .single()

  if (error) return { error: error.message }

  // Insertar ítems
  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from('maleta_items')
      .insert(items.map((item) => ({
        maleta_id: maleta.id,
        equipo_id: item.equipo_id,
        cantidad:  item.cantidad,
        notas:     item.notas || null,
      })))
    if (itemsError) return { error: itemsError.message }
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

  // Parsear ítems ANTES de borrar nada: un JSON corrupto no debe dejar la maleta vacía.
  let items: MaletaItemInput[]
  try {
    items = parsearItemsMaleta(formData.get('items') as string | null)
  } catch {
    return { error: 'Datos de ítems inválidos' }
  }

  const { error } = await supabase.from('maletas').update(data).eq('id', id)
  if (error) return { error: error.message }

  const itemsPayload = items.map((item) => ({
    equipo_id: item.equipo_id,
    cantidad:  item.cantidad,
    notas:     item.notas || null,
  }))

  // Reemplazar ítems atómicamente vía RPC (delete + insert en una transacción).
  // Si el insert falla, el delete se revierte y los ítems originales sobreviven.
  const { error: rpcError } = await supabase.rpc('reemplazar_maleta_items', {
    p_maleta_id: id,
    p_items: itemsPayload,
  })

  if (rpcError) {
    // Si la función RPC aún no está aplicada en la BD (42883 / PGRST202),
    // caer al camino secuencial seguro: el JSON ya se validó arriba, así que
    // solo borramos+insertamos verificando cada paso. (No es atómico, pero el
    // único modo de quedar vacía sería un fallo del insert, que reportamos.)
    const rpcFaltante = rpcError.code === '42883' || rpcError.code === 'PGRST202'
    if (!rpcFaltante) return { error: rpcError.message }

    const { error: eDel } = await supabase.from('maleta_items').delete().eq('maleta_id', id)
    if (eDel) return { error: eDel.message }
    if (itemsPayload.length > 0) {
      const { error: eIns } = await supabase
        .from('maleta_items')
        .insert(itemsPayload.map((it) => ({ ...it, maleta_id: id })))
      if (eIns) return { error: eIns.message }
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
  const { error: eItems } = await supabase.from('maleta_items').delete().eq('maleta_id', id)
  if (eItems) return { error: eItems.message }
  const { error: eNotas } = await supabase.from('maleta_notas').delete().eq('maleta_id', id)
  if (eNotas) return { error: eNotas.message }
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
    const { error: eItems } = await supabase.from('bundle_items').insert(
      maleta.items.map((item: { equipo_id: string; cantidad: number }) => ({
        bundle_id: bundle.id,
        equipo_id: item.equipo_id,
        bundle_hijo_id: null,
        cantidad: item.cantidad,
      }))
    )
    if (eItems) return { error: eItems.message }
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
