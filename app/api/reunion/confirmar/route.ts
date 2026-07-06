import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/reunion/confirmar?token=xxx  (público, sin login)
// Desde el botón del correo interno: marca la reunión como ATENDIDA en Hilván.
// Idempotente. Devuelve una página HTML simple (marca Casa Hiedra).
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')?.trim() || ''
  const page = (msg: string, ok = true) =>
    new NextResponse(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Casa Hiedra</title></head>` +
        `<body style="margin:0;background:#fff"><div style="font-family:-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:440px;margin:96px auto;padding:0 24px;color:#0A0A0A;text-align:center">` +
        `<p style="font-size:19px;line-height:1.4;margin:0 0 10px">${msg}</p>` +
        `<p style="font-size:12px;letter-spacing:.06em;color:#9a9a92;margin:24px 0 0">Casa Hiedra · Hilván</p></div></body></html>`,
      { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )

  if (!token) return page('Link inválido.', false)
  const admin = createAdminClient()
  const { data: r, error } = await admin
    .from('reuniones_web')
    .select('id, nombre, confirmada')
    .eq('token', token)
    .maybeSingle()
  if (error || !r) return page('No encontramos esa reunión.', false)
  if (!r.confirmada) {
    await admin.from('reuniones_web').update({ confirmada: true, confirmada_at: new Date().toISOString() }).eq('id', r.id)
  }
  return page(`Reunión de <strong>${r.nombre}</strong> marcada como atendida ✓`)
}
