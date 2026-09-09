import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { cargarCrono, cargarFeriados, serializarCrono } from '@/lib/agent-crono'

export const runtime = 'nodejs'

// GET /api/agent/crono?id=
// Detalle completo de un crono: ficha, etapas {desde, hasta}, hitos ordenados por
// fecha, próximo hito clave y url.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const id = new URL(req.url).searchParams.get('id')?.trim() ?? ''
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const admin = createAdminClient()
  const [crono, feriados] = await Promise.all([cargarCrono(admin, id), cargarFeriados(admin)])
  if (!crono) return NextResponse.json({ error: 'Crono no encontrado' }, { status: 404 })
  return NextResponse.json(serializarCrono(crono, feriados))
}
