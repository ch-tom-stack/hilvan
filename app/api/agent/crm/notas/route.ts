import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA } from '@/lib/agent-crm'
import { TIPOS_NOTA } from '@/types'

export const runtime = 'nodejs'

// GET    /api/agent/crm/notas?prospecto_id=...        → las notas del prospecto
// POST   /api/agent/crm/notas { prospecto_id, cuerpo, tipo?, titulo? }
// PATCH  /api/agent/crm/notas { nota_id, cuerpo?, titulo?, tipo? }
// DELETE /api/agent/crm/notas { nota_id }
//
// Reemplaza al campo único `prospectos.notas`, que ya se usaba como si fueran
// varias: 21 de 34 tenían varios párrafos y 19 llevaban un prefijo puesto a
// mano. Ese campo quedó vacío y sin uso.
//
// El candado (`bloqueada`) impide EDITAR, no borrar — mismas reglas que en la
// ficha, para que el agente y una persona puedan hacer exactamente lo mismo:
//
//   PATCH  rechaza las bloqueadas. Cambiar un registro en silencio es
//          precisamente lo que el candado previene.
//   DELETE las acepta. Borrar es un acto visible y queda en la auditoría, y es
//          la única salida cuando algo se bloqueó mal. Prohibir las dos cosas
//          dejaría una nota bloqueada por error atrapada para siempre.
//
// Es decir: bloquear es de ida, pero nunca es un callejón sin salida. Si te
// equivocaste, borras y escribes de nuevo — y queda el rastro de que pasó.

export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const prospectoId = new URL(req.url).searchParams.get('prospecto_id')?.trim()
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const admin = createAdminClient()
  const [{ data: notas }, { data: lectura }] = await Promise.all([
    admin.from('crm_notas').select('*').eq('prospecto_id', prospectoId).order('created_at', { ascending: false }),
    // El dossier de La Lectura NO es una nota: se sirve aparte para que quede
    // claro que su fuente es otra y que no se edita por acá.
    admin.from('crm_lecturas').select('url, dossier, fecha').eq('prospecto_id', prospectoId)
      .order('fecha', { ascending: false }).limit(1).maybeSingle(),
  ])

  return NextResponse.json({
    prospecto_id: prospectoId,
    total: (notas ?? []).length,
    notas: notas ?? [],
    lectura: lectura ?? null,
  })
}

export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const prospectoId = strA(body?.prospecto_id)
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const cuerpo = strA(body?.cuerpo)
  if (!cuerpo) return NextResponse.json({ error: 'Falta "cuerpo": la nota está vacía' }, { status: 400 })

  const tipo = strA(body?.tipo) ?? 'nota'
  if (!(TIPOS_NOTA as readonly string[]).includes(tipo)) {
    return NextResponse.json({ error: `tipo inválido — usa uno de: ${TIPOS_NOTA.join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existe } = await admin.from('prospectos').select('id').eq('id', prospectoId).maybeSingle()
  if (!existe) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  const { data, error } = await admin
    .from('crm_notas')
    .insert({
      prospecto_id: prospectoId,
      tipo,
      titulo: strA(body?.titulo),
      cuerpo,
      bloqueada: body?.bloqueada === true,
    })
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) {
    await registrarAccion({ herramienta: 'crm-nota', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'crm-nota', payload: body,
    resultado_tabla: 'crm_notas', resultado_id: data?.id ?? null, ok: true,
  })

  return NextResponse.json({ id: data?.id, prospecto_id: prospectoId, tipo, bloqueada: body?.bloqueada === true })
}

export async function PATCH(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const notaId = strA(body?.nota_id)
  if (!notaId) return NextResponse.json({ error: 'Falta nota_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: antes } = await admin
    .from('crm_notas').select('id, prospecto_id, tipo, titulo, cuerpo, bloqueada').eq('id', notaId).maybeSingle<any>()
  if (!antes) return NextResponse.json({ error: 'nota_id no encontrada' }, { status: 404 })
  if (antes.bloqueada) {
    return NextResponse.json(
      { error: 'Esa nota está bloqueada: es un registro y no se edita. Si está mal, bórrala con DELETE y escribe otra.' },
      { status: 409 },
    )
  }

  // Actualización parcial: sólo lo que venga. Mandar el cuerpo entero para
  // corregir el título borraría el resto sin querer.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('cuerpo' in body) {
    const cuerpo = strA(body.cuerpo)
    if (!cuerpo) return NextResponse.json({ error: 'El cuerpo no puede quedar vacío' }, { status: 400 })
    patch.cuerpo = cuerpo
  }
  if ('titulo' in body) patch.titulo = strA(body.titulo)
  if ('tipo' in body) {
    const tipo = strA(body.tipo)
    if (!tipo || !(TIPOS_NOTA as readonly string[]).includes(tipo)) {
      return NextResponse.json({ error: `tipo inválido — usa uno de: ${TIPOS_NOTA.join(', ')}` }, { status: 400 })
    }
    patch.tipo = tipo
  }
  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'No se indicó ningún campo a cambiar' }, { status: 400 })
  }

  const { error } = await admin.from('crm_notas').update(patch).eq('id', notaId)
  if (error) {
    await registrarAccion({ herramienta: 'crm-nota-editar', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Se guarda el estado anterior de lo tocado: sin eso una corrección
  // equivocada no se puede revertir, porque nadie sabe qué decía antes.
  const previo: Record<string, unknown> = {}
  for (const k of Object.keys(patch)) if (k !== 'updated_at') previo[k] = antes[k]

  await registrarAccion({
    herramienta: 'crm-nota-editar',
    payload: { nota_id: notaId, cambios: patch, antes: previo },
    resultado_tabla: 'crm_notas', resultado_id: notaId, ok: true,
  })

  return NextResponse.json({ nota_id: notaId, prospecto_id: antes.prospecto_id, cambios: patch, antes: previo })
}

export async function DELETE(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const notaId = strA(body?.nota_id)
  if (!notaId) return NextResponse.json({ error: 'Falta nota_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: antes } = await admin
    .from('crm_notas').select('id, prospecto_id, tipo, titulo, cuerpo, bloqueada').eq('id', notaId).maybeSingle<any>()
  if (!antes) return NextResponse.json({ error: 'nota_id no encontrada' }, { status: 404 })

  const { error } = await admin.from('crm_notas').delete().eq('id', notaId)
  if (error) {
    await registrarAccion({ herramienta: 'crm-nota-borrar', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // La nota entera va a la auditoría: es lo único que queda de ella, y sin eso
  // borrar sería irreversible de verdad.
  await registrarAccion({
    herramienta: 'crm-nota-borrar',
    payload: { nota_id: notaId, nota: antes },
    resultado_tabla: 'crm_notas', resultado_id: notaId, ok: true,
  })

  return NextResponse.json({ nota_id: notaId, prospecto_id: antes.prospecto_id, borrada: antes })
}
