import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// tipo_documento permitidos (alineado con TipoDocRendicion en types/index.ts y
// el CHECK constraint de sql/notas_credito.sql).
const TIPOS_DOC_VALIDOS = [
  'boleta',
  'boleta_consumo',
  'factura',
  'exenta',
  'sin_documento',
  'nota_credito',
]

// POST /api/agent/editar-gasto (JSON)
// Corrige metadata (tipo_documento y/o folio) de un gasto ya cargado, de proyecto
// o mensual. NO recalcula el monto (solo metadata). Al menos uno de
// tipo_documento/folio debe venir.
// Reversible con /api/agent/deshacer: restaura los valores previos, NO borra la fila.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { gasto_id, origen, tipo_documento, folio } = body ?? {}

  // ── Validaciones ──────────────────────────────────────────────────────────
  if (!gasto_id || typeof gasto_id !== 'string') {
    return NextResponse.json({ error: 'Falta gasto_id' }, { status: 400 })
  }
  if (origen !== 'proyecto' && origen !== 'mensual') {
    return NextResponse.json({ error: "origen debe ser 'proyecto' o 'mensual'" }, { status: 400 })
  }

  const tieneTipo = tipo_documento !== undefined
  const tieneFolio = folio !== undefined
  if (!tieneTipo && !tieneFolio) {
    return NextResponse.json(
      { error: 'Debe venir al menos uno de tipo_documento o folio' },
      { status: 400 },
    )
  }
  if (tieneTipo) {
    if (typeof tipo_documento !== 'string' || !TIPOS_DOC_VALIDOS.includes(tipo_documento)) {
      return NextResponse.json(
        { error: `tipo_documento inválido (uno de: ${TIPOS_DOC_VALIDOS.join(', ')})` },
        { status: 400 },
      )
    }
  }
  if (tieneFolio && folio !== null && typeof folio !== 'string') {
    return NextResponse.json({ error: 'folio inválido (string o null)' }, { status: 400 })
  }

  const tabla = origen === 'mensual' ? 'rendicion_mensual_gastos' : 'rendicion_gastos'

  const admin = createAdminClient()

  // ── Leer valores actuales (para poder deshacer) ───────────────────────────
  const { data: fila, error: eLeer } = await admin
    .from(tabla)
    .select('id, tipo_documento, folio')
    .eq('id', gasto_id)
    .maybeSingle()

  if (eLeer) return NextResponse.json({ error: eLeer.message }, { status: 500 })
  if (!fila) return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })

  const previo = {
    tipo_documento: fila.tipo_documento ?? null,
    folio: fila.folio ?? null,
  }

  // ── Armar UPDATE solo con los campos provistos ────────────────────────────
  const cambios: Record<string, string | null> = {}
  if (tieneTipo) cambios.tipo_documento = tipo_documento
  if (tieneFolio) cambios.folio = folio || null

  const { error: eUpdate } = await admin.from(tabla).update(cambios).eq('id', gasto_id)

  if (eUpdate) {
    await registrarAccion({
      herramienta: 'editar-gasto',
      payload: body,
      ok: false,
      error: eUpdate.message,
    })
    return NextResponse.json({ error: eUpdate.message }, { status: 500 })
  }

  // ── Auditoría ─────────────────────────────────────────────────────────────
  await registrarAccion({
    herramienta: 'editar-gasto',
    payload: { gasto_id, origen, previo, cambios },
    resultado_tabla: tabla,
    resultado_id: gasto_id,
    ok: true,
  })

  return NextResponse.json({ ok: true, gasto_id, origen, previo, cambios })
}
