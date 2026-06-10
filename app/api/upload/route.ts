import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── Límites y configuración ────────────────────────────────────────────────
const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15 MB
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic']

/**
 * Sanitiza el nombre de carpeta: solo permite [a-z0-9_-]
 * Si no cumple, retorna 'uploads'
 */
function sanitizarCarpeta(carpeta: string): string {
  if (!carpeta || !/^[a-z0-9_-]+$/.test(carpeta)) {
    return 'uploads'
  }
  return carpeta
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const carpeta = (formData.get('carpeta') as string | null) ?? 'uploads'

  if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 })

  // ── Validar extensión ─────────────────────────────────────────────────────
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `Extensión no permitida. Permitidas: ${ALLOWED_EXTENSIONS.join(', ')}` },
      { status: 400 }
    )
  }

  // ── Validar tamaño ───────────────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `Archivo excede el límite de ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB` },
      { status: 413 }
    )
  }

  // ── Sanitizar carpeta ────────────────────────────────────────────────────
  const carpetaSanitizada = sanitizarCarpeta(carpeta)
  const nombre = `${carpetaSanitizada}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage
    .from('rendiciones')
    .upload(nombre, buffer, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('rendiciones').getPublicUrl(nombre)

  return NextResponse.json({ ok: true, url: publicUrl })
}
