import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA, hoyChile } from '@/lib/agent-crm'

export const runtime = 'nodejs'

// GET  /api/agent/crm/datos-dudosos            → los marcados, con su motivo
// POST /api/agent/crm/datos-dudosos { prospecto_id, duda }        → marcar
// POST /api/agent/crm/datos-dudosos { prospecto_id, verificado }  → resolver
//
// La ficha no es de fiar: el contacto es de otra empresa, el nombre se capturó
// de un menú del sitio, los datos vinieron de una corrida que trajo basura.
//
// Es distinto de "En frío" y la diferencia importa porque el riesgo es opuesto:
// un prospecto frío no empeora si lo dejas quieto; uno con la ficha equivocada
// empeora cada vez que lo trabajas. Por eso sale de la agenda hasta resolverse.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('prospectos')
    .select('id, empresa, email, nombre_contacto, duda, etapa, responsable:profiles!prospectos_responsable_id_fkey(nombre)')
    .eq('datos_dudosos', true)
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    total: (data ?? []).length,
    prospectos: (data ?? []).map((p: any) => ({
      prospecto_id: p.id, empresa: p.empresa, etapa: p.etapa,
      email: p.email, nombre_contacto: p.nombre_contacto,
      duda: p.duda, responsable: p.responsable?.nombre ?? null,
    })),
  })
}

export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const prospectoId = strA(body?.prospecto_id)
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const duda = strA(body?.duda)
  const verificado = strA(body?.verificado)
  if (!duda && !verificado) {
    return NextResponse.json(
      { error: 'Manda "duda" (qué está mal) para marcar, o "verificado" (qué comprobaste) para resolver' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { data: antes } = await admin
    .from('prospectos').select('empresa, duda, datos_dudosos').eq('id', prospectoId).maybeSingle<any>()
  if (!antes) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  // La duda no se borra al resolver: queda como historia de qué estuvo mal y
  // cómo se comprobó. Borrarla dejaría la ficha idéntica a una que nunca tuvo
  // problema, y se perdería el aprendizaje sobre de dónde salió el dato malo.
  const patch = duda
    ? { datos_dudosos: true, duda }
    : { datos_dudosos: false, duda: `[Resuelto ${hoyChile()}] ${verificado}${antes.duda ? `\n\nDecía: ${antes.duda}` : ''}` }

  const { error } = await admin.from('prospectos').update(patch).eq('id', prospectoId)
  if (error) {
    await registrarAccion({ herramienta: 'crm-datos-dudosos', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'crm-datos-dudosos',
    payload: { prospecto_id: prospectoId, cambios: patch, antes: { datos_dudosos: antes.datos_dudosos, duda: antes.duda } },
    resultado_tabla: 'prospectos', resultado_id: prospectoId, ok: true,
  })

  return NextResponse.json({
    prospecto_id: prospectoId, empresa: antes.empresa,
    datos_dudosos: patch.datos_dudosos, duda: patch.duda,
  })
}
