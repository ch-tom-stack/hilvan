import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const carpeta = (formData.get('carpeta') as string | null) ?? 'uploads'

  if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 })

  const ext = file.name.split('.').pop() ?? 'bin'
  const nombre = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage
    .from('rendiciones')
    .upload(nombre, buffer, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('rendiciones').getPublicUrl(nombre)

  return NextResponse.json({ ok: true, url: publicUrl })
}
