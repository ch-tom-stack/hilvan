import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const contratoId = formData.get('contrato_id') as string | null
  const colaboradorId = formData.get('colaborador_id') as string | null

  if (!file || !contratoId || !colaboradorId) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'pdf'
  const path = `firmados/${colaboradorId}/${contratoId}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('contratos')
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('contratos').getPublicUrl(path)

  const { error: dbError } = await supabase
    .from('contratos_generados')
    .update({ firmado: true, archivo_url: publicUrl })
    .eq('id', contratoId)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ ok: true, url: publicUrl })
}
