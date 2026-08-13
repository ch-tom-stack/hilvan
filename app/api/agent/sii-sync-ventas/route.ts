import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizarVenta, normalizarRut, numCL, type FilaVenta } from '@/lib/agent-sii'
import { calcularTotalCot } from '@/app/actions/financiero-helpers'

export const runtime = 'nodejs'

// POST /api/agent/sii-sync-ventas (JSON)  { periodo: "202606", incluir_crudo?: boolean }
//
// SOLO LECTURA. Trae del SII (vía API Gateway) las FACTURAS EMITIDAS por Casa
// Hiedra (RCV ventas) de un período, las normaliza, las guarda en sii_documentos
// (respaldo fiel para el contador) y SUGIERE a qué cotización corresponde cada
// una (RUT receptor + monto + fecha). NO escribe en cotizaciones ni ingresos:
// el registro lo hace después hilvan_registrar_factura_emitida tras confirmar.
//
// Contrato del gateway (verificado): resumen /sii/rcv/ventas/resumen/{rut}/{periodo}
// da los DTE del período; detalle /sii/rcv/ventas/detalle/{rut}/{periodo}/{dte}?tipo=rcv_csv
// (dte puntual, sin /REGISTRO). En ventas rut/razon_social = RECEPTOR = cliente.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const periodo = String(body?.periodo ?? '').trim().replace('-', '')
  if (!/^\d{6}$/.test(periodo)) {
    return NextResponse.json({ error: 'periodo inválido (formato AAAAMM, ej. 202606)' }, { status: 400 })
  }
  const incluirCrudo = body?.incluir_crudo === true

  const token = process.env.APIGATEWAY_API_TOKEN
  const rut = process.env.SII_RUT
  const clave = process.env.SII_CLAVE
  if (!token || !rut || !clave) {
    return NextResponse.json({ error: 'Faltan credenciales en el servidor (APIGATEWAY_API_TOKEN, SII_RUT, SII_CLAVE)' }, { status: 503 })
  }
  const baseUrl = (process.env.APIGATEWAY_API_URL || 'https://app.apigateway.cl/api/v2').replace(/\/$/, '')
  const auth = JSON.stringify({ auth: { pass: { rut, clave } } })
  const headers = { 'Content-Type': 'application/json', Authorization: `Token ${token}` }

  async function ag(path: string): Promise<{ ok: boolean; status: number; json: any }> {
    try {
      const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: auth })
      const text = await res.text()
      let json: any = null
      try { json = text ? JSON.parse(text) : null } catch { json = { raw: text.slice(0, 300) } }
      return { ok: res.ok, status: res.status, json }
    } catch (e: any) {
      return { ok: false, status: 0, json: { error: e?.message ?? 'fetch falló' } }
    }
  }

  const errores: string[] = []

  // ── 1) Resumen: qué DTE tiene el período (con detalle disponible) ──────────
  const resumen = await ag(`/sii/rcv/ventas/resumen/${rut}/${periodo}`)
  if (!resumen.ok) {
    return NextResponse.json({ error: `RCV ventas resumen: HTTP ${resumen.status}`, detalle: JSON.stringify(resumen.json)?.slice(0, 200) }, { status: 502 })
  }
  const filasResumen: any[] = Array.isArray(resumen.json?.data?.data) ? resumen.json.data.data : []
  const dtes = [...new Set(
    filasResumen
      .filter((f) => f?.rsmnLink === true && Number(f?.rsmnTipoDocInteger) > 0 && f?.dcvTipoIngresoDoc !== 'RESUMEN')
      .map((f) => Number(f.rsmnTipoDocInteger)),
  )]

  // ── 2) Detalle por DTE ─────────────────────────────────────────────────────
  const ventas: FilaVenta[] = []
  for (const dte of dtes) {
    const r = await ag(`/sii/rcv/ventas/detalle/${rut}/${periodo}/${dte}?tipo=rcv_csv`)
    if (!r.ok) { errores.push(`Ventas detalle dte ${dte}: HTTP ${r.status}`); continue }
    const arr: any[] = Array.isArray(r.json?.data) ? r.json.data : []
    ventas.push(...arr.map(normalizarVenta))
  }

  const notasCredito = ventas.filter((v) => v.tipo_documento === 'nota_credito')
  const facturas = ventas.filter((v) => v.tipo_documento !== 'nota_credito')

  const admin = createAdminClient()

  // ── 3) Respaldo fiel en sii_documentos (receptor en rut_emisor) ────────────
  const ahora = new Date().toISOString()
  const filaARow = (v: FilaVenta) => ({
    periodo,
    fuente: v.fuente,
    dte: v.tipo_dte,
    tipo_documento: v.tipo_documento,
    rut_emisor: v.receptor_rut, // en ventas guardamos el RECEPTOR (contraparte)
    razon_social_emisor: v.receptor_razon_social,
    folio: v.folio,
    fecha_documento: v.fecha_emision,
    neto: v.monto_neto || null,
    iva: v.iva || null,
    total: v.monto_total || null,
    monto: v.monto_total,
    codigo: null,
    anulada: false,
    doc_ref_folio: v.referencia_folio ?? null,
    doc_ref_tipo: v.referencia_tipo ?? null,
    raw: v.crudo,
    sincronizado_at: ahora,
  })
  let registro: { guardados: number; error?: string }
  try {
    const rows = ventas.map(filaARow).filter((r) => r.rut_emisor && r.folio)
    if (!rows.length) registro = { guardados: 0 }
    else {
      const { error } = await admin.from('sii_documentos').upsert(rows, { onConflict: 'fuente,rut_emisor,folio,dte' })
      registro = error ? { guardados: 0, error: error.message } : { guardados: rows.length }
    }
  } catch (e: any) {
    registro = { guardados: 0, error: e?.message ?? 'fallo al guardar el registro' }
  }

  // ── 4) Auto-match a cotizaciones (RUT receptor + monto + fecha) ────────────
  const { data: cots } = await admin
    .from('cotizaciones')
    .select(`
      id, numero_factura, fecha_factura_emitida, estado, con_iva,
      descuento_global, descuento_global_tipo, fecha_respuesta_cliente, created_at,
      grupo:cotizacion_grupos(numero_base),
      cliente:clientes(nombre, rut),
      departamentos:cotizacion_departamentos(
        subgrupos:cotizacion_subgrupos(items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo, subgrupo_id)),
        items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo, subgrupo_id)
      )
    `)

  // Normaliza razón social para comparar (los clientes de Hilván a veces no tienen RUT).
  const normNombre = (s: unknown) =>
    String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\b(spa|s\.?a\.?|ltda\.?|limitada|eirl|e\.?i\.?r\.?l\.?|ltd)\b/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

  const cotIndex = (cots ?? []).map((c: any) => ({
    id: c.id as string,
    numero: c.grupo?.numero_base ?? null,
    rut: normalizarRut((c.cliente as any)?.rut),
    nombre: normNombre((c.cliente as any)?.nombre),
    total: calcularTotalCot(c),
    numero_factura: c.numero_factura as string | null,
  }))
  const foliosRegistrados = new Set(
    cotIndex.map((c) => (c.numero_factura ? String(c.numero_factura).trim() : null)).filter(Boolean) as string[],
  )

  function sugerir(v: FilaVenta): { cotizacion_sugerida: any; ya_registrada: boolean } {
    const ya = v.folio ? foliosRegistrados.has(v.folio) : false
    // Solo cotizaciones NO facturadas aún son candidatas a una factura nueva.
    const libres = cotIndex.filter((c) => !c.numero_factura)
    const rutV = normalizarRut(v.receptor_rut)
    const nomV = normNombre(v.receptor_razon_social)
    // Match fuerte por RUT; si el cliente no tiene RUT, fallback por nombre.
    let via: 'rut' | 'nombre' = 'rut'
    let candidatos = rutV ? libres.filter((c) => c.rut && c.rut === rutV) : []
    if (!candidatos.length && nomV) {
      via = 'nombre'
      candidatos = libres.filter((c) => c.nombre && (c.nombre === nomV || c.nombre.includes(nomV) || nomV.includes(c.nombre)))
    }
    if (!candidatos.length) return { cotizacion_sugerida: null, ya_registrada: ya }

    const best = candidatos.map((c) => ({ c, diff: Math.abs(c.total - v.monto_total) })).sort((a, b) => a.diff - b.diff)[0]
    const dentro = best.diff <= Math.max(1000, Math.round(v.monto_total * 0.01))
    const confianza = via === 'rut' ? (dentro ? 'alta' : 'media') : dentro ? 'media' : 'baja'
    return { cotizacion_sugerida: { id: best.c.id, numero: best.c.numero, confianza, via }, ya_registrada: ya }
  }

  const salida = (v: FilaVenta) => {
    const { cotizacion_sugerida, ya_registrada } = sugerir(v)
    const out: any = {
      folio: v.folio,
      tipo_dte: v.tipo_dte,
      tipo_documento: v.tipo_documento,
      fecha_emision: v.fecha_emision,
      receptor_rut: v.receptor_rut,
      receptor_razon_social: v.receptor_razon_social,
      monto_neto: v.monto_neto,
      iva: v.iva,
      monto_total: v.monto_total,
      cotizacion_sugerida,
      ya_registrada,
    }
    if (v.tipo_documento === 'nota_credito') { out.referencia_folio = v.referencia_folio ?? null; out.referencia_tipo = v.referencia_tipo ?? null }
    if (incluirCrudo) out.crudo = v.crudo
    return out
  }

  const facturasOut = facturas.map(salida)
  const notasCreditoOut = notasCredito.map(salida)

  return NextResponse.json({
    periodo,
    facturas: facturasOut,
    notas_credito: notasCreditoOut,
    resumen: {
      facturas: facturas.length,
      facturas_nuevas: facturasOut.filter((f) => !f.ya_registrada).length,
      notas_credito: notasCredito.length,
      ya_registradas: facturasOut.concat(notasCreditoOut).filter((f) => f.ya_registrada).length,
      total_emitido: ventas.reduce((s, v) => s + (v.tipo_documento === 'nota_credito' ? -v.monto_total : v.monto_total), 0),
    },
    registro,
    nota: 'Solo lectura. Cada factura queda en sii_documentos (respaldo del contador). Para registrar: hilvan_registrar_factura_emitida(cotizacion_id, fecha_factura_emitida, numero_factura=folio) sólo en matches de confianza alta ya confirmados. Las NOTAS DE CRÉDITO emitidas (dte 61) reducen una venta previa (referencia_folio) — manéjalas aparte. El cobro sigue por su carril (movimientos/conciliar o registrar_pago).',
    ...(errores.length ? { errores } : {}),
  })
}
