import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerAccion } from '@/lib/agent-audit'
import { esMatchTablaValida } from '@/lib/agent-conciliacion'
import { recomputarObligacion, recomputarMovimiento } from '@/lib/agent-conciliacion-io'

export const runtime = 'nodejs'

// Tablas cuyo gasto se revierte borrando la fila creada (aplica SOLO para inserts,
// no para ediciones como 'gasto-fecha' que usa UPDATE).
const TABLAS_DELETE = ['rendicion_mensual_gastos', 'rendicion_gastos', 'misiones']

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
//  - 'conciliar': borra las filas del ledger `conciliaciones` de esta acción
//    (payload.ledger_ids) y RECOMPUTA el pago de cada obligación afectada
//    (payload.obligaciones) y del movimiento desde el ledger restante.
//  - 'conciliar-vario': borra la fila de flujo_caja_manual creada (payload.flujo_id)
//    y RECOMPUTA el movimiento desde el ledger (parcial si era mixto, no conciliado
//    si era vario puro). resultado_id = movimiento_id.
//  - 'crear-cotizacion' / 'cotizacion-duplicar': borra la cotización COMPLETA en
//    cascada (items → subgrupos → departamentos → cotizaciones → cotizacion_grupos,
//    este último solo si payload.grupo_id existe — en duplicar modo version/variante
//    el grupo es compartido y NO se borra). Va ANTES de la rama genérica
//    resultado_tabla==='cotizaciones' (pago) para no colisionar.
//  - 'crear-cliente': borra la fila de clientes (resultado_id).
//  - 'registrar-factura-emitida': UPDATE cotizaciones restaurando
//    fecha_factura_emitida y numero_factura previos (payload.fecha_anterior /
//    numero_anterior). NO toca fecha_pago_recibido.
//  - CRM (CH-10): 'crm-crear' / 'crm-crear-propuesta' / 'crm-interaccion' /
//    'crm-lectura' / 'crm-brief' borran la fila creada (prospectos arrastra hijos
//    por CASCADE; crm-lectura NO revierte el patch E7). 'crm-mover-etapa' restaura
//    payload.etapa_anterior. 'crm-resolver-aprobacion' NO es reversible (400).
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

  // ── Misiones: borra lo creado y restaura lo que se pisó ────────────────────
  // Va ANTES del guard de resultado_tabla/_id: es multi-fila, y a diferencia de
  // los otros bulk puede haber hecho UPDATE sobre misiones que ya existían. Sin
  // restaurar el valor previo, deshacer dejaría la semana de alguien con el
  // texto nuevo y sin forma de recuperar el anterior.
  if (accion.herramienta === 'misiones-crear') {
    const payload = accion.payload as {
      creados?: { tabla: string; id: string }[]
      restaurar?: Record<string, unknown>[]
    } | null

    for (const c of payload?.creados ?? []) {
      if (!c?.tabla || !c?.id || !TABLAS_DELETE.includes(c.tabla)) continue
      const { error } = await admin.from(c.tabla).delete().eq('id', c.id)
      if (error) {
        return NextResponse.json(
          { error: `Error borrando misión ${c.id}: ${error.message}` },
          { status: 500 },
        )
      }
    }

    for (const previo of payload?.restaurar ?? []) {
      const { id, ...campos } = previo as { id?: string } & Record<string, unknown>
      if (!id) continue
      const { error } = await admin.from('misiones').update(campos).eq('id', id)
      if (error) {
        return NextResponse.json(
          { error: `Error restaurando misión ${id}: ${error.message}` },
          { status: 500 },
        )
      }
    }

    await admin.from('agente_acciones').update({ deshecha: true }).eq('id', accion_id)
    return NextResponse.json({
      ok: true,
      borradas: payload?.creados?.length ?? 0,
      restauradas: payload?.restaurar?.length ?? 0,
    })
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

  // ── Agregar ítems a cotización: borra lo creado (ítems + depto/subgrupo nuevos).
  // Multi-fila: va ANTES del guard de resultado_tabla. Reversa en orden inverso
  // (los hijos se crearon después → se borran primero, respetando las FKs).
  if (accion.herramienta === 'cotizacion-agregar-items') {
    if (!accion.ok) {
      return NextResponse.json({ error: 'La acción no tiene una escritura reversible' }, { status: 400 })
    }
    const payload = accion.payload as { creados?: { tabla: string; id: string }[] } | null
    const creados = Array.isArray(payload?.creados) ? payload!.creados : []
    const tablasOk = ['cotizacion_items', 'cotizacion_subgrupos', 'cotizacion_departamentos']
    for (const c of [...creados].reverse()) {
      if (!c?.tabla || !c?.id || !tablasOk.includes(c.tabla)) continue
      const { error } = await admin.from(c.tabla).delete().eq('id', c.id)
      if (error) return NextResponse.json({ error: `Error borrando ${c.tabla} ${c.id}: ${error.message}` }, { status: 500 })
    }
    await admin.from('agente_acciones').update({ deshecha: true }).eq('id', accion_id)
    return NextResponse.json({ ok: true, borrados: creados.length })
  }

  // Códigos de descuento: se identifican por `codigo` (no por resultado_id) →
  // van ANTES del guard de resultado_id.
  if (accion.herramienta === 'crear-codigo') {
    if (!accion.ok) return NextResponse.json({ error: 'La acción no tiene una escritura reversible' }, { status: 400 })
    const payload = accion.payload as { codigo?: string; nuevo?: boolean } | null
    if (payload?.nuevo === false) return NextResponse.json({ error: 'El código ya existía antes (idempotente): no hay nada que borrar.' }, { status: 400 })
    if (!payload?.codigo) return NextResponse.json({ error: 'Acción sin código' }, { status: 400 })
    // Solo borrar si sigue sin usarse (no quemar un código ya aplicado).
    const { data: c } = await admin.from('descuento_codigos').select('estado').eq('codigo', payload.codigo).maybeSingle<{ estado: string }>()
    if (c?.estado === 'usado') return NextResponse.json({ error: 'El código ya fue usado: no se borra.' }, { status: 400 })
    const { error } = await admin.from('descuento_codigos').delete().eq('codigo', payload.codigo)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await admin.from('agente_acciones').update({ deshecha: true }).eq('id', accion_id)
    return NextResponse.json({ ok: true, borrado: payload.codigo })
  }

  if (accion.herramienta === 'codigo-estado') {
    if (!accion.ok) return NextResponse.json({ error: 'La acción no tiene una escritura reversible' }, { status: 400 })
    const payload = accion.payload as { codigo?: string; previo?: { estado: string; usado_at: string | null } } | null
    if (!payload?.codigo || !payload?.previo) return NextResponse.json({ error: 'Acción sin previo' }, { status: 400 })
    const { error } = await admin.from('descuento_codigos')
      .update({ estado: payload.previo.estado, usado_at: payload.previo.usado_at })
      .eq('codigo', payload.codigo)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await admin.from('agente_acciones').update({ deshecha: true }).eq('id', accion_id)
    return NextResponse.json({ ok: true, restaurado: payload.codigo })
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
  } else if (accion.herramienta === 'cotizacion-precio-categoria') {
    // Restaurar el precio_manual previo de la categoría/subcategoría.
    const payload = accion.payload as { previo?: { precio_manual?: number | null } } | null
    const { error } = await admin
      .from(accion.resultado_tabla)
      .update({ precio_manual: payload?.previo?.precio_manual ?? null })
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'cotizacion-estado') {
    // Restaurar el estado previo (no toca factura/pago). Va ANTES de la rama
    // genérica resultado_tabla==='cotizaciones' (pago) para no colisionar.
    const payload = accion.payload as { previo_estado?: string } | null
    if (!payload?.previo_estado) {
      return NextResponse.json({ error: 'No se guardó el estado previo' }, { status: 400 })
    }
    const { error } = await admin
      .from('cotizaciones')
      .update({ estado: payload.previo_estado })
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'cotizacion-editar-item') {
    // Restaurar SOLO los campos editados (payload.previo tiene exactamente esos).
    const payload = accion.payload as { previo?: Record<string, unknown> } | null
    const previo = payload?.previo
    if (!previo) return NextResponse.json({ error: 'No se guardaron los valores previos' }, { status: 400 })
    const { error } = await admin.from('cotizacion_items').update(previo).eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'cotizacion-editar') {
    // Restaurar los campos de cabecera editados. Va ANTES de la rama genérica
    // resultado_tabla==='cotizaciones' (pago) para no colisionar.
    const payload = accion.payload as { previo?: Record<string, unknown> } | null
    if (!payload?.previo) return NextResponse.json({ error: 'No se guardaron los valores previos' }, { status: 400 })
    const { error } = await admin.from('cotizaciones').update(payload.previo).eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'cotizacion-eliminar-item') {
    // Re-insertar la fila del ítem que se borró (con su mismo id).
    const payload = accion.payload as { fila?: Record<string, unknown> | null } | null
    if (!payload?.fila) return NextResponse.json({ error: 'No se guardó la fila para restaurar' }, { status: 400 })
    const { error } = await admin.from('cotizacion_items').insert(payload.fila)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'cotizacion-categoria') {
    // Ramifica por la acción original guardada en el payload.
    const payload = accion.payload as
      | { accion?: string; previo?: Record<string, unknown>; fila?: Record<string, unknown> | null }
      | null
    const sub = payload?.accion
    if (sub === 'crear') {
      const { error } = await admin.from(accion.resultado_tabla).delete().eq('id', accion.resultado_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (sub === 'renombrar' || sub === 'reordenar') {
      if (!payload?.previo) return NextResponse.json({ error: 'No se guardó el valor previo' }, { status: 400 })
      const { error } = await admin.from(accion.resultado_tabla).update(payload.previo).eq('id', accion.resultado_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (sub === 'eliminar') {
      if (!payload?.fila) return NextResponse.json({ error: 'No se guardó la fila para restaurar' }, { status: 400 })
      const { error } = await admin.from(accion.resultado_tabla).insert(payload.fila)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (sub === 'mover_item') {
      if (!payload?.previo) return NextResponse.json({ error: 'No se guardó la ubicación previa' }, { status: 400 })
      const { error } = await admin.from('cotizacion_items').update(payload.previo).eq('id', accion.resultado_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      return NextResponse.json({ error: `No se sabe revertir la categoría (accion=${sub})` }, { status: 400 })
    }
  } else if (accion.herramienta === 'crear-cotizacion' || accion.herramienta === 'cotizacion-duplicar') {
    // Borrar la cotización COMPLETA en cascada por FKs. Va ANTES de la rama
    // genérica resultado_tabla==='cotizaciones' (que es el pago) para no colisionar.
    // Orden: items → subgrupos → departamentos (por cotizacion_id) → la cotización
    // → el grupo (que crea esta acción solo en 'copia'/crear; guardado en payload.grupo_id).
    // En 'cotizacion-duplicar' modo version/variante NO hay grupo_id → el grupo es
    // compartido y NO se borra.
    const cotizacionId = accion.resultado_id
    const payload = accion.payload as { grupo_id?: string } | null
    const hijas = ['cotizacion_items', 'cotizacion_subgrupos', 'cotizacion_departamentos']
    for (const tabla of hijas) {
      const { error } = await admin.from(tabla).delete().eq('cotizacion_id', cotizacionId)
      if (error) {
        return NextResponse.json(
          { error: `Error borrando ${tabla}: ${error.message}` },
          { status: 500 },
        )
      }
    }
    const { error: eCot } = await admin.from('cotizaciones').delete().eq('id', cotizacionId)
    if (eCot) return NextResponse.json({ error: eCot.message }, { status: 500 })

    // El grupo lo creó esta acción; borrarlo deja todo limpio.
    if (payload?.grupo_id) {
      const { error: eGrupo } = await admin
        .from('cotizacion_grupos')
        .delete()
        .eq('id', payload.grupo_id)
      if (eGrupo) return NextResponse.json({ error: eGrupo.message }, { status: 500 })
    }
  } else if (accion.herramienta === 'crear-cliente') {
    // Borrar la fila de clientes creada por esta acción.
    const { error } = await admin.from('clientes').delete().eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'rodaje-bloques') {
    // Restaurar el plan anterior COMPLETO (snapshot en payload.previo): borra
    // los bloques actuales del rodaje y reinserta los del snapshot con sus
    // mismos ids/anclas — un "reemplazar" se revierte al plan entero, no
    // bloque por bloque.
    const payload = accion.payload as { rodaje_id?: string; previo?: any[] } | null
    const rodajeId = payload?.rodaje_id
    if (!rodajeId) return NextResponse.json({ error: 'Acción sin rodaje_id' }, { status: 400 })
    const { error: eDel } = await admin.from('rodaje_bloques').delete().eq('rodaje_id', rodajeId)
    if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 })
    const previo = Array.isArray(payload?.previo) ? payload!.previo! : []
    if (previo.length > 0) {
      const { error: eIns } = await admin.from('rodaje_bloques').insert(previo)
      if (eIns) return NextResponse.json({ error: eIns.message }, { status: 500 })
    }
  } else if (accion.herramienta === 'rodaje-equipo') {
    // Restaurar el equipo anterior completo (snapshot). Las citaciones de
    // personas que se re-crean con el mismo id siguen válidas.
    const payload = accion.payload as { rodaje_id?: string; previo?: any[] } | null
    const rodajeId = payload?.rodaje_id
    if (!rodajeId) return NextResponse.json({ error: 'Acción sin rodaje_id' }, { status: 400 })
    // Citaciones de personas que van a desaparecer (no están en el snapshot).
    const previo = Array.isArray(payload?.previo) ? payload!.previo! : []
    const idsPrevios = new Set(previo.map((p: any) => p.id))
    const { data: actuales } = await admin
      .from('rodaje_equipo_tecnico').select('id').eq('rodaje_id', rodajeId)
    const huerfanas = (actuales ?? []).map((a: any) => a.id).filter((id: string) => !idsPrevios.has(id))
    if (huerfanas.length > 0) {
      await admin.from('rodaje_citaciones').delete().in('persona_id', huerfanas)
    }
    const { error: eDel } = await admin.from('rodaje_equipo_tecnico').delete().eq('rodaje_id', rodajeId)
    if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 })
    if (previo.length > 0) {
      const { error: eIns } = await admin.from('rodaje_equipo_tecnico').insert(previo)
      if (eIns) return NextResponse.json({ error: eIns.message }, { status: 500 })
    }
  } else if (accion.herramienta === 'editar-rodaje') {
    // Restaurar los valores previos de los campos editados (y el ancla del
    // primer bloque si el edit cambió la hora de call).
    const payload = accion.payload as {
      previo?: Record<string, unknown>
      bloque_ancla?: { id: string; hora_inicio_fija: string | null }
    } | null
    if (!payload?.previo || Object.keys(payload.previo).length === 0) {
      return NextResponse.json({ error: 'Acción sin valores previos guardados' }, { status: 400 })
    }
    const { error } = await admin.from('rodajes').update(payload.previo).eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (payload.bloque_ancla) {
      await admin
        .from('rodaje_bloques')
        .update({ hora_inicio_fija: payload.bloque_ancla.hora_inicio_fija })
        .eq('id', payload.bloque_ancla.id)
    }
  } else if (accion.herramienta === 'sembrar-rodaje' || accion.herramienta === 'crear-rodaje') {
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
    // Edición de metadata: restaurar los valores PREVIOS (todos los campos editables).
    // Nunca borrar la fila ni restaurar a ciegas: usa payload.previo guardado al editar.
    const payload = accion.payload as
      | {
          previo?: {
            tipo_documento?: string | null
            folio?: string | null
            sin_documento_aceptado?: boolean
            folio_compartido?: boolean
            referencia_externa?: string | null
            documento_recibido?: boolean
          } | null
        }
      | null
    const previo = payload?.previo ?? null
    const { error } = await admin
      .from(accion.resultado_tabla)
      .update({
        tipo_documento: previo?.tipo_documento ?? null,
        folio: previo?.folio ?? null,
        sin_documento_aceptado: previo?.sin_documento_aceptado ?? false,
        folio_compartido: previo?.folio_compartido ?? false,
        referencia_externa: previo?.referencia_externa ?? null,
        documento_recibido: previo?.documento_recibido ?? true,
      })
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'editar-cliente') {
    // Restaura los campos editados a su valor previo (payload.previo). No borra.
    const payload = accion.payload as { previo?: Record<string, string | null> } | null
    const previo = payload?.previo ?? {}
    if (Object.keys(previo).length > 0) {
      const { error } = await admin.from('clientes').update(previo).eq('id', accion.resultado_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else if (accion.herramienta === 'pagar-gasto') {
    // Restaurar pagado/fecha_pago/comprobante previos (no borra la fila).
    const payload = accion.payload as
      | { previo?: { pagado?: boolean; fecha_pago?: string | null; comprobante_pago_url?: string | null } | null }
      | null
    const previo = payload?.previo ?? null
    const { error } = await admin
      .from(accion.resultado_tabla)
      .update({
        pagado: previo?.pagado ?? false,
        fecha_pago: previo?.fecha_pago ?? null,
        comprobante_pago_url: previo?.comprobante_pago_url ?? null,
      })
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'cerrar-item') {
    // Restaurar rendicion_completada previo del ítem de cotización.
    const payload = accion.payload as { previo?: { rendicion_completada?: boolean } | null } | null
    const { error } = await admin
      .from('cotizacion_items')
      .update({ rendicion_completada: payload?.previo?.rendicion_completada ?? false })
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'eliminar-gasto') {
    // Borrado reversible: re-insertar la fila completa que se guardó al eliminar
    // (con su mismo id). Va ANTES de la rama genérica TABLAS_DELETE para no
    // intentar borrar de nuevo una fila que justamente queremos restaurar.
    const payload = accion.payload as { fila?: Record<string, unknown> | null } | null
    const fila = payload?.fila
    if (!fila) {
      return NextResponse.json(
        { error: 'La acción de eliminación no guardó la fila para restaurar' },
        { status: 400 },
      )
    }
    const { error } = await admin.from(accion.resultado_tabla).insert(fila)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'conciliar') {
    // Conciliación N:M: borrar las filas del ledger creadas por esta acción
    // (payload.ledger_ids) y RECOMPUTAR el estado de pago de cada obligación
    // afectada (payload.obligaciones) y del movimiento desde el ledger restante.
    // Recomputar (no restaurar un "previo") es correcto incluso si otra acción
    // también asignó a la misma obligación: refleja lo que queda en el ledger.
    const payload = accion.payload as
      | {
          ledger_ids?: string[]
          obligaciones?: { tabla?: string; id?: string }[]
        }
      | null
    const ledgerIds = Array.isArray(payload?.ledger_ids) ? payload!.ledger_ids : []
    if (ledgerIds.length > 0) {
      const { error: eDel } = await admin.from('conciliaciones').delete().in('id', ledgerIds)
      if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 })
    }

    const obligaciones = Array.isArray(payload?.obligaciones) ? payload!.obligaciones : []
    for (const o of obligaciones) {
      if (!esMatchTablaValida(o?.tabla) || !o?.id) continue
      const err = await recomputarObligacion(admin, o.tabla, o.id)
      if (err) return NextResponse.json({ error: err }, { status: 500 })
    }

    const errMov = await recomputarMovimiento(admin, accion.resultado_id)
    if (errMov) return NextResponse.json({ error: errMov }, { status: 500 })
  } else if (accion.herramienta === 'conciliar-vario') {
    // Conciliación vario: borrar la fila de flujo_caja_manual creada
    // (payload.flujo_id) y RECOMPUTAR el movimiento desde el ledger. Si el
    // movimiento era mixto (parte conciliada a obligaciones), recomputar deja el
    // estado correcto (parcial); si era vario puro, vuelve a no conciliado.
    const payload = accion.payload as { flujo_id?: string } | null
    const flujoId = payload?.flujo_id
    if (flujoId) {
      const { error: eFlujo } = await admin
        .from('flujo_caja_manual')
        .delete()
        .eq('id', flujoId)
      if (eFlujo) return NextResponse.json({ error: eFlujo.message }, { status: 500 })
    }
    const errMov = await recomputarMovimiento(admin, accion.resultado_id)
    if (errMov) return NextResponse.json({ error: errMov }, { status: 500 })
  } else if (
    accion.herramienta === 'crm-crear' ||
    accion.herramienta === 'crm-crear-propuesta' ||
    accion.herramienta === 'crm-interaccion' ||
    accion.herramienta === 'crm-lectura' ||
    accion.herramienta === 'crm-brief'
  ) {
    // Creaciones del CRM: borrar la fila creada (resultado_tabla/_id).
    // 'crm-crear' (prospectos) arrastra interacciones/lecturas/aprobaciones por CASCADE.
    // NOTA: 'crm-lectura' borra la lectura pero NO revierte el patch E7 (arquetipo/
    // producto/etapa) que pudo haber aplicado sobre el prospecto.
    const { error } = await admin
      .from(accion.resultado_tabla)
      .delete()
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'crm-mover-etapa') {
    // Restaurar la etapa previa (payload.etapa_anterior, guardada al mover).
    const payload = accion.payload as { etapa_anterior?: string } | null
    if (!payload?.etapa_anterior) {
      return NextResponse.json({ error: 'No se guardó la etapa previa' }, { status: 400 })
    }
    const { error } = await admin
      .from('prospectos')
      .update({ etapa: payload.etapa_anterior })
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (accion.herramienta === 'crm-resolver-aprobacion') {
    // Resolver una aprobación tiene efectos compuestos (crea prospecto / mueve
    // etapa / registra interacción) que no se revierten en bloque de forma segura.
    return NextResponse.json(
      {
        error:
          'Resolver una aprobación no es reversible automáticamente: deshaz el efecto a mano (borra/edita lo creado) y vuelve a dejar la propuesta en pendiente.',
      },
      { status: 400 },
    )
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
