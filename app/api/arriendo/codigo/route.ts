import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validarCodigo } from '@/lib/descuento-codigos'

export const runtime = 'nodejs'

// GET /api/arriendo/codigo?codigo=CH10-K7M2P
// Público: el cotizador lo llama para mostrar el descuento en vivo.
// Devuelve SOLO {valido, pct, motivo} — nunca el correo del dueño del código
// (si no, cualquiera podría sondear a quién pertenece).
// El % que se cobra NO sale de acá: /api/arriendo/cotizar lo re-valida en el
// servidor al generar la cotización.
export async function GET(request: NextRequest) {
  const codigo = request.nextUrl.searchParams.get('codigo')
  if (!codigo) return NextResponse.json({ valido: false, pct: 0, motivo: 'Sin código' }, { status: 400 })

  const admin = createAdminClient()
  const r = await validarCodigo(admin, codigo)
  return NextResponse.json({ valido: r.valido, pct: r.pct, motivo: r.motivo })
}
