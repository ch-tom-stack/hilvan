import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyChile } from '@/lib/agent-crm'
import { calcularCadencia, prioridadCadencia, excluidoDeAgenda, sumarDias, aToques, CAMPOS_TOQUE } from '@/lib/crm-cadencia'
import { evaluarCotejo, HERRAMIENTAS_COTEJO } from '@/lib/crm-reconciliacion'

export const runtime = 'nodejs'

// GET /api/agent/crm/seguimientos?dias=7
//
// La agenda de contacto: a quién le toca hoy y a quién le toca dentro de `dias`.
//
// Antes esto filtraba por `crm_interacciones.fecha_proximo`, un campo que en la
// práctica nadie llena (1 de 56 registros). El resultado era una herramienta que
// devolvía casi nada mientras el motor de cadencia —el que alimenta el digest
// matinal y la pantalla del CRM— veía decenas de vencidos. Dos fuentes de verdad
// para la misma pregunta, y la que respondía "no hay trabajo" era la equivocada.
//
// Ahora corre sobre `calcularCadencia`, el mismo motor. `fecha_proximo` y
// `proximo_paso` se siguen devolviendo como CONTEXTO —qué se prometió— pero no
// deciden la fecha: para posponer a alguien está `snooze_hasta`, que el motor sí
// respeta. Un solo reloj.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const diasRaw = new URL(req.url).searchParams.get('dias')
  const dias = Number.isFinite(Number(diasRaw)) ? Math.max(0, parseInt(diasRaw ?? '7', 10) || 7) : 7

  const hoy = hoyChile()
  const limite = sumarDias(hoy, dias)

  const admin = createAdminClient()

  // Cuándo se cotejaron los correos por última vez.
  //
  // Va acá, en la herramienta con la que se planifica el día, porque es donde
  // el operador tropieza con el dato antes de decidir a quién escribir. Hasta
  // ahora el aviso vivía sólo en la pantalla y en el correo del digest: el
  // 20-ago se escribieron 85 borradores con siete días sin cotejar, o sea sobre
  // una foto en la que nadie había contestado nunca.
  const { data: ultimoCotejo } = await admin
    .from('agente_acciones')
    .select('created_at')
    .in('herramienta', HERRAMIENTAS_COTEJO as unknown as string[])
    .eq('ok', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string }>()

  const cotejo = evaluarCotejo(
    ultimoCotejo
      ? new Date(ultimoCotejo.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
      : null,
    hoy,
  )

  const { data, error } = await admin
    .from('prospectos')
    .select(
      'id, empresa, etapa, snooze_hasta, datos_dudosos, duda, ' +
      'responsable:profiles!prospectos_responsable_id_fkey(nombre), ' +
      `crm_interacciones(${CAMPOS_TOQUE}, proximo_paso, fecha_proximo)`,
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Los de datos dudosos NO entran en la agenda: contactar con la ficha
  // equivocada es peor que no contactar. Se devuelven aparte para que se vean.
  const dudosos = (data ?? []).filter((p: any) => p.datos_dudosos)

  const items = (data ?? [])
    .filter((p: any) => !excluidoDeAgenda(p))
    .map((p: any) => {
      const toques = p.crm_interacciones ?? []
      const cad = calcularCadencia(aToques(toques), hoy, p.snooze_hasta)

      // El próximo paso que alguien haya anotado, si lo hay: no manda sobre la
      // fecha, pero le dice al agente qué se comprometió.
      const conPaso = toques
        .filter((t: any) => t.fecha && t.proximo_paso)
        .sort((a: any, b: any) => (a.fecha < b.fecha ? 1 : -1))[0]

      return {
        prospecto_id: p.id,
        empresa: p.empresa,
        etapa: p.etapa,
        responsable: p.responsable?.nombre ?? null,
        estado: cad.estado,
        ultimo_toque: cad.ultimoToque,
        sin_respuesta: cad.sinRespuesta,
        vence: cad.vence,
        dias_atraso: cad.diasAtraso,
        vencido: cad.diasAtraso > 0,
        pendiente: cad.pendiente,
        proximo_paso: conPaso?.proximo_paso ?? null,
        fecha_proximo: conPaso?.fecha_proximo ?? null,
        _prio: prioridadCadencia(cad),
      }
    })
    // Pendientes hoy + los que vencen dentro del rango. Los agotados (16 sin
    // respuesta) quedan fuera: su cadencia se detuvo a propósito.
    .filter((i) => i.pendiente || (i.vence !== null && i.vence <= limite))
    .sort((a, b) => b._prio - a._prio)
    .map(({ _prio, ...i }) => i)

  return NextResponse.json({
    hoy,
    dias,
    // Si esto viene con avisar=true, la agenda de abajo está calculada sobre
    // respuestas que no se registraron: puede haber gente esperando contestación
    // marcada como si nunca hubiera hablado. Cotejar ANTES de escribir.
    cotejo,
    // Fuera de la agenda por datos poco fiables. Van acá y no escondidos:
    // resolverlos es trabajo, y sin verlos nadie lo hace.
    por_verificar: dudosos.map((p: any) => ({
      prospecto_id: p.id, empresa: p.empresa, duda: p.duda,
      responsable: p.responsable?.nombre ?? null,
    })),
    total: items.length,
    pendientes_hoy: items.filter((i) => i.pendiente).length,
    items,
  })
}
