import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { agregarBiblioteca } from '@/lib/crm-biblioteca'

export const runtime = 'nodejs'

// GET /api/agent/crm/biblioteca
// Insights de contactos por etapa (empíricos, en vivo) para que el agente mejore
// sus recomendaciones: a qué toque cierran los confirmados, a cuál se enfrían,
// tasa de respuesta y promedios/medianas por etapa. Solo LECTURA.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const admin = createAdminClient()
  const [{ data: prospectos }, { data: interacciones }] = await Promise.all([
    admin.from('prospectos').select('id, etapa, origen'),
    admin.from('crm_interacciones').select('prospecto_id, respondido'),
  ])

  const biblioteca = agregarBiblioteca(
    (prospectos ?? []) as { id: string; etapa: string; origen: string | null }[],
    (interacciones ?? []) as { prospecto_id: string; respondido: boolean | null }[],
  )

  return NextResponse.json(biblioteca)
}
