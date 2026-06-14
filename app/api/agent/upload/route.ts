import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15 MB
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic']

// POST /api/agent/upload (multipart: file)
// Sube un archivo al bucket 'rendiciones' bajo la carpeta fija 'agente'.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `Extensión no permitida. Permitidas: ${ALLOWED_EXTENSIONS.join(', ')}` },
      { status: 400 }
    )
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `Archivo excede el límite de ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB` },
      { status: 413 }
    )
  }

  const nombre = `agente/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const admin = createAdminClient()
  const { error } = await admin.storage
    .from('rendiciones')
    .upload(nombre, buffer, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from('rendiciones').getPublicUrl(nombre)
  return NextResponse.json({ url: publicUrl })
}
