import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { esEtapaValida } from '@/lib/agent-crm'

export const runtime = 'nodejs'

// GET /api/agent/crm/pipeline?responsable=&etapa=
// Lista los prospectos del pipeline, opcionalmente filtrados por responsable
// (uuid) y/o etapa. Devuelve también un conteo por etapa.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const url = new URL(req.url)
  const responsable = url.searchParams.get('responsable')?.trim()
  const etapa = url.searchParams.get('etapa')?.trim()
  const admin = createAdminClient()

  let query = admin
    .from('prospectos')
    .select('id, empresa, nombre_contacto, etapa, score, producto_objetivo, origen, responsable:profiles!prospectos_responsable_id_fkey(id, nombre)')
    .order('updated_at', { ascending: false })

  if (responsable) query = query.eq('responsable_id', responsable)
  if (etapa) {
    if (!esEtapaValida(etapa)) return NextResponse.json({ error: 'etapa inválida' }, { status: 400 })
    query = query.eq('etapa', etapa)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const por_etapa: Record<string, number> = {}
  for (const p of data ?? []) por_etapa[p.etapa] = (por_etapa[p.etapa] ?? 0) + 1

  return NextResponse.json({ total: data?.length ?? 0, por_etapa, prospectos: data ?? [] })
}
