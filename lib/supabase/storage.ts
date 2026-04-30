import { createClient } from './client'

export async function subirFotoEquipo(
  file: File,
  equipoId: string
): Promise<string | null> {
  const supabase = createClient()
  const ext = file.name.split('.').pop()
  const path = `${equipoId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('equipos')
    .upload(path, file, { upsert: false })

  if (error) {
    console.error('Error subiendo foto:', error)
    return null
  }

  const { data } = supabase.storage.from('equipos').getPublicUrl(path)
  return data.publicUrl
}

export async function eliminarFotoEquipo(url: string): Promise<boolean> {
  const supabase = createClient()
  const path = url.split('/equipos/')[1]
  if (!path) return false

  const { error } = await supabase.storage.from('equipos').remove([path])
  return !error
}
