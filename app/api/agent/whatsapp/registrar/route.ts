import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA, FORMATO_FECHA } from '@/lib/agent-crm'
import { hiloVigente, insertarRespuesta } from '@/lib/crm-conversacion'
import { diaChile } from '@/lib/whatsapp'

export const runtime = 'nodejs'

// POST /api/agent/whatsapp/registrar
//   { prospecto_id, fecha, resumen, proximo_paso?, fecha_proximo? }
//   { prospecto_id, fecha, sin_registro: true, motivo }
//
// Pasa al CRM la conversación de WhatsApp de UN prospecto en UN día. Toma todos
// los mensajes pendientes de ese día —no hay que mandar ids— y deja:
//   · un toque ENVIADO (tipo 'mensaje') si nosotros escribimos, y
//   · una RESPUESTA recibida si ellos escribieron, que marca como respondido el
//     mensaje nuestro al que contestan (de ahí saca la cadencia su estado).
// Al CRM va el RESUMEN, no la transcripción.
//
// `sin_registro` es para el ruido ("jaja gracias", un sticker): marca los
// mensajes como vistos sin crear nada, para que no vuelvan a aparecer.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const prospectoId = strA(body?.prospecto_id)
  const fecha = strA(body?.fecha)
  const resumen = strA(body?.resumen)
  const sinRegistro = body?.sin_registro === true
  const motivo = strA(body?.motivo)
  const proximoPaso = strA(body?.proximo_paso)
  const fechaProximo = strA(body?.fecha_proximo)

  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })
  if (!fecha || !FORMATO_FECHA.test(fecha)) return NextResponse.json({ error: 'fecha inválida (YYYY-MM-DD)' }, { status: 400 })
  if (fechaProximo && !FORMATO_FECHA.test(fechaProximo)) return NextResponse.json({ error: 'fecha_proximo inválida (YYYY-MM-DD)' }, { status: 400 })
  if (sinRegistro && !motivo) return NextResponse.json({ error: 'sin_registro exige "motivo"' }, { status: 400 })
  if (!sinRegistro && !resumen) return NextResponse.json({ error: 'Falta "resumen" (o usa sin_registro con motivo)' }, { status: 400 })

  const admin = createAdminClient()
  const { data: existe } = await admin.from('prospectos').select('id').eq('id', prospectoId).maybeSingle()
  if (!existe) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  const { data: pendientes, error: eP } = await admin
    .from('whatsapp_mensajes')
    .select('id, direccion, enviado_at')
    .eq('prospecto_id', prospectoId)
    .is('procesado_at', null)
    .order('enviado_at', { ascending: true })
    .limit(1000)
  if (eP) return NextResponse.json({ error: eP.message }, { status: 500 })

  const delDia = (pendientes ?? []).filter(m => diaChile((m as { enviado_at: string }).enviado_at) === fecha) as
    { id: string; direccion: 'enviado' | 'recibido'; enviado_at: string }[]
  if (delDia.length === 0) {
    return NextResponse.json({ error: `No hay mensajes pendientes de ese prospecto el ${fecha}` }, { status: 404 })
  }

  const mensajeIds = delDia.map(m => m.id)
  const hayEnviados = delDia.some(m => m.direccion === 'enviado')
  const hayRecibidos = delDia.some(m => m.direccion === 'recibido')
  const ultimoEsDeEllos = delDia[delDia.length - 1].direccion === 'recibido'

  const creadas: string[] = []
  let respondidoMarcado: string | null = null

  const fallar = async (mensaje: string) => {
    // Lo que alcanzó a crearse se borra: o queda la conversación entera o nada.
    if (creadas.length > 0) await admin.from('crm_interacciones').delete().in('id', creadas)
    if (respondidoMarcado) await admin.from('crm_interacciones').update({ respondido: false }).eq('id', respondidoMarcado)
    await registrarAccion({ herramienta: 'whatsapp-registrar', payload: body, ok: false, error: mensaje })
    return NextResponse.json({ error: mensaje }, { status: 500 })
  }

  if (!sinRegistro) {
    const insertarEnviado = async (): Promise<string | null> => {
      const hiloId = await hiloVigente(admin, prospectoId)
      const { data, error } = await admin
        .from('crm_interacciones')
        .insert({
          prospecto_id: prospectoId, fecha, tipo: 'mensaje', direccion: 'enviado',
          resumen, hilo_id: hiloId, respondido: false,
          proximo_paso: proximoPaso, fecha_proximo: fechaProximo,
        })
        .select('id').single()
      if (error || !data) return null
      creadas.push(data.id)
      return data.id
    }

    const insertarRecibido = async (respondeA?: string): Promise<boolean> => {
      // ¿Ya estaba respondido el mensaje al que contestan? Si lo estaba, el
      // deshacer no debe desmarcarlo.
      let objetivo = respondeA ?? null
      if (!objetivo) {
        const { data: ultimo } = await admin.from('crm_interacciones')
          .select('id').eq('prospecto_id', prospectoId).eq('direccion', 'enviado')
          // Hasta ESE día: al cargar el historial, "el último enviado" a secas
          // sería un toque posterior a esta respuesta.
          .lte('fecha', fecha)
          .order('fecha', { ascending: false }).limit(1).maybeSingle()
        objetivo = (ultimo as { id: string } | null)?.id ?? null
      }
      let yaRespondido = true
      if (objetivo) {
        const { data: o } = await admin.from('crm_interacciones').select('respondido').eq('id', objetivo).maybeSingle()
        yaRespondido = (o as { respondido: boolean } | null)?.respondido === true
      }
      const r = await insertarRespuesta(admin, prospectoId, {
        fecha, tipo: 'mensaje', resumen: resumen ?? undefined,
        responde_a: objetivo ?? undefined, sin_responde_a: !objetivo,
      })
      if (r.error || !r.id) return false
      creadas.push(r.id)
      // Si solo hablaron ellos no hay toque nuestro donde anotar el próximo paso.
      if (!hayEnviados && (proximoPaso || fechaProximo)) {
        await admin.from('crm_interacciones')
          .update({ proximo_paso: proximoPaso, fecha_proximo: fechaProximo }).eq('id', r.id)
      }
      if (objetivo && !yaRespondido) respondidoMarcado = objetivo
      return true
    }

    // El orden importa para `respondido`: si ellos hablaron últimos, están
    // contestando lo que mandamos HOY; si hablamos últimos, contestaban algo
    // anterior y nuestro mensaje de hoy queda esperando respuesta.
    if (hayEnviados && hayRecibidos && ultimoEsDeEllos) {
      const idEnviado = await insertarEnviado()
      if (!idEnviado) return fallar('No se pudo registrar el toque enviado')
      if (!(await insertarRecibido(idEnviado))) return fallar('No se pudo registrar la respuesta')
    } else {
      if (hayRecibidos && !(await insertarRecibido())) return fallar('No se pudo registrar la respuesta')
      if (hayEnviados && !(await insertarEnviado())) return fallar('No se pudo registrar el toque enviado')
    }

    // Un toque nuestro consume el snooze, igual que desde la app.
    if (hayEnviados) await admin.from('prospectos').update({ snooze_hasta: null }).eq('id', prospectoId)
  }

  const accionId = await registrarAccion({
    herramienta: 'whatsapp-registrar',
    payload: { ...body, creadas, respondido_marcado: respondidoMarcado, mensaje_ids: mensajeIds },
    resultado_tabla: 'whatsapp_mensajes',
    resultado_id: mensajeIds[0],
    ok: true,
  })

  const { error: eM } = await admin
    .from('whatsapp_mensajes')
    .update({ procesado_at: new Date().toISOString(), accion_id: accionId })
    .in('id', mensajeIds)
  if (eM) return fallar(`Se registró pero no se pudieron marcar los mensajes: ${eM.message}`)

  return NextResponse.json({
    prospecto_id: prospectoId,
    fecha,
    mensajes_procesados: mensajeIds.length,
    interacciones_creadas: creadas,
    marco_respondido: respondidoMarcado,
    sin_registro: sinRegistro,
    accion_id: accionId,
  })
}
