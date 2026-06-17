import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyChile } from '@/lib/agent-crm'

export const runtime = 'nodejs'

// GET /api/agent/crm/seguimientos?dias=7
// Interacciones con próximo paso vencido o que vence dentro de `dias` (default 7),
// de prospectos aún activos (no confirmados/descartados). Para alertas y recordatorios.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const diasRaw = new URL(req.url).searchParams.get('dias')
  const dias = Number.isFinite(Number(diasRaw)) ? Math.max(0, parseInt(diasRaw ?? '7', 10) || 7) : 7

  const hoy = hoyChile()
  const limite = new Date(hoy + 'T12:00:00')
  limite.setDate(limite.getDate() + dias)
  const limiteStr = limite.toLocaleDateString('en-CA')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('crm_interacciones')
    .select('id, prospecto_id, proximo_paso, fecha_proximo, prospecto:prospectos(empresa, etapa, responsable:profiles!prospectos_responsable_id_fkey(nombre))')
    .not('fecha_proximo', 'is', null)
    .lte('fecha_proximo', limiteStr)
    .order('fecha_proximo', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data ?? [])
    .filter((i: any) => i.prospecto && i.prospecto.etapa !== 'confirmado' && i.prospecto.etapa !== 'descartado')
    .map((i: any) => ({
      prospecto_id: i.prospecto_id,
      empresa: i.prospecto.empresa,
      etapa: i.prospecto.etapa,
      responsable: i.prospecto.responsable?.nombre ?? null,
      proximo_paso: i.proximo_paso,
      fecha_proximo: i.fecha_proximo,
      vencido: i.fecha_proximo < hoy,
    }))

  return NextResponse.json({ hoy, dias, total: items.length, items })
}
