import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA, FORMATO_FECHA } from '@/lib/agent-crm'
import { insertarRespuesta } from '@/lib/crm-conversacion'

export const runtime = 'nodejs'

// POST /api/agent/crm/respuesta { prospecto_id, resumen?, cuerpo?, contacto_id?, responde_a?, fecha? }
//
// Registra lo que la contraparte CONTESTÓ.
//
// Es la otra mitad del cotejo de correos: hasta ahora, encontrar una respuesta
// en Gmail sólo permitía marcar un booleano, y el contenido —que es donde está
// la objeción, el precio que les pareció caro, el "vuelve en marzo"— se perdía.
// Al guardarla, el mensaje al que contesta queda marcado como respondido, que
// es de donde la cadencia saca el estado más urgente de todos.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const prospectoId = strA(body?.prospecto_id)
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const fecha = strA(body?.fecha)
  if (fecha && !FORMATO_FECHA.test(fecha)) {
    return NextResponse.json({ error: 'fecha inválida (YYYY-MM-DD)' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existe } = await admin.from('prospectos').select('id').eq('id', prospectoId).maybeSingle()
  if (!existe) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  const res = await insertarRespuesta(admin, prospectoId, {
    fecha: fecha ?? undefined,
    tipo: strA(body?.tipo) ?? undefined,
    resumen: strA(body?.resumen) ?? undefined,
    cuerpo: strA(body?.cuerpo) ?? undefined,
    contacto_id: strA(body?.contacto_id) ?? undefined,
    responde_a: strA(body?.responde_a) ?? undefined,
    hilo_id: strA(body?.hilo_id) ?? undefined,
    gmail_thread: strA(body?.gmail_thread) ?? undefined,
  })
  if (res.error) {
    await registrarAccion({ herramienta: 'crm-respuesta', payload: body, ok: false, error: res.error })
    return NextResponse.json({ error: res.error }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'crm-respuesta',
    payload: body,
    resultado_tabla: 'crm_interacciones',
    resultado_id: res.id ?? null,
    ok: true,
  })

  return NextResponse.json({ id: res.id, prospecto_id: prospectoId, hilo_id: res.hilo_id, responde_a: res.responde_a })
}
