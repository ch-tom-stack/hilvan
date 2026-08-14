import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA } from '@/lib/agent-crm'
import { ORIGENES_PROSPECTO, SCORES_PROSPECTO, ARQUETIPOS, PRODUCTOS_OBJETIVO } from '@/types'

export const runtime = 'nodejs'

// POST /api/agent/crm/editar { prospecto_id, origen?, nombre_contacto?, email?, ... }
//
// Corrige los datos de un prospecto. Existe sobre todo por `origen`: ese campo
// decide la temperatura (frío vs entrante) y con eso la secuencia de correos —
// a un entrante no se le manda el toque 1 de valor, ya levantó la mano. Sin
// esta herramienta el operador detectaba el error y no podía arreglarlo.
//
// ACTUALIZACIÓN PARCIAL: sólo se escriben las claves que vengan en el body. Es
// la diferencia entre "corregir el origen" y "borrar todo lo demás sin querer",
// porque el normalizador de crear convierte lo ausente en null.
//
// NO toca `etapa` (tiene hilvan_mover_etapa, con su vía de propuesta) ni
// `responsable_id` (para eso está hilvan_solicitar_asignacion). Para clasificar
// tamaño/rubro/tipo de cliente está hilvan_clasificar_prospecto.
//
// Tampoco toca `notas`: ese campo se vació en ago-2026 y las notas viven en
// crm_notas, una por tema. Se escriben con hilvan_nota_escribir.

const CAMPOS = [
  'nombre_contacto', 'email', 'telefono', 'origen', 'arquetipo',
  'score', 'decisor', 'angulo', 'producto_objetivo', 'empresa',
] as const

const VALIDOS: Record<string, readonly string[]> = {
  origen: ORIGENES_PROSPECTO,
  score: SCORES_PROSPECTO,
  arquetipo: ARQUETIPOS,
  producto_objetivo: PRODUCTOS_OBJETIVO,
}

export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const prospectoId = strA(body?.prospecto_id)
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const campo of CAMPOS) {
    if (!(campo in body)) continue          // ausente = no se toca
    const valor = strA(body[campo])

    // Vaciar a propósito se permite (null), pero un valor con dedo se rechaza:
    // un `origen` inválido deja al prospecto "sin clasificar" y le cambia la
    // secuencia de correos sin que nadie se entere.
    if (valor && VALIDOS[campo] && !VALIDOS[campo].includes(valor)) {
      return NextResponse.json(
        { error: `${campo} inválido — usa uno de: ${VALIDOS[campo].join(', ')}` },
        { status: 400 },
      )
    }
    if (campo === 'empresa' && !valor) {
      return NextResponse.json({ error: 'empresa no puede quedar vacía' }, { status: 400 })
    }
    patch[campo] = valor
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No se indicó ningún campo a cambiar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: antes } = await admin
    .from('prospectos')
    .select('id, empresa, nombre_contacto, email, telefono, origen, arquetipo, score, decisor, angulo, producto_objetivo')
    .eq('id', prospectoId)
    .maybeSingle()
  if (!antes) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  const { error } = await admin.from('prospectos').update(patch).eq('id', prospectoId)
  if (error) {
    await registrarAccion({ herramienta: 'crm-editar', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Se guarda el estado ANTERIOR de los campos tocados: sin eso, una corrección
  // equivocada no se puede deshacer porque nadie sabe qué decía antes.
  const previo: Record<string, unknown> = {}
  for (const k of Object.keys(patch)) previo[k] = (antes as any)[k]

  await registrarAccion({
    herramienta: 'crm-editar',
    payload: { prospecto_id: prospectoId, cambios: patch, antes: previo },
    resultado_tabla: 'prospectos',
    resultado_id: prospectoId,
    ok: true,
  })

  return NextResponse.json({ prospecto_id: prospectoId, cambios: patch, antes: previo })
}
