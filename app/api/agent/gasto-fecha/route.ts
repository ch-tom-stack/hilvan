import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/gasto-fecha (JSON)
// Edita la fecha_documento de un gasto ya cargado (proyecto o mensual).
// Reversible con /api/agent/deshacer: restaura la fecha anterior, NO borra la fila.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { gasto_id, origen, fecha_documento } = body ?? {}

  // ── Validaciones ──────────────────────────────────────────────────────────
  if (!gasto_id || typeof gasto_id !== 'string') {
    return NextResponse.json({ error: 'Falta gasto_id' }, { status: 400 })
  }
  if (origen !== 'proyecto' && origen !== 'mensual') {
    return NextResponse.json(
      { error: "origen debe ser 'proyecto' o 'mensual'" },
      { status: 400 },
    )
  }
  if (
    !fecha_documento ||
    typeof fecha_documento !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha_documento)
  ) {
    return NextResponse.json(
      { error: 'fecha_documento inválida (formato YYYY-MM-DD)' },
      { status: 400 },
    )
  }

  const tabla =
    origen === 'mensual' ? 'rendicion_mensual_gastos' : 'rendicion_gastos'

  const admin = createAdminClient()

  // ── Leer valor actual (para poder deshacer) ───────────────────────────────
  const { data: fila, error: eLeer } = await admin
    .from(tabla)
    .select('id, fecha_documento')
    .eq('id', gasto_id)
    .maybeSingle()

  if (eLeer) return NextResponse.json({ error: eLeer.message }, { status: 500 })
  if (!fila) return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })

  const fecha_anterior: string | null = fila.fecha_documento ?? null

  // ── UPDATE ────────────────────────────────────────────────────────────────
  const { error: eUpdate } = await admin
    .from(tabla)
    .update({ fecha_documento })
    .eq('id', gasto_id)

  if (eUpdate) {
    await registrarAccion({
      herramienta: 'gasto-fecha',
      payload: body,
      ok: false,
      error: eUpdate.message,
    })
    return NextResponse.json({ error: eUpdate.message }, { status: 500 })
  }

  // ── Auditoría ─────────────────────────────────────────────────────────────
  await registrarAccion({
    herramienta: 'gasto-fecha',
    payload: { gasto_id, origen, fecha_documento, fecha_anterior },
    resultado_tabla: tabla,
    resultado_id: gasto_id,
    ok: true,
  })

  return NextResponse.json({ ok: true, gasto_id, fecha_documento, fecha_anterior })
}
