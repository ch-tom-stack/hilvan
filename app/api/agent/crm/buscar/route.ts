import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/crm/buscar?q=
// Busca prospectos por empresa, contacto o email (case-insensitive).
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  const admin = createAdminClient()

  let query = admin
    .from('prospectos')
    .select('id, empresa, nombre_contacto, email, telefono, etapa, score, producto_objetivo, responsable:profiles!prospectos_responsable_id_fkey(id, nombre)')
    .order('empresa')
    .limit(50)

  if (q) {
    const like = `%${q}%`
    query = query.or(`empresa.ilike.${like},nombre_contacto.ilike.${like},email.ilike.${like}`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
