import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA } from '@/lib/agent-crm'

export const runtime = 'nodejs'

// GET    /api/agent/crm/contactos?prospecto_id=...  → el árbol de la marca
// POST   /api/agent/crm/contactos { prospecto_id, nombre?, email?, cargo?, ... }
// PATCH  /api/agent/crm/contactos { contacto_id, ... }
// DELETE /api/agent/crm/contactos { contacto_id }
//
// El árbol de contactos: quién es quién en la marca.
//
// Existía la tabla y la UI, pero ninguna herramienta de agente. Tres tools
// —hilvan_hilo, hilvan_registrar_respuesta, hilvan_borrador_escribir— piden un
// `contacto_id` que el operador no tenía de dónde sacar, así que el nombre y el
// correo de quien firmaba cada correo se perdían o quedaban sueltos en una nota.
//
// `fuente` es de dónde salió el contacto (el correo, la reunión, el sitio). No
// es decorativo: es lo que permite sostener la regla de no inventar datos
// cuando alguien pregunte de dónde salió esta persona.

const CAMPOS = ['nombre', 'cargo', 'email', 'telefono', 'notas', 'fuente'] as const

export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const prospectoId = new URL(req.url).searchParams.get('prospecto_id')?.trim()
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const admin = createAdminClient()
  const [{ data: contactos }, { data: hilos }] = await Promise.all([
    admin.from('crm_contactos').select('*').eq('prospecto_id', prospectoId)
      .order('es_decisor', { ascending: false }).order('created_at', { ascending: true }),
    // Con quién está hablando cada línea viva: sirve para saber si el contacto
    // que vas a usar ya está anclado a un hilo o hay que asignarlo.
    admin.from('crm_hilos').select('id, contacto_id, titulo')
      .eq('prospecto_id', prospectoId).is('cerrado_at', null),
  ])

  const asignados = new Set((hilos ?? []).map((h: any) => h.contacto_id).filter(Boolean))

  return NextResponse.json({
    prospecto_id: prospectoId,
    total: (contactos ?? []).length,
    contactos: (contactos ?? []).map((c: any) => ({ ...c, en_hilo_abierto: asignados.has(c.id) })),
    hilos_abiertos: (hilos ?? []).map((h: any) => ({
      hilo_id: h.id, titulo: h.titulo, contacto_id: h.contacto_id,
    })),
    hilos_sin_contacto: (hilos ?? []).filter((h: any) => !h.contacto_id).length,
  })
}

