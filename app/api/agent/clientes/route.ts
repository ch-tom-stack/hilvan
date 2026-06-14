import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/clientes?q=
// Busca clientes por nombre, empresa o RUT. Devuelve id, nombre, empresa, rut, email.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  const admin = createAdminClient()

  let query = admin
    .from('clientes')
    .select('id, nombre, empresa, rut, email')
    .order('nombre')
    .limit(50)

  if (q) {
    // Búsqueda en nombre, empresa o RUT (case-insensitive).
    const like = `%${q}%`
    query = query.or(`nombre.ilike.${like},empresa.ilike.${like},rut.ilike.${like}`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
