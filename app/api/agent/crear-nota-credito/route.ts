import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/crear-nota-credito (JSON)
// Registra una NOTA DE CRÉDITO (NC, Tipo Doc 61 del SII): un documento que RESTA
// una factura previa. Se persiste como un gasto con tipo_documento='nota_credito'
// y monto NEGATIVO (= -abs(monto)), para que los totales resten. NO aplica
// retención (no es boleta de honorarios).
//
// Reversible con /api/agent/deshacer: como registramos resultado_tabla/_id de la
// fila creada, el deshacer existente la borra (rama TABLAS_DELETE). No hace falta
// una rama nueva en deshacer.
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
    origen,
    monto: montoRaw,
    folio,
    fecha_documento,
    rut_emisor,
    razon_social_emisor,
    descripcion,
    referencia_folio,
    // mensual:
    periodo,
    categoria,
    // proyecto:
    cotizacion_item_id,
  } = body ?? {}

  // ── Validaciones comunes ──────────────────────────────────────────────────
  if (origen !== 'mensual' && origen !== 'proyecto') {
    return NextResponse.json({ error: "origen debe ser 'mensual' o 'proyecto'" }, { status: 400 })
  }
  if (!descripcion || typeof descripcion !== 'string' || !descripcion.trim()) {
    return NextResponse.json({ error: 'Falta descripcion' }, { status: 400 })
  }
  // El monto se recibe como valor ABSOLUTO de la NC (>0); se persiste negativo.
  const montoAbs = parseFloat(montoRaw)
  if (!Number.isFinite(montoAbs) || montoAbs <= 0) {
    return NextResponse.json({ error: 'monto inválido (debe ser el valor absoluto de la NC, > 0)' }, { status: 400 })
  }
  if (
    fecha_documento != null &&
    (typeof fecha_documento !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_documento))
  ) {
    return NextResponse.json({ error: 'fecha_documento inválida (formato YYYY-MM-DD)' }, { status: 400 })
  }

  // ── Validaciones por origen ───────────────────────────────────────────────
  if (origen === 'mensual') {
    if (!periodo || typeof periodo !== 'string' || !/^\d{4}-\d{2}$/.test(periodo)) {
      return NextResponse.json({ error: 'periodo inválido (formato YYYY-MM, requerido si origen=mensual)' }, { status: 400 })
    }
    if (!categoria || typeof categoria !== 'string') {
      return NextResponse.json({ error: 'Falta categoria (requerida si origen=mensual)' }, { status: 400 })
    }
  } else {
    if (!cotizacion_item_id || typeof cotizacion_item_id !== 'string') {
      return NextResponse.json({ error: 'Falta cotizacion_item_id (requerido si origen=proyecto)' }, { status: 400 })
    }
  }

  const admin = createAdminClient()

  // ── Descripción con trazabilidad de la factura referenciada ───────────────
  let descripcionFinal = descripcion.trim()
  if (referencia_folio != null && String(referencia_folio).trim()) {
    descripcionFinal += ` (NC ref factura ${String(referencia_folio).trim()})`
  }

  // Monto negativo: la NC resta de los totales.
  const monto = -Math.abs(Math.round(montoAbs))

  if (origen === 'mensual') {
    // ── Resolver rendición mensual (obtener o crear) ────────────────────────
    const periodoDate = `${periodo}-01`
    let rendicionId: string
    const { data: existente, error: eExiste } = await admin
      .from('rendiciones_mensuales')
      .select('id')
      .eq('periodo', periodoDate)
      .maybeSingle()
    if (eExiste) return NextResponse.json({ error: eExiste.message }, { status: 500 })
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

    const insert = {
      rendicion_mensual_id: rendicionId,
      descripcion: descripcionFinal,
      categoria,
      tipo_documento: 'nota_credito',
      monto,
      cargado_por: 'Agente IA',
      rut_emisor: rut_emisor || null,
      razon_social_emisor: razon_social_emisor || null,
      factura_casa_hiedra: false,
      fecha_documento: fecha_documento || null,
      folio: folio || null,
    }

    const { data, error } = await admin
      .from('rendicion_mensual_gastos')
      .insert(insert)
      .select('id')
      .single()

    if (error) {
      await registrarAccion({ herramienta: 'crear-nota-credito', payload: body, ok: false, error: error.message })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await registrarAccion({
      herramienta: 'crear-nota-credito',
      payload: body,
      resultado_tabla: 'rendicion_mensual_gastos',
      resultado_id: data.id,
      ok: true,
    })

    return NextResponse.json({ id: data.id, origen, monto })
  }

  // ── origen === 'proyecto' ─────────────────────────────────────────────────
  // Verificar el ítem y resolver/crear la rendición de su cotización.
  const { data: item, error: eItem } = await admin
    .from('cotizacion_items')
    .select('cotizacion_id')
    .eq('id', cotizacion_item_id)
    .maybeSingle()
  if (eItem) return NextResponse.json({ error: eItem.message }, { status: 500 })
  if (!item?.cotizacion_id) {
    return NextResponse.json({ error: 'cotizacion_item_id no encontrado' }, { status: 400 })
  }

  let rendicionId: string
  const { data: rend, error: eRend } = await admin
    .from('rendiciones')
    .select('id')
    .eq('cotizacion_id', item.cotizacion_id)
    .maybeSingle()
  if (eRend) return NextResponse.json({ error: eRend.message }, { status: 500 })
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

  const insert = {
    rendicion_id: rendicionId,
    cotizacion_item_id,
    tipo: 'otro',
    descripcion: descripcionFinal,
    tipo_documento: 'nota_credito',
    monto,
    estado: 'enviada',
    rut_emisor: rut_emisor || null,
    razon_social_emisor: razon_social_emisor || null,
    factura_casa_hiedra: false,
    fecha_documento: fecha_documento || null,
    folio: folio || null,
  }

  const { data, error } = await admin
    .from('rendicion_gastos')
    .insert(insert)
    .select('id')
    .single()

  if (error) {
    await registrarAccion({ herramienta: 'crear-nota-credito', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'crear-nota-credito',
    payload: body,
    resultado_tabla: 'rendicion_gastos',
    resultado_id: data.id,
    ok: true,
  })

  return NextResponse.json({ id: data.id, origen, monto })
}