export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const prospectoId = strA(body?.prospecto_id)
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const nombre = strA(body?.nombre)
  const email = strA(body?.email)?.toLowerCase() ?? null
  if (!nombre && !email) {
    return NextResponse.json({ error: 'Un contacto necesita al menos nombre o email' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existe } = await admin.from('prospectos').select('id').eq('id', prospectoId).maybeSingle()
  if (!existe) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  // Dedup por correo antes de escribir: dos fichas de la misma persona en la
  // misma marca hacen que la mitad de la conversación cuelgue de cada una.
  if (email) {
    const { data: yaHay } = await admin
      .from('crm_contactos').select('id, nombre')
      .eq('prospecto_id', prospectoId).ilike('email', email).maybeSingle<any>()
    if (yaHay) {
      return NextResponse.json(
        { error: `Ya existe un contacto con ese correo en esta marca: ${yaHay.nombre ?? email}`, contacto_id: yaHay.id },
        { status: 409 },
      )
    }
  }

  const { data, error } = await admin
    .from('crm_contactos')
    .insert({
      prospecto_id: prospectoId,
      nombre, email,
      cargo: strA(body?.cargo),
      telefono: strA(body?.telefono),
      notas: strA(body?.notas),
      fuente: strA(body?.fuente),
      es_decisor: body?.es_decisor === true,
    })
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) {
    await registrarAccion({ herramienta: 'crm-contacto-crear', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Si la marca tiene una sola línea abierta y está sin contacto, se ancla acá:
  // es el caso normal —acabas de identificar con quién hablas— y dejarlo para
  // una segunda llamada es cómo se quedan 29 hilos sin nadie asignado.
  let anclado: string | null = null
  if (data?.id && body?.anclar_a_hilo !== false) {
    const { data: abiertos } = await admin
      .from('crm_hilos').select('id, contacto_id').eq('prospecto_id', prospectoId).is('cerrado_at', null)
    const solos = (abiertos ?? []) as { id: string; contacto_id: string | null }[]
    if (solos.length === 1 && !solos[0].contacto_id) {
      await admin.from('crm_hilos').update({ contacto_id: data.id }).eq('id', solos[0].id)
      anclado = solos[0].id
    }
  }

  await registrarAccion({
    herramienta: 'crm-contacto-crear', payload: body,
    resultado_tabla: 'crm_contactos', resultado_id: data?.id ?? null, ok: true,
  })

  return NextResponse.json({
    contacto_id: data?.id, prospecto_id: prospectoId, nombre, email,
    anclado_a_hilo: anclado,
  })
}

export async function PATCH(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const contactoId = strA(body?.contacto_id)
  if (!contactoId) return NextResponse.json({ error: 'Falta contacto_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: antes } = await admin
    .from('crm_contactos').select('*').eq('id', contactoId).maybeSingle<any>()
  if (!antes) return NextResponse.json({ error: 'contacto_id no encontrado' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  for (const campo of CAMPOS) {
    if (!(campo in body)) continue
    patch[campo] = campo === 'email' ? (strA(body[campo])?.toLowerCase() ?? null) : strA(body[campo])
  }
  if ('es_decisor' in body) {
    if (typeof body.es_decisor !== 'boolean') {
      return NextResponse.json({ error: 'es_decisor debe ser true o false' }, { status: 400 })
    }
    patch.es_decisor = body.es_decisor
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No se indicó ningún campo a cambiar' }, { status: 400 })
  }

  const { error } = await admin.from('crm_contactos').update(patch).eq('id', contactoId)
  if (error) {
    await registrarAccion({ herramienta: 'crm-contacto-editar', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const previo: Record<string, unknown> = {}
  for (const k of Object.keys(patch)) previo[k] = antes[k]

  await registrarAccion({
    herramienta: 'crm-contacto-editar',
    payload: { contacto_id: contactoId, cambios: patch, antes: previo },
    resultado_tabla: 'crm_contactos', resultado_id: contactoId, ok: true,
  })

  return NextResponse.json({ contacto_id: contactoId, cambios: patch, antes: previo })
}

export async function DELETE(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const contactoId = strA(body?.contacto_id)
  if (!contactoId) return NextResponse.json({ error: 'Falta contacto_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: antes } = await admin
    .from('crm_contactos').select('*').eq('id', contactoId).maybeSingle<any>()
  if (!antes) return NextResponse.json({ error: 'contacto_id no encontrado' }, { status: 404 })

  // Con conversación encima ya no es un error de tipeo, es historia: borrarlo
  // dejaría mensajes y líneas sin dueño. Para eso está editar.
  const [{ count: enMensajes }, { count: enHilos }] = await Promise.all([
    admin.from('crm_interacciones').select('id', { count: 'exact', head: true }).eq('contacto_id', contactoId),
    admin.from('crm_hilos').select('id', { count: 'exact', head: true }).eq('contacto_id', contactoId),
  ])
  if ((enMensajes ?? 0) > 0 || (enHilos ?? 0) > 0) {
    return NextResponse.json({
      error: `Ese contacto tiene conversación asociada (${enMensajes ?? 0} mensajes, ${enHilos ?? 0} líneas). Corrígelo con hilvan_contacto_editar en vez de borrarlo.`,
    }, { status: 409 })
  }

  const { error } = await admin.from('crm_contactos').delete().eq('id', contactoId)
  if (error) {
    await registrarAccion({ herramienta: 'crm-contacto-borrar', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'crm-contacto-borrar',
    payload: { contacto_id: contactoId, contacto: antes },
    resultado_tabla: 'crm_contactos', resultado_id: contactoId, ok: true,
  })

  return NextResponse.json({ contacto_id: contactoId, borrado: antes })
}
