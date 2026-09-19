import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { firmaValida, leerWebhook } from '@/lib/whatsapp'
import { ingerir } from '@/lib/whatsapp-io'

export const runtime = 'nodejs'
// El historial de 180 días llega en trozos grandes.
export const maxDuration = 60

// Webhook de WhatsApp (Cloud API de Meta, número en coexistencia).
//
// Hilván solo ESCUCHA: nunca envía mensajes por la API. Lo que llega acá se
// guarda crudo en whatsapp_mensajes y es el operador del CRM, en su rutina, el
// que lo resume y lo registra como interacción (hilvan_whatsapp_*).
//
// Dos formas de autenticarse, porque depende de cómo se haga el alta:
//   · directo con Meta     → firma X-Hub-Signature-256 (WHATSAPP_APP_SECRET)
//   · vía un intermediario → llave propia en el header `x-webhook-key` o en
//                            `?key=` (WHATSAPP_WEBHOOK_KEY); los intermediarios
//                            reenvían el payload de Meta pero no su firma.

function igual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// GET — el saludo de verificación de Meta al registrar el webhook.
export async function GET(req: Request) {
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN
  if (!esperado) return NextResponse.json({ error: 'WhatsApp no configurado' }, { status: 503 })

  const q = new URL(req.url).searchParams
  if (q.get('hub.mode') === 'subscribe' && igual(q.get('hub.verify_token') ?? '', esperado)) {
    return new Response(q.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
}

export async function POST(req: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  const llave = process.env.WHATSAPP_WEBHOOK_KEY
  if (!appSecret && !llave) return NextResponse.json({ error: 'WhatsApp no configurado' }, { status: 503 })

  // La firma se calcula sobre el cuerpo CRUDO: hay que leerlo como texto antes
  // de parsear, o cualquier diferencia de serialización la invalida.
  const raw = await req.text()

  const llaveRecibida = req.headers.get('x-webhook-key') ?? new URL(req.url).searchParams.get('key') ?? ''
  const autorizado =
    (!!appSecret && firmaValida(raw, req.headers.get('x-hub-signature-256'), appSecret)) ||
    (!!llave && !!llaveRecibida && igual(llaveRecibida, llave))
  if (!autorizado) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let payload: unknown
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const resultado = await ingerir(createAdminClient(), leerWebhook(payload))
  if (resultado.errores.length > 0) console.error('[whatsapp-webhook]', resultado.errores.join(' · '))

  // Un fallo al GUARDAR responde 500 para que Meta reintente (el wa_id único
  // hace seguro el reintento). Un error que viene DENTRO del payload —p. ej. el
  // negocio no compartió el historial— no se arregla reintentando: 200.
  const falloPropio = resultado.errores.some(e => !e.startsWith('history '))
  return NextResponse.json(resultado, { status: falloPropio ? 500 : 200 })
}
