import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { buscarLeadsWeb } from '@/lib/agent-leads'

export const runtime = 'nodejs'
export const maxDuration = 60 // el scraping de varias páginas tarda

// POST /api/agent/crm/leads-web { sector, max? }
// Descubre empresas de un sector en la web (Firecrawl), arma un dossier por cada
// una (sitio + correo genérico publicado + gancho) y las deja como PROPUESTAS
// (tipo prospecto_nuevo) en la Bandeja. NO crea prospectos: el humano aprueba.
// NO obtiene el correo personal del decisor (no está publicado) — entrega el
// correo genérico de la empresa + contexto.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'FIRECRAWL_API_KEY no configurada (agrégala en .env.local y en Vercel)' },
      { status: 503 },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const sector = typeof body?.sector === 'string' ? body.sector.trim() : ''
  if (!sector) return NextResponse.json({ error: 'Falta "sector" (ej: "agencias de publicidad Santiago")' }, { status: 400 })
  const max = Math.min(10, Math.max(1, parseInt(String(body?.max ?? 6), 10) || 6))

  // 1) Descubrir + enriquecer.
  let candidatos
  let revisados = 0
  let descartados = 0
  let descartadosDetalle: { empresa: string; sitio: string; giro: string }[] = []
  try {
    const r = await buscarLeadsWeb(sector, max, apiKey)
    candidatos = r.candidatos
    revisados = r.revisados
    descartados = r.descartados
    descartadosDetalle = r.descartadosDetalle
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error buscando leads' }, { status: 502 })
  }

  const admin = createAdminClient()

  // 2) Dedup contra propuestas pendientes y prospectos existentes (por empresa).
  const empresas = candidatos.map(c => c.empresa)
  const { data: yaProp } = await admin
    .from('crm_aprobaciones')
    .select('payload')
    .eq('tipo', 'prospecto_nuevo')
    .eq('estado', 'pendiente')
  const { data: yaProsp } = await admin.from('prospectos').select('empresa').in('empresa', empresas)
  const existentes = new Set<string>([
    ...((yaProsp ?? []).map((p: any) => (p.empresa || '').toLowerCase())),
    ...((yaProp ?? []).map((a: any) => (a.payload?.empresa || '').toLowerCase())),
  ])

  // 3) Insertar propuestas (las nuevas).
  const nuevas = candidatos.filter(c => !existentes.has(c.empresa.toLowerCase()))
  let creadas = 0
  for (const c of nuevas) {
    const canal = c.email ? `correo: ${c.email}` : 'sin correo público (usar formulario del sitio)'
    const notas = `Sitio: ${c.sitio} · ${canal}${c.gancho ? ` · Gancho: ${c.gancho}` : ''}`
    const { error } = await admin.from('crm_aprobaciones').insert({
      tipo: 'prospecto_nuevo',
      prospecto_id: null,
      estado: 'pendiente',
      origen: 'agente',
      nota_agente: `Lead web (${sector}). ${c.email ? 'Correo genérico publicado.' : 'Solo formulario.'} El correo del decisor NO se obtiene scrapeando.`,
      payload: {
        empresa: c.empresa,
        email: c.email,
        origen: 'web',
        angulo: c.gancho,
        notas,
      },
    })
    if (!error) creadas++
  }

  await registrarAccion({ herramienta: 'crm-leads-web', payload: { sector, max }, resultado_tabla: 'crm_aprobaciones', ok: true })

  return NextResponse.json({
    sector,
    revisados,
    descartados_por_filtro: descartados,
    candidatos: candidatos.length,
    propuestas_creadas: creadas,
    duplicados_omitidos: candidatos.length - nuevas.length,
    detalle: candidatos.map(c => ({ empresa: c.empresa, sitio: c.sitio, email: c.email, canal: c.canal, gancho: c.gancho })),
    descartados_detalle: descartadosDetalle,
    nota: 'Propuestas dejadas en la Bandeja (/crm/aprobaciones) para aprobar. Correos son GENÉRICOS de empresa, no del decisor.',
  })
}
