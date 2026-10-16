import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { describirTrabajador, ladosPedidos, periodoPedible } from '@/lib/sii-cola'
import { encolar, leerTrabajador } from '@/lib/sii-cola-io'

export const runtime = 'nodejs'

// POST /api/agent/sii-solicitar (JSON)  { periodo: "202609", lados?: ["compras","ventas","bhe"] }
//
// Pide al Mac de Tomás que importe un período del SII. Hilván no lee el SII: la
// sesión y la clave viven solo en el Mac, que pregunta cada 5 min si hay pedidos
// (scripts/sii/trabajador.mjs). Devuelve el pedido y cómo está el Mac, para que
// el agente sepa si esperar minutos o avisar a Tomás. Pedir dos veces el mismo
// período no duplica trabajo.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const ahora = new Date()
  const p = periodoPedible(body?.periodo, ahora)
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 })
  const lados = ladosPedidos(body?.lados)
  if (!lados) return NextResponse.json({ error: 'lados inválidos (compras, ventas y/o bhe)' }, { status: 400 })

  const admin = createAdminClient()
  const trab = await leerTrabajador(admin)
  if (!trab.ok) return NextResponse.json({ error: `No se pudo leer el estado del Mac: ${trab.error}` }, { status: 500 })
  const mac = describirTrabajador(trab.valor, ahora)
  if (mac.estado === 'bloqueado') return NextResponse.json({ error: mac.mensaje, mac }, { status: 409 })

  const r = await encolar(admin, p.periodo, lados, 'agente')
  if (!r.ok) return NextResponse.json({ error: `No se pudo encolar el pedido: ${r.error}` }, { status: 500 })

  return NextResponse.json({
    solicitud: r.valor.solicitud,
    creada: r.valor.creada,
    mac,
    nota: r.valor.creada
      ? 'Pedido en cola. Revisa con hilvan_sii_estado_importacion; cuando esté "hecha", llama hilvan_sii_sync / hilvan_sii_sync_ventas. Si queda "fallida", muestra el error a Tomás y NO vuelvas a pedir.'
      : 'Ya había un pedido abierto para este período: es el mismo, no se duplicó.',
  })
}
