import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { cruceOrigenTamano } from '@/lib/crm-cruce'

export const runtime = 'nodejs'

// GET /api/agent/crm/metricas
// Concentración Falabella (riesgo central del negocio) + conteo por etapa y por
// responsable. La concentración Falabella se reporta aquí aunque no se muestre
// en la UI: para el análisis es el KPI norte de diversificación de cartera.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const desdeRaw = new URL(req.url).searchParams.get('desde')?.trim() ?? ''
  if (desdeRaw && !/^\d{4}-\d{2}-\d{2}$/.test(desdeRaw)) {
    return NextResponse.json({ error: 'desde inválido (YYYY-MM-DD)' }, { status: 400 })
  }
  const desde = desdeRaw || null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('prospectos')
    .select('etapa, empresa, origen, tamano, created_at, datos_dudosos, cliente:clientes(nombre), responsable:profiles!prospectos_responsable_id_fkey(nombre)')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const esFalabella = (p: any) =>
    (p.empresa ?? '').toLowerCase().includes('falabella') ||
    (p.cliente?.nombre ?? '').toLowerCase().includes('falabella')

  const pipeline = rows.filter(p => p.etapa !== 'descartado')
  const ganados = rows.filter(p => p.etapa === 'confirmado')
  const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0)

  const por_etapa: Record<string, number> = {}
  for (const p of rows) por_etapa[p.etapa] = (por_etapa[p.etapa] ?? 0) + 1

  const por_responsable: Record<string, number> = {}
  for (const p of pipeline) {
    const n = (p.responsable as any)?.nombre ?? 'Sin asignar'
    por_responsable[n] = (por_responsable[n] ?? 0) + 1
  }

  const falabellaPipeline = pipeline.filter(esFalabella).length
  const falabellaGanados = ganados.filter(esFalabella).length

  return NextResponse.json({
    concentracion_falabella: {
      pipeline: { total: pipeline.length, falabella: falabellaPipeline, pct_no_falabella: pct(pipeline.length - falabellaPipeline, pipeline.length) },
      ganados: { total: ganados.length, falabella: falabellaGanados, pct_no_falabella: pct(ganados.length - falabellaGanados, ganados.length) },
    },
    por_etapa,
    por_responsable,
    // Qué tamaño de cliente trae cada canal. ?desde=YYYY-MM-DD lo acota a los
    // prospectos creados desde esa fecha (para medir el efecto de un cambio).
    cruce_origen_tamano: cruceOrigenTamano(rows as any[], desde),
  })
}
