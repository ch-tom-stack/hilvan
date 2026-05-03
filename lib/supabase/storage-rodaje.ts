import { createClient } from './client'

export async function subirImagenBloque(
  file: File,
  rodajeId: string,
  bloqueId: string,
): Promise<string | null> {
  const supabase = createClient()
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${rodajeId}/${bloqueId}.${ext}`

  const { error } = await supabase.storage
    .from('rodaje-imagenes')
    .upload(path, file, { upsert: true })

  if (error) {
    console.error('Error subiendo imagen:', error)
    return null
  }

  const { data } = supabase.storage.from('rodaje-imagenes').getPublicUrl(path)
  return data.publicUrl
}

export async function eliminarImagenBloque(url: string): Promise<boolean> {
  const supabase = createClient()
  const path = url.split('/rodaje-imagenes/')[1]
  if (!path) return false
  const { error } = await supabase.storage.from('rodaje-imagenes').remove([path])
  return !error
}
