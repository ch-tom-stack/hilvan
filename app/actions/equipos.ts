'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function crearEquipo(formData: FormData) {
  const supabase = await createClient()

  const data = {
    codigo:          formData.get('codigo') as string,
    nombre:          formData.get('nombre') as string,
    categoria_codigo: formData.get('categoria_codigo') as string,
    descripcion:     formData.get('descripcion') as string || null,
    notas:           formData.get('notas') as string || null,
    cantidad:        parseInt(formData.get('cantidad') as string) || 1,
    rentable:        formData.get('rentable') === 'true',
    estado:          formData.get('estado') as string || 'disponible',
    precio_jornada:  formData.get('precio_jornada')
                       ? parseInt(formData.get('precio_jornada') as string)
                       : null,
    fotos:           JSON.parse(formData.get('fotos') as string || '[]'),
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

  const data = {
    nombre:          formData.get('nombre') as string,
    categoria_codigo: formData.get('categoria_codigo') as string,
    descripcion:     formData.get('descripcion') as string || null,
    notas:           formData.get('notas') as string || null,
    cantidad:        parseInt(formData.get('cantidad') as string) || 1,
    rentable:        formData.get('rentable') === 'true',
    estado:          formData.get('estado') as string,
    precio_jornada:  formData.get('precio_jornada')
                       ? parseInt(formData.get('precio_jornada') as string)
                       : null,
    fotos:           JSON.parse(formData.get('fotos') as string || '[]'),
  }

  const { error } = await supabase.from('equipos').update(data).eq('id', id)

  if (error) {
    return { error: error.message }
  }

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
