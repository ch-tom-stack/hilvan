import { NextResponse } from 'next/server'
import { crearPropuestaLead } from '@/lib/lead-inbound'

export const runtime = 'nodejs'

// POST /api/lectura-lead
// Webhook del SITIO Casa Hiedra (La Lectura y landings /lookbook, /banco, /estudiantes).
// El sitio manda el lead (ya enriquecido si aplica) y acá queda como PROPUESTA
// (tipo prospecto_nuevo) en la Bandeja de Aprobación; al aprobarla se crea el prospecto.
//
// Auth por token DEDICADO y ACOTADO (LECTURA_WEBHOOK_TOKEN): sólo puede dejar
// propuestas. NO usa HILVAN_AGENT_TOKEN (que abre toda la API de agentes).
//
// El núcleo vive en lib/lead-inbound.ts y lo comparte con /api/arriendo/lead
// (el pop-up de Rental, público) → todos los canales caen en la MISMA Bandeja.
// Body: { email (req), nombre?, empresa?, producto?, origen?, nota?, lectura?, url?, angulo? }
export async function POST(req: Request) {
  const expected = process.env.LECTURA_WEBHOOK_TOKEN
  if (!expected) return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 })
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token || token !== expected) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const r = await crearPropuestaLead(
    body,
    'Lead entrante desde el sitio (webhook). Si trae lectura, el sitio corrió Brave + agente y derivó el producto.',
  )
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(r)
}
