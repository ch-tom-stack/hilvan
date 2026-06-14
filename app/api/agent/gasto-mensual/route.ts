import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularRetencion, tasaRetencionBoleta } from '@/lib/rendiciones-calc'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/gasto-mensual (JSON)
// Crea un gasto operacional mensual. Acepta `periodo` (YYYY-MM) o
// `rendicion_mensual_id`. Para boletas con monto neto, calcula y persiste el bruto.
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
    periodo,
    rendicion_mensual_id,
    descripcion,
    categoria,
    tipo_documento,
    monto: montoRaw,
    monto_es,
    rut_emisor,
    razon_social_emisor,
    factura_casa_hiedra,
    archivo_url,
  } = body ?? {}

  // ── Validaciones ──────────────────────────────────────────────────────────
  if (!descripcion || typeof descripcion !== 'string' || !descripcion.trim()) {
    return NextResponse.json({ error: 'Falta descripcion' }, { status: 400 })
  }
  if (!categoria || typeof categoria !== 'string') {
    return NextResponse.json({ error: 'Falta categoria' }, { status: 400 })
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
  if (!periodo && !rendicion_mensual_id) {
    return NextResponse.json({ error: 'Falta periodo o rendicion_mensual_id' }, { status: 400 })
  }
  if (periodo && !/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json({ error: 'periodo inválido (formato YYYY-MM)' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Resolver rendición mensual (obtener o crear) ──────────────────────────
  let rendicionId: string = rendicion_mensual_id
  if (!rendicionId) {
    const periodoDate = `${periodo}-01`
    const { data: existente } = await admin
      .from('rendiciones_mensuales')
      .select('id')
      .eq('periodo', periodoDate)
      .maybeSingle()
    if (existente) {
      rendicionId = existente.id
    } else {
      const { data: creada, error: eCrear } = await admin
        .from('rendiciones_mensuales')
        .insert({ periodo: periodoDate })
        .select('id')
        .single()
      if (eCrear) return NextResponse.json({ error: eCrear.message }, { status: 500 })
      rendicionId = creada.id
    }
  }

  // ── Calcular bruto: persistimos SIEMPRE el bruto ──────────────────────────
  // La tasa de retención depende del año del período (Ley 21.133).
  const year = periodo ? Number(periodo.slice(0, 4)) : new Date().getFullYear()
  const tasa = tasaRetencionBoleta(year)
  const montoBruto =
    tipo_documento === 'boleta' && monto_es === 'neto'
      ? Math.round(monto / (1 - tasa))
      : Math.round(monto)

  const { retencion, neto } = calcularRetencion({ monto: montoBruto, tipo_documento, year })

  // ── Insertar gasto ────────────────────────────────────────────────────────
  const insert = {
    rendicion_mensual_id: rendicionId,
    descripcion: descripcion.trim(),
    categoria,
    tipo_documento,
    monto: montoBruto,
    cargado_por: 'Agente IA',
    rut_emisor: rut_emisor || null,
    razon_social_emisor: razon_social_emisor || null,
    factura_casa_hiedra: factura_casa_hiedra ?? false,
    archivo_url: archivo_url || null,
  }

  const { data, error } = await admin
    .from('rendicion_mensual_gastos')
    .insert(insert)
    .select('id')
    .single()

  if (error) {
    await registrarAccion({
      herramienta: 'gasto-mensual',
      payload: body,
      ok: false,
      error: error.message,
      archivo_url: archivo_url || null,
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'gasto-mensual',
    payload: body,
    resultado_tabla: 'rendicion_mensual_gastos',
    resultado_id: data.id,
    archivo_url: archivo_url || null,
    ok: true,
  })

  return NextResponse.json({ id: data.id, monto_bruto: montoBruto, retencion, neto })
}
