'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RodajeSticker, BloqueEstilo } from '@/types'

// Verifica sesión (el editor de rodaje es para usuarios autenticados).
async function requireSesion() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  return supabase
}

export async function getStickers(rodajeId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rodaje_stickers')
    .select('*')
    .eq('rodaje_id', rodajeId)
    .order('z')
  if (error) throw new Error(error.message)
  return data as RodajeSticker[]
}

export async function crearSticker(
  rodajeId: string,
  payload: Partial<RodajeSticker> & { tipo: 'imagen' | 'texto' },
) {
  const supabase = await requireSesion()
  const { data, error } = await supabase
    .from('rodaje_stickers')
    .insert({
      rodaje_id: rodajeId,
      tipo: payload.tipo,
      imagen_url: payload.imagen_url ?? null,
      contenido: payload.contenido ?? null,
      estilo: payload.estilo ?? null,
      x: payload.x ?? 0.1,
      y: payload.y ?? 0.1,
      w: payload.w ?? 0.25,
      rot: payload.rot ?? 0,
      z: payload.z ?? 0,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as RodajeSticker
}

export async function actualizarSticker(
  id: string,
  rodajeId: string,
  campos: Partial<Pick<RodajeSticker, 'x' | 'y' | 'w' | 'rot' | 'z' | 'imagen_url' | 'contenido'>> & { estilo?: BloqueEstilo | null },
) {
  const supabase = await requireSesion()
  const { error } = await supabase.from('rodaje_stickers').update(campos).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function eliminarSticker(id: string, rodajeId: string) {
  const supabase = await requireSesion()
  const { error } = await supabase.from('rodaje_stickers').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Sube la imagen de un sticker al bucket rodaje-imagenes (ruta {rid}/stickers/{name}).
// Recibe los bytes ya procesados (PNG) desde el cliente.
export async function subirImagenSticker(rodajeId: string, nombre: string, dataUrl: string) {
  await requireSesion()
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl)
  if (!m) throw new Error('dataUrl inválida')
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > 10 * 1024 * 1024) throw new Error('Imagen muy grande (máx 10 MB)')
  const safe = nombre.replace(/[^a-z0-9_-]+/gi, '_')
  const path = `${rodajeId}/stickers/${safe}.png`
  // Con la clave de servicio: el bucket no tiene política de escritura para la sesión de la persona.
  const admin = createAdminClient()
  const { error } = await admin.storage.from('rodaje-imagenes').upload(path, buf, {
    upsert: true,
    contentType: 'image/png',
  })
  if (error) throw new Error(error.message)
  const { data } = admin.storage.from('rodaje-imagenes').getPublicUrl(path)
  return data.publicUrl
}
