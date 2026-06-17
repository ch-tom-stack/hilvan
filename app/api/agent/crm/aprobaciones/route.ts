import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/crm/aprobaciones?estado=pendiente
// Lista la Bandeja de Aprobación (crm_aprobaciones). Default estado=pendiente.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const estado = new URL(req.url).searchParams.get('estado')?.trim() || 'pendiente'
  const admin = createAdminClient()

  let query = admin
    .from('crm_aprobaciones')
    .select('id, tipo, prospecto_id, payload, estado, origen, nota_agente, created_at')
    .order('created_at', { ascending: true })
    .limit(100)

  if (estado !== 'todos') query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ estado, total: data?.length ?? 0, aprobaciones: data ?? [] })
}
