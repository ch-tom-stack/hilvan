import { createClient } from './client'

export async function subirFotoMaleta(file: File, maletaId: string): Promise<string | null> {
  const supabase = createClient()
  const ext = file.name.split('.').pop()
  const path = `${maletaId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('maletas')
    .upload(path, file, { upsert: false })

  if (error) return null

  const { data } = supabase.storage.from('maletas').getPublicUrl(path)
  return data.publicUrl
}
