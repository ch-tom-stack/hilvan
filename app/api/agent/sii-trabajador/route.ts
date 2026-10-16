import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fijarBloqueo, reportar, tomar } from '@/lib/sii-cola-io'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/agent/sii-trabajador (JSON) — lo usa SOLO el trabajador del Mac
// (scripts/sii/trabajador.mjs); no hay herramienta MCP para esto.
//   { accion: "tomar", version? }                          → latido + pedidos a procesar
//   { accion: "reportar", id, estado: "hecha"|"fallida", resultado?, error? }
//   { accion: "bloquear", motivo }  → el SII rechazó el login: no se reintenta
//   { accion: "liberar" }           → Tomás corrigió la clave del Llavero
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const ahora = new Date()
  const texto = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

  switch (body?.accion) {
    case 'tomar': {
      const r = await tomar(admin, texto(body.version, 60), ahora)
      return r.ok ? NextResponse.json(r.valor) : NextResponse.json({ error: r.error }, { status: 500 })
    }
    case 'reportar': {
      if (!UUID.test(String(body.id ?? ''))) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
      if (body.estado !== 'hecha' && body.estado !== 'fallida') {
        return NextResponse.json({ error: 'estado debe ser hecha o fallida' }, { status: 400 })
      }
      const r = await reportar(admin, body.id, body.estado, body.resultado, texto(body.error, 2000), ahora)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
      if (!r.valor) return NextResponse.json({ error: 'El pedido no existe o no estaba en curso' }, { status: 409 })
      return NextResponse.json({ solicitud: r.valor })
    }
    case 'bloquear': {
      const r = await fijarBloqueo(admin, true, texto(body.motivo, 500) ?? 'sin detalle', ahora)
      return r.ok ? NextResponse.json({ bloqueado: true }) : NextResponse.json({ error: r.error }, { status: 500 })
    }
    case 'liberar': {
      const r = await fijarBloqueo(admin, false, null, ahora)
      return r.ok ? NextResponse.json({ bloqueado: false }) : NextResponse.json({ error: r.error }, { status: 500 })
    }
    default:
      return NextResponse.json({ error: 'accion debe ser tomar, reportar, bloquear o liberar' }, { status: 400 })
  }
}
