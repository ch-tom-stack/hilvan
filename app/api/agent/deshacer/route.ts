import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerAccion } from '@/lib/agent-audit'
import { esMatchTablaValida, patchRestaurar } from '@/lib/agent-conciliacion'

export const runtime = 'nodejs'

// Tablas cuyo gasto se revierte borrando la fila creada (aplica SOLO para inserts,
// no para ediciones como 'gasto-fecha' que usa UPDATE).
const TABLAS_DELETE = ['rendicion_mensual_gastos', 'rendicion_gastos']

// POST /api/agent/deshacer (JSON: { accion_id })
// Revierte la escritura asociada a una acción registrada.
// IMPORTANTE: ramifica por `herramienta` ANTES que por tabla para evitar que
// una edición de fecha (gasto-fecha) sea revertida con DELETE en vez de UPDATE.
//  - 'sembrar-rodaje': borra el rodaje COMPLETO (hijos primero: citaciones,
//    equipo, bloques, escenas, departamentos, locaciones; luego la fila de rodajes).
//  - 'generar-citaciones': borra SOLO las citaciones creadas (payload.citacion_ids),
//    no el rodaje ni el equipo.
//  - 'gasto-fecha': UPDATE fecha_documento al valor anterior (payload.fecha_anterior).
//  - 'editar-gasto': UPDATE tipo_documento y folio a los valores previos
//    (payload.previo). Restaura, no borra la fila.
//  - 'crear-gastos-bulk': borra cada fila creada (payload.creados: [{tabla,id}]).
//    NO usa resultado_tabla/_id (es multi-fila).
//  - 'importar-movimientos': borra cada movimiento creado (payload.creados), pero
//    ABORTA (400) si alguno ya está conciliado (primero deshacer la conciliación).
//    NO usa resultado_tabla/_id (es multi-fila).
//  - 'conciliar': restaura el estado PREVIO de la fila match (payload.previo, según
//    payload.match_tabla) y vuelve el movimiento a conciliado=false. Nunca a ciegas.
//  - 'registrar-factura-emitida': UPDATE cotizaciones restaurando
//    fecha_factura_emitida y numero_factura previos (payload.fecha_anterior /
//    numero_anterior). NO toca fecha_pago_recibido.
//  - Otras herramientas de gastos (insert): DELETE de la fila.
//  - Pago de cotización (update): set fecha_pago_recibido = null.
// Marca la acción como deshecha.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { accion_id } = body ?? {}
  if (!accion_id || typeof accion_id !== 'string') {
    return NextResponse.json({ error: 'Falta accion_id' }, { status: 400 })
  }

  const accion = await obtenerAccion(accion_id)
  if (!accion) return NextResponse.json({ error: 'Acción no encontrada' }, { status: 404 })
  if (accion.deshecha) return NextResponse.json({ error: 'La acción ya fue deshecha' }, { status: 400 })

  const admin = createAdminClient()

  // ── Bulk: no usa resultado_tabla/_id; revierte por payload.creados ─────────
  // Se trata ANTES del guard de resultado_tabla/_id porque la carga masiva es
  // multi-fila y no tiene una única fila/tabla de resultado.
  if (accion.herramienta === 'crear-gastos-bulk') {
    if (!accion.ok) {
      return NextResponse.json({ error: 'La acción no tiene una escritura reversible' }, { status: 400 })
    }
    const payload = accion.payload as { creados?: { tabla: string; id: string }[] } | null
    const creados = Array.isArray(payload?.creados) ? payload!.creados : []
    for (const c of creados) {
      if (!c?.tabla || !c?.id || !TABLAS_DELETE.includes(c.tabla)) continue
      const { error } = await admin.from(c.tabla).delete().eq('id', c.id)
      if (error) {
        return NextResponse.json(
          { error: `Error borrando ${c.tabla} ${c.id}: ${error.message}` },
          { status: 500 },
        )
      }
    }
    await admin.from('agente_acciones').update({ deshecha: true }).eq('id', accion_id)
    return NextResponse.json({ ok: true, borrados: creados.length })
  }

  // ── Importar movimientos: revierte por payload.creados (multi-fila) ─────────
  // Va ANTES del guard de resultado_tabla/_id, como crear-gastos-bulk.
  // GUARD: si ALGÚN movimiento creado ya está conciliado, no se puede borrar
  // (primero hay que deshacer la conciliación de ese movimiento).
  if (accion.herramienta === 'importar-movimientos') {
    if (!accion.ok) {
      return NextResponse.json({ error: 'La acción no tiene una escritura reversible' }, { status: 400 })
    }
    const payload = accion.payload as { creados?: { tabla: string; id: string }[] } | null
    const creados = Array.isArray(payload?.creados) ? payload!.creados : []
    const ids = creados
      .filter((c) => c?.tabla === 'movimientos_bancarios' && c?.id)
      .map((c) => c.id)

    if (ids.length > 0) {
      const { data: conciliados, error: eChk } = await admin
        .from('movimientos_bancarios')
        .select('id')
        .in('id', ids)
        .eq('conciliado', true)
      if (eChk) return NextResponse.json({ error: eChk.message }, { status: 500 })
      if (conciliados && conciliados.length > 0) {
        return NextResponse.json(
          {
            error: `deshaz primero la conciliación del movimiento ${conciliados[0].id}`,
          },
          { status: 400 },
        )
      }

      const { error } = await admin.from('movimientos_bancarios').delete().in('id', ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await admin.from('agente_acciones').update({ deshecha: true }).eq('id', accion_id)
    return NextResponse.json({ ok: true, borrados: ids.length })
  }

  if (!accion.ok || !accion.resultado_tabla || !accion.resultado_id) {
    return NextResponse.json({ error: 'La acción no tiene una escritura reversible' }, { status: 400 })
  }

  if (accion.herramienta === 'registrar-factura-emitida') {
    // Restaurar los valores PREVIOS de factura (nunca a ciegas null).
    // No toca fecha_pago_recibido. Va ANTES de la rama genérica de cotizaciones.
    const payload = accion.payload as
      | { fecha_anterior?: string | null; numero_anterior?: string | null }
      | null
    const { error } = await admin
      .from('cotizaciones')
      .update({
        fecha_factura_emitida: payload?.fecha_anterior ?? null,
        numero_factura: payload?.numero_anterior ?? null,
      })
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'sembrar-rodaje') {
    // Borrar el rodaje COMPLETO. Primero los hijos (por las FKs), luego el rodaje.
    // Orden: citaciones → equipo → bloques → escenas → departamentos → locaciones → rodaje.
    const rodajeId = accion.resultado_id
    const tablasHijas = [
      'rodaje_citaciones',
      'rodaje_equipo_tecnico',
      'rodaje_bloques',
      'rodaje_escenas',
      'rodaje_departamentos',
      'rodaje_locaciones',
    ]
    for (const tabla of tablasHijas) {
      const { error } = await admin.from(tabla).delete().eq('rodaje_id', rodajeId)
      if (error) {
        return NextResponse.json(
          { error: `Error borrando ${tabla}: ${error.message}` },
          { status: 500 },
        )
      }
    }
    const { error: rodajeError } = await admin.from('rodajes').delete().eq('id', rodajeId)
    if (rodajeError) {
      return NextResponse.json({ error: rodajeError.message }, { status: 500 })
    }
  } else if (accion.herramienta === 'generar-citaciones') {
    // Borrar SOLO las citaciones creadas por esta acción (payload.citacion_ids).
    // No toca el rodaje ni el equipo.
    const payload = accion.payload as { citacion_ids?: string[] } | null
    const ids = Array.isArray(payload?.citacion_ids) ? payload!.citacion_ids : []
    if (ids.length > 0) {
      const { error } = await admin.from('rodaje_citaciones').delete().in('id', ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else if (accion.herramienta === 'gasto-fecha') {
    // Edición de fecha: restaurar el valor anterior. Nunca borrar la fila.
    const payload = accion.payload as { fecha_anterior?: string | null } | null
    const fecha_anterior = payload?.fecha_anterior ?? null
    const { error } = await admin
      .from(accion.resultado_tabla)
      .update({ fecha_documento: fecha_anterior })
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'editar-gasto') {
    // Edición de metadata (tipo_documento/folio): restaurar los valores PREVIOS.
    // Nunca borrar la fila ni restaurar a ciegas: usa payload.previo guardado al editar.
    const payload = accion.payload as
      | { previo?: { tipo_documento?: string | null; folio?: string | null } | null }
      | null
    const previo = payload?.previo ?? null
    const { error } = await admin
      .from(accion.resultado_tabla)
      .update({
        tipo_documento: previo?.tipo_documento ?? null,
        folio: previo?.folio ?? null,
      })
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'conciliar') {
    // Conciliación: restaurar el estado PREVIO de la fila match (payload.previo,
    // según payload.match_tabla) y volver el movimiento a no conciliado.
    // Nunca a ciegas: usa el estado guardado al conciliar.
    const payload = accion.payload as
      | { match_tabla?: string; match_id?: string; previo?: Record<string, unknown> | null }
      | null
    const matchTabla = payload?.match_tabla
    const matchId = payload?.match_id
    if (!esMatchTablaValida(matchTabla) || !matchId) {
      return NextResponse.json(
        { error: 'La acción de conciliación no tiene match_tabla/match_id válidos para revertir' },
        { status: 400 },
      )
    }
    const { error: eRestaurar } = await admin
      .from(matchTabla)
      .update(patchRestaurar(matchTabla, payload?.previo ?? null))
      .eq('id', matchId)
    if (eRestaurar) return NextResponse.json({ error: eRestaurar.message }, { status: 500 })

    const { error: eMov } = await admin
      .from('movimientos_bancarios')
      .update({ conciliado: false, conciliado_tabla: null, conciliado_id: null })
      .eq('id', accion.resultado_id)
    if (eMov) return NextResponse.json({ error: eMov.message }, { status: 500 })
  } else if (TABLAS_DELETE.includes(accion.resultado_tabla)) {
    // Creación de gasto: eliminar la fila insertada.
    const { error } = await admin
      .from(accion.resultado_tabla)
      .delete()
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.resultado_tabla === 'cotizaciones') {
    // Revertir el pago marcado (no tocamos factura/folio para no perder datos previos).
    const { error } = await admin
      .from('cotizaciones')
      .update({ fecha_pago_recibido: null })
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json(
      { error: `No se sabe revertir la tabla ${accion.resultado_tabla}` },
      { status: 400 }
    )
  }

  await admin.from('agente_acciones').update({ deshecha: true }).eq('id', accion_id)

  return NextResponse.json({ ok: true })
}
