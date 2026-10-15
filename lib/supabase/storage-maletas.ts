import { createClient } from './client'
import { extensionSegura } from '@/lib/archivos'

export async function subirFotoMaleta(file: File, maletaId: string): Promise<string | null> {
  const supabase = createClient()
  const ext = extensionSegura(file.name, 'jpg')
  const path = `${maletaId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('maletas')
    .upload(path, file, { upsert: false })

  if (error) return null

  const { data } = supabase.storage.from('maletas').getPublicUrl(path)
  return data.publicUrl
}
