import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tipoImagenPdf } from '@/lib/pdf-imagenes'

// Imágenes del plan de rodaje (bloques, lienzo libre, pegado con Ctrl+V).
//
// Se suben acá y no desde el navegador: el bucket `rodaje-imagenes` no tiene
// política de escritura en `storage.objects`, así que la subida con la sesión
// de la persona fallaba en silencio y nunca quedó ninguna imagen. Acá se valida
// la sesión y se escribe con la clave de servicio.
//
// Solo PNG o JPEG (por firma de bytes, no por extensión): son los únicos
// formatos que lee el PDF. El cliente convierte el resto antes de enviar.

export const maxDuration = 30

const MAX_BYTES = 10 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUCKET = 'rodaje-imagenes'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }

  const file = form.get('file')
  const rodajeId = String(form.get('rodajeId') ?? '')
  const clave = String(form.get('clave') ?? 'bloque').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'bloque'
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 })
  if (!UUID.test(rodajeId)) return NextResponse.json({ error: 'Rodaje inválido' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'La imagen está vacía' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Imagen muy grande (máx 10 MB)' }, { status: 413 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const tipo = tipoImagenPdf(bytes)
  if (!tipo) return NextResponse.json({ error: 'Formato no soportado: usa PNG o JPG' }, { status: 415 })

  const ext = tipo === 'image/png' ? 'png' : 'jpg'
  // Nombre único: con upsert sobre la misma ruta el navegador seguía mostrando la imagen vieja.
  const path = `${rodajeId}/${clave}-${crypto.randomUUID().slice(0, 8)}.${ext}`

  const admin = createAdminClient()
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: tipo, upsert: false })
  if (error) {
    console.error('[rodaje/imagen] no se pudo subir:', error.message)
    return NextResponse.json({ error: 'No se pudo guardar la imagen' }, { status: 500 })
  }
  const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}

// Borra la imagen anterior cuando se reemplaza o se quita. Solo dentro del bucket del plan.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url).searchParams.get('url') ?? ''
  const path = url.split(`/${BUCKET}/`)[1]
  if (!path || path.includes('..') || !UUID.test(path.split('/')[0])) {
    return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 })
  }
  const { error } = await createAdminClient().storage.from(BUCKET).remove([decodeURIComponent(path)])
  if (error) {
    console.error('[rodaje/imagen] no se pudo borrar:', error.message)
    return NextResponse.json({ error: 'No se pudo borrar la imagen' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
