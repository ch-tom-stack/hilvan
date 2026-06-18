import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { quitarFondo, agregarBorde, recortarMargenes } from '@/lib/sticker-image'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

function parseColor(v: FormDataEntryValue | null): [number, number, number] {
  const s = typeof v === 'string' ? v.trim() : ''
  const m = /^#?([0-9a-fA-F]{6})$/.exec(s)
  if (!m) return [255, 255, 255]
  const h = m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const pngResponse = (png: Buffer, extra?: Record<string, string>) =>
  new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', ...(extra ?? {}) },
  })

// POST /api/sticker-procesar (multipart): { file, op, ...params }
// op: 'quitar-fondo' (tol?), 'borde' (color #rrggbb, grosor px), 'trim'.
// Procesa la imagen de un sticker y devuelve el PNG resultante. Solo sesión válida.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'form-data inválido' }, { status: 400 })
  }

  const file = form.get('file')
  const op = String(form.get('op') || '')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Imagen muy grande (máx 10 MB)' }, { status: 400 })
  if (!/^image\/(png|jpe?g|webp|gif|avif)$/.test(file.type)) {
    return NextResponse.json({ error: 'Tipo de imagen no permitido' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())

  try {
    if (op === 'quitar-fondo') {
      const t = Number(form.get('tol'))
      const r = await quitarFondo(buf, Number.isFinite(t) && t > 0 ? t : undefined)
      return pngResponse(r.png, {
        'X-Aplicado': String(r.aplicado),
        'X-Motivo': encodeURIComponent(r.motivo ?? ''),
      })
    }
    if (op === 'borde') {
      const grosor = Number(form.get('grosor'))
      return pngResponse(await agregarBorde(buf, parseColor(form.get('color')), Number.isFinite(grosor) ? grosor : 12))
    }
    if (op === 'trim') {
      return pngResponse(await recortarMargenes(buf))
    }
    return NextResponse.json({ error: "op inválida (quitar-fondo | borde | trim)" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error procesando la imagen' }, { status: 500 })
  }
}
