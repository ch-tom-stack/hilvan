import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA } from '@/lib/agent-crm'
import { abrirHiloEn, cerrarHiloEn, reabrirHiloEn } from '@/lib/crm-conversacion'
import { MOTIVOS_CIERRE_HILO } from '@/types'

export const runtime = 'nodejs'

// POST /api/agent/crm/hilo { accion: 'abrir'|'cerrar'|'reabrir', ... }
//
// Las líneas de conversación. Abrir una nueva CIERRA la vigente y con eso
// reinicia la cadencia: los toques sin respuesta del interlocutor anterior
// dejan de contar. Es lo que hace que retomar una marca después de meses, o
// pasar al reemplazo de quien se fue, no arranque con el prospecto agotado.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const accion = strA(body?.accion)
  if (!accion || !['abrir', 'cerrar', 'reabrir', 'asignar'].includes(accion)) {
    return NextResponse.json({ error: 'accion debe ser abrir, cerrar, reabrir o asignar' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Poner cara a una línea que ya existe. Sin esto, identificar a la persona a
  // mitad de una conversación obligaba a cerrar el hilo y abrir otro —lo que
  // reinicia la cadencia— sólo para anotar un nombre.
  if (accion === 'asignar') {
    const hiloId = strA(body?.hilo_id)
    const contactoId = strA(body?.contacto_id)
    if (!hiloId) return NextResponse.json({ error: 'Falta hilo_id' }, { status: 400 })
    if (!contactoId) return NextResponse.json({ error: 'Falta contacto_id' }, { status: 400 })

    const { data: hilo } = await admin
      .from('crm_hilos').select('id, prospecto_id').eq('id', hiloId).maybeSingle<any>()
    if (!hilo) return NextResponse.json({ error: 'hilo_id no encontrado' }, { status: 404 })

    // El contacto tiene que ser de esta marca: cruzar personas entre prospectos
    // dejaría la conversación atribuida a alguien de otra empresa.
    const { data: contacto } = await admin
      .from('crm_contactos').select('id, nombre, prospecto_id').eq('id', contactoId).maybeSingle<any>()
    if (!contacto) return NextResponse.json({ error: 'contacto_id no encontrado' }, { status: 404 })
    if (contacto.prospecto_id !== hilo.prospecto_id) {
      return NextResponse.json({ error: 'Ese contacto pertenece a otro prospecto' }, { status: 400 })
    }

    const patch: Record<string, unknown> = { contacto_id: contactoId }
    const titulo = strA(body?.titulo)
    if (titulo) patch.titulo = titulo

    const { error } = await admin.from('crm_hilos').update(patch).eq('id', hiloId)
    if (error) {
      await registrarAccion({ herramienta: 'crm-hilo', payload: body, ok: false, error: error.message })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    await registrarAccion({
      herramienta: 'crm-hilo', payload: body,
      resultado_tabla: 'crm_hilos', resultado_id: hiloId, ok: true,
    })
    return NextResponse.json({ accion, hilo_id: hiloId, contacto_id: contactoId, con: contacto.nombre })
  }

  if (accion === 'abrir') {
    const prospectoId = strA(body?.prospecto_id)
    if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

    const { data: existe } = await admin.from('prospectos').select('id').eq('id', prospectoId).maybeSingle()
    if (!existe) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

    const motivo = strA(body?.motivo_cierre) ?? 'cambio_contacto'
    if (!MOTIVOS_CIERRE_HILO[motivo]) {
      return NextResponse.json(
        { error: `motivo_cierre inválido — usa uno de: ${Object.keys(MOTIVOS_CIERRE_HILO).join(', ')}` },
        { status: 400 },
      )
    }

    const res = await abrirHiloEn(admin, prospectoId, {
      contacto_id: strA(body?.contacto_id),
      titulo: strA(body?.titulo),
      motivo_cierre: motivo,
      cerrar_actual: body?.cerrar_actual !== false,
    })
    if (res.error) {
      await registrarAccion({ herramienta: 'crm-hilo', payload: body, ok: false, error: res.error })
      return NextResponse.json({ error: res.error }, { status: 500 })
    }
    await registrarAccion({
      herramienta: 'crm-hilo', payload: body,
      resultado_tabla: 'crm_hilos', resultado_id: res.hilo_id ?? null, ok: true,
    })
    return NextResponse.json({ accion, hilo_id: res.hilo_id, prospecto_id: prospectoId })
  }

  const hiloId = strA(body?.hilo_id)
  if (!hiloId) return NextResponse.json({ error: 'Falta hilo_id' }, { status: 400 })
  const { data: hilo } = await admin.from('crm_hilos').select('id').eq('id', hiloId).maybeSingle()
  if (!hilo) return NextResponse.json({ error: 'hilo_id no encontrado' }, { status: 404 })

  let err: string | null
  if (accion === 'cerrar') {
    const motivo = strA(body?.motivo) ?? 'manual'
    if (!MOTIVOS_CIERRE_HILO[motivo]) {
      return NextResponse.json(
        { error: `motivo inválido — usa uno de: ${Object.keys(MOTIVOS_CIERRE_HILO).join(', ')}` },
        { status: 400 },
      )
    }
    err = await cerrarHiloEn(admin, hiloId, motivo)
  } else {
    err = await reabrirHiloEn(admin, hiloId)
  }

  if (err) {
    await registrarAccion({ herramienta: 'crm-hilo', payload: body, ok: false, error: err })
    return NextResponse.json({ error: err }, { status: 500 })
  }
  await registrarAccion({
    herramienta: 'crm-hilo', payload: body,
    resultado_tabla: 'crm_hilos', resultado_id: hiloId, ok: true,
  })
  return NextResponse.json({ accion, hilo_id: hiloId })
}
