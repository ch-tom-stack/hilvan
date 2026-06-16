'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Parsea un precio en CLP del FormData.
 * - Vacío/ausente → { value: null } (campo opcional)
 * - Numérico válido (acepta decimales, por eso parseFloat) → { value }
 * - Inválido → { error } para abortar, en vez de convertirlo en null silencioso.
 */
function parsearPrecio(raw: FormDataEntryValue | null): { value: number | null } | { error: string } {
  const s = (raw as string | null)?.trim()
  if (!s) return { value: null }
  const n = parseFloat(s)
  if (!Number.isFinite(n) || n < 0) return { error: 'Precio por jornada inválido' }
  return { value: n }
}

/** Parsea fotos (JSON array) del FormData; [] si falta o es inválido. */
function parsearFotos(raw: FormDataEntryValue | null): string[] {
  try {
    const parsed = JSON.parse((raw as string) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function crearEquipo(formData: FormData) {
  const supabase = await createClient()

  const precio = parsearPrecio(formData.get('precio_jornada'))
  if ('error' in precio) return { error: precio.error }

  const data = {
    codigo:           formData.get('codigo') as string,
    nombre:           formData.get('nombre') as string,
    categoria_codigo: formData.get('categoria_codigo') as string,
    descripcion:      formData.get('descripcion') as string || null,
    notas:            formData.get('notas') as string || null,
    marca:            formData.get('marca') as string || null,
    modelo:           formData.get('modelo') as string || null,
    numero_serie:     formData.get('numero_serie') as string || null,
    cantidad:         parseInt(formData.get('cantidad') as string) || 1,
    rentable:         formData.get('rentable') === 'true',
    estado:           formData.get('estado') as string || 'disponible',
    precio_jornada:   precio.value,
    fotos:            parsearFotos(formData.get('fotos')),
  }

  const { error } = await supabase.from('equipos').insert(data)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/equipos')
  return { success: true }
}

export async function actualizarEquipo(id: string, formData: FormData) {
  const supabase = await createClient()

  const precio = parsearPrecio(formData.get('precio_jornada'))
  if ('error' in precio) return { error: precio.error }

  const data = {
    codigo:           formData.get('codigo') as string,
    nombre:           formData.get('nombre') as string,
    categoria_codigo: formData.get('categoria_codigo') as string,
    descripcion:      formData.get('descripcion') as string || null,
    notas:            formData.get('notas') as string || null,
    marca:            formData.get('marca') as string || null,
    modelo:           formData.get('modelo') as string || null,
    numero_serie:     formData.get('numero_serie') as string || null,
    cantidad:         parseInt(formData.get('cantidad') as string) || 1,
    rentable:         formData.get('rentable') === 'true',
    estado:           formData.get('estado') as string,
    precio_jornada:   precio.value,
    fotos:            parsearFotos(formData.get('fotos')),
  }

  const { error } = await supabase.from('equipos').update(data).eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/equipos')
  return { success: true }
}

export async function toggleRentable(id: string, rentable: boolean) {
  'use server'
  const supabase = await createClient()
  const { error } = await supabase
    .from('equipos')
    .update({ rentable })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/equipos')
  return { success: true }
}

export async function eliminarEquipo(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('equipos').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/equipos')
  return { success: true }
}

export async function getCategorias() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorias_equipo')
    .select('*')
    .eq('activa', true)
    .order('orden')
  if (error) return []
  return data
}

export async function getSiguienteCodigo(categoriaCodigo: string): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('equipos')
    .select('codigo')
    .like('codigo', `CH-${categoriaCodigo}-%`)
    .order('codigo', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) {
    return `CH-${categoriaCodigo}-001`
  }

  const ultimo = data[0].codigo
  const num = parseInt(ultimo.split('-').pop() || '0') + 1
  return `CH-${categoriaCodigo}-${String(num).padStart(3, '0')}`
}
