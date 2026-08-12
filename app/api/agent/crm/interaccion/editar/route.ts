import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA, FORMATO_FECHA } from '@/lib/agent-crm'

export const runtime = 'nodejs'

// POST /api/agent/crm/interaccion/editar { interaccion_id, gmail_thread?, fecha?, ... }
//
// Corrige una interacción ya registrada. Existe sobre todo por `gmail_thread`:
// ese campo es la llave con la que el cotejo diario reconoce lo ya registrado.
// Una interacción cargada a mano sin él no se puede aparear con su hilo, así que
// el cotejo la vuelve a insertar cada vez que corre — un duplicado permanente
// que se acumula y ensucia el conteo de toques, del que depende la cadencia.
//
// ACTUALIZACIÓN PARCIAL: sólo se escriben las claves presentes en el body.

const CAMPOS = ['gmail_thread', 'fecha', 'tipo', 'resumen', 'proximo_paso', 'fecha_proximo', 'enviado_por'] as const
const FECHAS = new Set(['fecha', 'fecha_proximo'])

export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const id = strA(body?.interaccion_id)
  if (!id) return NextResponse.json({ error: 'Falta interaccion_id' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const campo of CAMPOS) {
    if (!(campo in body)) continue
    const valor = strA(body[campo])
    if (valor && FECHAS.has(campo) && !FORMATO_FECHA.test(valor)) {
      return NextResponse.json({ error: `${campo} inválida (YYYY-MM-DD)` }, { status: 400 })
    }
    if (campo === 'fecha' && !valor) {
      // Sin fecha el motor de cadencia ignora el toque: sería borrarlo a medias.
      return NextResponse.json({ error: 'fecha no puede quedar vacía' }, { status: 400 })
    }
    patch[campo] = valor
  }

  // `respondido` es booleano, no texto: va aparte para no pasar por strA.
  if ('respondido' in body) {
    if (typeof body.respondido !== 'boolean') {
      return NextResponse.json({ error: 'respondido debe ser true o false' }, { status: 400 })
    }
    patch.respondido = body.respondido
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No se indicó ningún campo a cambiar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: antes } = await admin
    .from('crm_interacciones')
    .select('id, prospecto_id, gmail_thread, fecha, tipo, resumen, proximo_paso, fecha_proximo, enviado_por, respondido')
    .eq('id', id)
    .maybeSingle()
  if (!antes) return NextResponse.json({ error: 'interaccion_id no encontrada' }, { status: 404 })

  const { error } = await admin.from('crm_interacciones').update(patch).eq('id', id)
  if (error) {
    await registrarAccion({ herramienta: 'crm-interaccion-editar', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const previo: Record<string, unknown> = {}
  for (const k of Object.keys(patch)) previo[k] = (antes as any)[k]

  await registrarAccion({
    herramienta: 'crm-interaccion-editar',
    payload: { interaccion_id: id, cambios: patch, antes: previo },
    resultado_tabla: 'crm_interacciones',
    resultado_id: id,
    ok: true,
  })

  return NextResponse.json({
    interaccion_id: id,
    prospecto_id: (antes as any).prospecto_id,
    cambios: patch,
    antes: previo,
  })
}
