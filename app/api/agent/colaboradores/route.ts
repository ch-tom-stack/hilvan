import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/colaboradores?q=
// Busca colaboradores por nombre o RUT.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  const admin = createAdminClient()

  let query = admin
    .from('colaboradores')
    .select('id, nombre, rut')
    .order('nombre', { ascending: true })
    .limit(50)

  if (q) query = query.or(`nombre.ilike.%${q}%,rut.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = (data ?? []).map((c: any) => ({
    id: c.id,
    nombre: c.nombre,
    rut: c.rut ?? null,
  }))

  return NextResponse.json(filas)
}
