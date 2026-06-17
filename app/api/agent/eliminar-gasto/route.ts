import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/eliminar-gasto (JSON: { gasto_id, origen, motivo })
// Elimina un gasto ya cargado (de proyecto o mensual). Pensado para resolver
// duplicados creados por humanos o en sesiones anteriores, que hilvan_deshacer
// no puede revertir (porque no fueron acciones del agente).
//
//   - motivo es OBLIGATORIO y queda en el log de auditoría.
//   - Antes de borrar, se LEE la fila completa y se guarda en el payload, para
//     que hilvan_deshacer pueda re-insertarla (borrado reversible).
//   - El agente DEBE confirmar con el usuario antes de llamar.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { gasto_id, origen, motivo } = body ?? {}

  if (!gasto_id || typeof gasto_id !== 'string') {
    return NextResponse.json({ error: 'Falta gasto_id' }, { status: 400 })
  }
  if (origen !== 'proyecto' && origen !== 'mensual') {
    return NextResponse.json({ error: "origen debe ser 'proyecto' o 'mensual'" }, { status: 400 })
  }
  if (!motivo || typeof motivo !== 'string' || !motivo.trim()) {
    return NextResponse.json({ error: 'motivo es obligatorio' }, { status: 400 })
  }

  const tabla = origen === 'mensual' ? 'rendicion_mensual_gastos' : 'rendicion_gastos'
  const admin = createAdminClient()

  // ── Leer la fila COMPLETA (para poder re-insertarla en deshacer) ────────────
  const { data: fila, error: eLeer } = await admin
    .from(tabla)
    .select('*')
    .eq('id', gasto_id)
    .maybeSingle()
  if (eLeer) return NextResponse.json({ error: eLeer.message }, { status: 500 })
  if (!fila) return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })

  // ── Borrar ──────────────────────────────────────────────────────────────────
  const { error: eDel } = await admin.from(tabla).delete().eq('id', gasto_id)
  if (eDel) {
    await registrarAccion({
      herramienta: 'eliminar-gasto',
      payload: { gasto_id, origen, motivo, error: eDel.message },
      ok: false,
      error: eDel.message,
    })
    return NextResponse.json({ error: eDel.message }, { status: 500 })
  }

  // ── Log reversible (guarda la fila completa para re-insertar) ────────────────
  await registrarAccion({
    herramienta: 'eliminar-gasto',
    payload: { gasto_id, origen, motivo, fila },
    resultado_tabla: tabla,
    resultado_id: gasto_id,
    ok: true,
  })

  return NextResponse.json({
    ok: true,
    gasto_id,
    origen,
    motivo,
    eliminado: {
      monto: (fila as any).monto ?? null,
      tipo_documento: (fila as any).tipo_documento ?? null,
      folio: (fila as any).folio ?? null,
      descripcion: (fila as any).descripcion ?? null,
    },
  })
}
