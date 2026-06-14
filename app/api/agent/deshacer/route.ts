import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// Tablas cuyo gasto se revierte borrando la fila creada (aplica SOLO para inserts,
// no para ediciones como 'gasto-fecha' que usa UPDATE).
const TABLAS_DELETE = ['rendicion_mensual_gastos', 'rendicion_gastos']

// POST /api/agent/deshacer (JSON: { accion_id })
// Revierte la escritura asociada a una acción registrada.
// IMPORTANTE: ramifica por `herramienta` ANTES que por tabla para evitar que
// una edición de fecha (gasto-fecha) sea revertida con DELETE en vez de UPDATE.
//  - 'gasto-fecha': UPDATE fecha_documento al valor anterior (payload.fecha_anterior).
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
  if (!accion.ok || !accion.resultado_tabla || !accion.resultado_id) {
    return NextResponse.json({ error: 'La acción no tiene una escritura reversible' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (accion.herramienta === 'gasto-fecha') {
    // Edición de fecha: restaurar el valor anterior. Nunca borrar la fila.
    const payload = accion.payload as { fecha_anterior?: string | null } | null
    const fecha_anterior = payload?.fecha_anterior ?? null
    const { error } = await admin
      .from(accion.resultado_tabla)
      .update({ fecha_documento: fecha_anterior })
      .eq('id', accion.resultado_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
