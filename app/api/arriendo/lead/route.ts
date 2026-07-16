import { NextRequest, NextResponse } from 'next/server'
import { crearPropuestaLead } from '@/lib/lead-inbound'

export const runtime = 'nodejs'

// POST /api/arriendo/lead  { email, nombre?, empresa?, descuento?, empresa_hp? }
//
// PÚBLICO (lo llama el pop-up de captura de rental.casahiedra.com desde el
// navegador) → por eso NO lleva token: exponerlo en el cliente lo filtraría.
// Cae en la MISMA Bandeja de Aprobación que los leads de La Lectura y las
// landings, vía el núcleo compartido lib/lead-inbound.ts (origen 'rental').
//
// Anti-abuso al ser público: honeypot (`empresa_hp`, invisible en el form) +
// rate-limit por IP en memoria. El dedup por email vive en el núcleo.
const VISTOS = new Map<string, number[]>()
const VENTANA_MS = 60 * 60 * 1000 // 1 h
const MAX_POR_IP = 5

function limitado(ip: string): boolean {
  const ahora = Date.now()
  const previos = (VISTOS.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS)
  if (previos.length >= MAX_POR_IP) { VISTOS.set(ip, previos); return true }
  previos.push(ahora)
  VISTOS.set(ip, previos)
  return false
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  // Honeypot: un bot rellena todo; una persona no ve este campo.
  if (typeof body?.empresa_hp === 'string' && body.empresa_hp.trim() !== '') {
    return NextResponse.json({ ok: true }) // responde OK para no darle señal al bot
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconocida'
  if (limitado(ip)) {
    return NextResponse.json({ error: 'Demasiados intentos. Escríbenos a rental@casahiedra.com' }, { status: 429 })
  }

  const descuento = Number(body?.descuento)
  const pct = Number.isFinite(descuento) && descuento > 0 && descuento <= 50 ? Math.round(descuento) : 10

  const r = await crearPropuestaLead(
    {
      email: body?.email,
      nombre: body?.nombre,
      empresa: body?.empresa,
      origen: 'rental',
      nota: `Pop-up Rental — se le ofreció ${pct}% de descuento en su primera producción. Entró por la campaña de rental.casahiedra.com.`,
      url: 'https://rental.casahiedra.com',
    },
    `Lead capturado en el pop-up de Rental (${pct}% dcto. primera producción). Tráfico de campaña Meta.`,
  )
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(r)
}
