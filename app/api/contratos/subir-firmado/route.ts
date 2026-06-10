import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MIME_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png']
const EXT_PERMITIDAS = ['pdf', 'jpg', 'jpeg', 'png']
const TAMANO_MAX_BYTES = 15 * 1024 * 1024 // 15 MB

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  // 1. Verificar sesión
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const contratoId = formData.get('contrato_id') as string | null
  const colaboradorId = formData.get('colaborador_id') as string | null

  if (!file || !contratoId || !colaboradorId) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  // 2. Validar tipo de archivo
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (!EXT_PERMITIDAS.includes(ext) || !MIME_PERMITIDOS.includes(file.type)) {
    return NextResponse.json(
      { error: 'Tipo de archivo no permitido. Se aceptan: PDF, JPG, JPEG, PNG' },
      { status: 400 }
    )
  }

  // 3. Validar tamaño de archivo
  if (file.size > TAMANO_MAX_BYTES) {
    return NextResponse.json(
      { error: 'El archivo supera el tamaño máximo de 15 MB' },
      { status: 413 }
    )
  }

  // 4. Verificar que el contrato pertenece al colaborador indicado
  const { data: contrato, error: contratoError } = await supabase
    .from('contratos_generados')
    .select('id, colaborador_id')
    .eq('id', contratoId)
    .single()

  if (contratoError || !contrato) {
    return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
  }

  if (contrato.colaborador_id !== colaboradorId) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

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
