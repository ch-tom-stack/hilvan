import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { esEtapaValida, hoyChile } from '@/lib/agent-crm'
import { calcularCadencia, fueraDeAgenda, aToques, CAMPOS_TOQUE } from '@/lib/crm-cadencia'

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

  // `tamano`, `rubro`, `tipo_cliente` y el estado de cadencia van en la lista a
  // propósito:
  // sin ellos, saber quién está sin clasificar o atrasado obligaba a pedir el
  // detalle prospecto por prospecto —58 llamadas para dos campos.
  let query = admin
    .from('prospectos')
    .select(
      'id, empresa, nombre_contacto, etapa, score, producto_objetivo, origen, tamano, rubro, tipo_cliente, snooze_hasta, ' +
      'responsable:profiles!prospectos_responsable_id_fkey(id, nombre), ' +
      `crm_interacciones(${CAMPOS_TOQUE})`,
    )
    .order('updated_at', { ascending: false })

  if (responsable) query = query.eq('responsable_id', responsable)
  if (etapa) {
    if (!esEtapaValida(etapa)) return NextResponse.json({ error: 'etapa inválida' }, { status: 400 })
    query = query.eq('etapa', etapa)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const hoy = hoyChile()
  const prospectos = (data ?? []).map((p: any) => {
    const { crm_interacciones, snooze_hasta, ...resto } = p
    const cad = calcularCadencia(aToques(crm_interacciones), hoy, snooze_hasta)
    return {
      ...resto,
      ultimo_toque: cad.ultimoToque,
      toques: (crm_interacciones ?? []).length,
      cadencia: fueraDeAgenda(p.etapa) ? null : cad.estado,
      dias_atraso: fueraDeAgenda(p.etapa) ? 0 : cad.diasAtraso,
      sin_clasificar: !p.tamano || !p.rubro,
    }
  })

  const por_etapa: Record<string, number> = {}
  for (const p of prospectos) por_etapa[p.etapa] = (por_etapa[p.etapa] ?? 0) + 1

  return NextResponse.json({
    total: prospectos.length,
    por_etapa,
    sin_clasificar: prospectos.filter((p) => p.sin_clasificar && !fueraDeAgenda(p.etapa)).length,
    prospectos,
  })
}
