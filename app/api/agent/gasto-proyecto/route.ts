import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularRetencion, tasaRetencionBoleta } from '@/lib/rendiciones-calc'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

const TIPO_LABEL: Record<string, string> = {
  honorarios: 'Honorarios', transporte: 'Transporte', alimentacion: 'Alimentación',
  arte: 'Arte / Props', insumos: 'Insumos', servicios: 'Servicios', viaticos: 'Viáticos', otro: 'Gasto',
}

// POST /api/agent/gasto-proyecto (JSON)
// Crea un gasto de proyecto en rendicion_gastos. Acepta `rendicion_id` o
// `cotizacion_item_id` (en cuyo caso resuelve/crea la rendición de su cotización).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const {
    rendicion_id,
    cotizacion_item_id,
    tipo,
    descripcion,
    tipo_documento,
    monto: montoRaw,
    monto_es,
    rut_emisor,
    razon_social_emisor,
    factura_casa_hiedra,
    archivo_url,
  } = body ?? {}

  // ── Validaciones ──────────────────────────────────────────────────────────
  if (!tipo || typeof tipo !== 'string') {
    return NextResponse.json({ error: 'Falta tipo' }, { status: 400 })
  }
  if (!tipo_documento || typeof tipo_documento !== 'string') {
    return NextResponse.json({ error: 'Falta tipo_documento' }, { status: 400 })
  }
  if (monto_es !== 'neto' && monto_es !== 'bruto') {
    return NextResponse.json({ error: "monto_es debe ser 'neto' o 'bruto'" }, { status: 400 })
  }
  const monto = parseFloat(montoRaw)
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: 'monto inválido' }, { status: 400 })
  }
  if (!rendicion_id && !cotizacion_item_id) {
    return NextResponse.json({ error: 'Falta rendicion_id o cotizacion_item_id' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Resolver rendición ────────────────────────────────────────────────────
  let rendicionId: string = rendicion_id
  if (!rendicionId) {
    // Buscar la cotización del ítem, luego obtener/crear su rendición.
    const { data: item, error: eItem } = await admin
      .from('cotizacion_items')
      .select('cotizacion_id')
      .eq('id', cotizacion_item_id)
      .maybeSingle()
    if (eItem) return NextResponse.json({ error: eItem.message }, { status: 500 })
    if (!item?.cotizacion_id) {
      return NextResponse.json({ error: 'cotizacion_item_id no encontrado' }, { status: 400 })
    }

    const { data: rend } = await admin
      .from('rendiciones')
      .select('id')
      .eq('cotizacion_id', item.cotizacion_id)
      .maybeSingle()
    if (rend) {
      rendicionId = rend.id
    } else {
      const { data: creada, error: eCrear } = await admin
        .from('rendiciones')
        .insert({ cotizacion_id: item.cotizacion_id })
        .select('id')
        .single()
      if (eCrear) return NextResponse.json({ error: eCrear.message }, { status: 500 })
      rendicionId = creada.id
    }
  }

  // ── Bruto: persistimos SIEMPRE el bruto (tasa por año, Ley 21.133) ────────
  const tasa = tasaRetencionBoleta()
  const montoBruto =
    tipo_documento === 'boleta' && monto_es === 'neto'
      ? Math.round(monto / (1 - tasa))
      : Math.round(monto)

  const { retencion, neto } = calcularRetencion({ monto: montoBruto, tipo_documento })

  const descripcionFinal =
    (typeof descripcion === 'string' && descripcion.trim()) || TIPO_LABEL[tipo] || 'Gasto'

  // ── Insertar gasto (estado 'enviada', flujo igual que UI) ─────────────────
  const insert = {
    rendicion_id: rendicionId,
    cotizacion_item_id: cotizacion_item_id || null,
    tipo,
    descripcion: descripcionFinal,
    tipo_documento,
    monto: montoBruto,
    estado: 'enviada',
    rut_emisor: rut_emisor || null,
    razon_social_emisor: razon_social_emisor || null,
    factura_casa_hiedra: factura_casa_hiedra ?? false,
    foto_url: archivo_url || null,
  }

  const { data, error } = await admin
    .from('rendicion_gastos')
    .insert(insert)
    .select('id')
    .single()

  if (error) {
    await registrarAccion({
      herramienta: 'gasto-proyecto',
      payload: body,
      ok: false,
      error: error.message,
      archivo_url: archivo_url || null,
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'gasto-proyecto',
    payload: body,
    resultado_tabla: 'rendicion_gastos',
    resultado_id: data.id,
    archivo_url: archivo_url || null,
    ok: true,
  })

  return NextResponse.json({ id: data.id, rendicion_id: rendicionId, monto_bruto: montoBruto, retencion, neto })
}
