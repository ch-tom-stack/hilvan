import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { usarCodigo, anularCodigo, normalizarCodigo } from '@/lib/descuento-codigos'

export const runtime = 'nodejs'

// POST /api/agent/codigo-estado  { codigo, accion: "usar"|"anular", cotizacion_id? }
//   usar   → marca 'usado' (quemar el código al confirmar la reserva; ya no aplica).
//   anular → lo mata (deja de ser válido).
// Reversible con hilvan_deshacer (restaura el estado previo).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const codigo = normalizarCodigo(body?.codigo)
  if (!codigo) return NextResponse.json({ error: 'Falta "codigo"' }, { status: 400 })
  const accion = body?.accion
  if (accion !== 'usar' && accion !== 'anular') {
    return NextResponse.json({ error: 'accion debe ser "usar" o "anular"' }, { status: 400 })
  }

  const admin = createAdminClient()
  const r = accion === 'usar'
    ? await usarCodigo(admin, codigo, typeof body?.cotizacion_id === 'string' ? body.cotizacion_id : null)
    : await anularCodigo(admin, codigo)

  if (!r.ok) {
    await registrarAccion({ herramienta: 'codigo-estado', payload: { codigo, accion }, ok: false, error: r.error })
    return NextResponse.json({ error: r.error }, { status: 400 })
  }

  await registrarAccion({
    herramienta: 'codigo-estado',
    payload: { codigo, accion, previo: r.previo },
    resultado_tabla: 'descuento_codigos',
    ok: true,
  })
  return NextResponse.json({ ok: true, codigo, accion })
}
