import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { periodoAAAAMM } from '@/lib/sii-cli'
import { describirTrabajador } from '@/lib/sii-cola'
import { leerTrabajador, ultimasSolicitudes } from '@/lib/sii-cola-io'

export const runtime = 'nodejs'

// POST /api/agent/sii-estado (JSON)  { periodo?: "202609" }
//
// SOLO LECTURA. Cómo está la importación del SII: el Mac (en línea, fuera de
// línea o bloqueado), los últimos pedidos (de ese período o de todos) y, si se
// pasa período, qué lados están importados y cuándo.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  let periodo: string | null = null
  if (body?.periodo !== undefined && body?.periodo !== null && body?.periodo !== '') {
    periodo = periodoAAAAMM(body.periodo)
    if (!periodo) return NextResponse.json({ error: 'periodo inválido (AAAAMM, ej. 202609)' }, { status: 400 })
  }

  const admin = createAdminClient()
  const ahora = new Date()
  const [trab, sols] = await Promise.all([leerTrabajador(admin), ultimasSolicitudes(admin, periodo)])
  if (!trab.ok) return NextResponse.json({ error: `No se pudo leer el estado del Mac: ${trab.error}` }, { status: 500 })
  if (!sols.ok) return NextResponse.json({ error: `No se pudieron leer los pedidos: ${sols.error}` }, { status: 500 })

  let importaciones: unknown[] | undefined
  if (periodo) {
    const { data, error } = await admin
      .from('sii_importaciones')
      .select('lado, estado, documentos, errores, importado_at')
      .eq('periodo', periodo)
    if (error) return NextResponse.json({ error: `No se pudo leer el estado de importación: ${error.message}` }, { status: 500 })
    importaciones = data ?? []
  }

  return NextResponse.json({
    mac: describirTrabajador(trab.valor, ahora),
    solicitudes: sols.valor,
    ...(periodo ? { periodo, importaciones } : {}),
  })
}
