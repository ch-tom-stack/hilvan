import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { descubrirMarcas } from '@/lib/agent-leads'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/agent/crm/descubrir-marcas { sector }
// PASO 1 del descubrimiento: minar fuentes curadas (listicles/guías/directorios)
// del sector y extraer con LLM la LISTA de marcas mencionadas (nombre + sitio).
// NO scrapea cada marca, NO escribe en la Bandeja: devuelve la lista para que un
// humano la revise/pode. Después se enriquecen las aprobadas con
// hilvan_buscar_leads_web pasando `objetivos`.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'FIRECRAWL_API_KEY no configurada' }, { status: 503 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const sector = typeof body?.sector === 'string' ? body.sector.trim() : ''
  if (!sector) return NextResponse.json({ error: 'Falta "sector"' }, { status: 400 })

  try {
    const { marcas, fuentes } = await descubrirMarcas(sector, apiKey)
    return NextResponse.json({
      sector,
      fuentes_minadas: fuentes,
      total: marcas.length,
      marcas,
      nota: 'Lista candidata para revisar/podar. Para enriquecer las aprobadas, llama hilvan_buscar_leads_web con objetivos=[sitios o nombres].',
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error descubriendo marcas' }, { status: 502 })
  }
}
