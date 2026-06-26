import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// Campos editables a nivel cotización (columna → tipo).
const TEXTO = ['nombre', 'descripcion', 'cliente_nombre_libre', 'cliente_email_libre',
  'notas_cliente', 'notas_internas', 'solicita', 'cliente_final', 'medios', 'referencia',
  'cliente_id', 'proyecto_id']
const ENUMS: Record<string, string[]> = {
  descuento_global_tipo: ['porcentaje', 'monto'],
  formato_pdf: ['simple', 'detallado'],
}

// POST /api/agent/cotizacion-editar (JSON)
// Edita campos a nivel cotización (título, descripción, cliente, IVA, descuento,
// notas, formato, y los del Encargo: solicita, cliente_final, medios, referencia).
//   { cotizacion_id, nombre?, descripcion?, cliente_id?, cliente_nombre_libre?,
//     cliente_email_libre?, con_iva?, descuento_global?, descuento_global_tipo?,
//     notas_cliente?, notas_internas?, formato_pdf?, proyecto_id?, solicita?,
//     cliente_final?, medios?, referencia? }
// (alias: agencia_cliente → cliente_nombre_libre)
// Debe venir al menos un campo. Reversible con /api/agent/deshacer (restaura previos).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { cotizacion_id } = body ?? {}
  if (!cotizacion_id || typeof cotizacion_id !== 'string') {
    return NextResponse.json({ error: 'Falta cotizacion_id' }, { status: 400 })
  }

  // alias amistoso
  if (body.agencia_cliente !== undefined && body.cliente_nombre_libre === undefined) {
    body.cliente_nombre_libre = body.agencia_cliente
  }

  const cambios: Record<string, unknown> = {}

  for (const campo of TEXTO) {
    if (body[campo] !== undefined) {
      const v = body[campo]
      if (v !== null && typeof v !== 'string') {
        return NextResponse.json({ error: `${campo} debe ser texto o null` }, { status: 400 })
      }
      cambios[campo] = v ? String(v).trim() || null : null
    }
  }
  for (const campo of Object.keys(ENUMS)) {
    if (body[campo] !== undefined) {
      if (!ENUMS[campo].includes(body[campo])) {
        return NextResponse.json({ error: `${campo} inválido (uno de: ${ENUMS[campo].join(', ')})` }, { status: 400 })
      }
      cambios[campo] = body[campo]
    }
  }
  if (body.con_iva !== undefined) {
    if (typeof body.con_iva !== 'boolean') return NextResponse.json({ error: 'con_iva debe ser boolean' }, { status: 400 })
    cambios.con_iva = body.con_iva
  }
  if (body.descuento_global !== undefined) {
    const n = typeof body.descuento_global === 'number' ? body.descuento_global : parseFloat(String(body.descuento_global))
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'descuento_global debe ser un número ≥ 0' }, { status: 400 })
    cambios.descuento_global = n
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'Debe venir al menos un campo a editar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: previoRow, error: eLeer } = await admin
    .from('cotizaciones')
    .select(['id', ...Object.keys(cambios)].join(', '))
    .eq('id', cotizacion_id)
    .maybeSingle()
  if (eLeer) return NextResponse.json({ error: eLeer.message }, { status: 500 })
  if (!previoRow) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })

  const filaAny = previoRow as unknown as Record<string, unknown>
  const previo: Record<string, unknown> = {}
  for (const k of Object.keys(cambios)) previo[k] = filaAny[k] ?? null

  const { error: eUpd } = await admin.from('cotizaciones').update(cambios).eq('id', cotizacion_id)
  if (eUpd) {
    await registrarAccion({ herramienta: 'cotizacion-editar', payload: body, ok: false, error: eUpd.message })
    return NextResponse.json({ error: eUpd.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'cotizacion-editar',
    payload: { cotizacion_id, previo, cambios },
    resultado_tabla: 'cotizaciones',
    resultado_id: cotizacion_id,
    ok: true,
  })

  return NextResponse.json({ ok: true, cotizacion_id, cambios, previo })
}
