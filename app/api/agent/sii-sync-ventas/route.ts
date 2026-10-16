import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizarRut, ventaDesdeDocumento, type FilaVenta, type SiiDocumento } from '@/lib/agent-sii'
import { periodoAAAAMM, verificarImportaciones, type ImportacionSii } from '@/lib/sii-cli'
import { calcularTotalCot } from '@/app/actions/financiero-helpers'

export const runtime = 'nodejs'

// POST /api/agent/sii-sync-ventas (JSON)  { periodo: "202606", incluir_crudo?: boolean }
//
// SOLO LECTURA. Entrega las FACTURAS EMITIDAS por Casa Hiedra (RCV ventas) de un
// período y SUGIERE a qué cotización corresponde cada una (RUT receptor + monto
// + fecha). NO escribe en cotizaciones ni ingresos: el registro lo hace después
// hilvan_registrar_factura_emitida tras confirmar.
//
// Desde oct-2026 NO consulta al SII: lee sii_documentos (fuente rcv_venta), que
// llena /api/agent/sii-importar con lo que trae la CLI `sii` desde el Mac. Si el
// período no se importó completo, responde ERROR (409). En ventas
// rut_emisor/razon_social_emisor = RECEPTOR = cliente.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const periodo = periodoAAAAMM(body?.periodo)
  if (!periodo) {
    return NextResponse.json({ error: 'periodo inválido (formato AAAAMM, ej. 202606)' }, { status: 400 })
  }
  const incluirCrudo = body?.incluir_crudo === true

  const admin = createAdminClient()

  // ── 1) ¿Está importado y completo? ─────────────────────────────────────────
  const { data: imps, error: errImp } = await admin
    .from('sii_importaciones')
    .select('periodo, lado, estado, documentos, errores, importado_at')
    .eq('periodo', periodo)
    .eq('lado', 'ventas')
  if (errImp) {
    return NextResponse.json({ error: `No se pudo leer el estado de importación: ${errImp.message}` }, { status: 500 })
  }
  const importaciones = (imps ?? []) as ImportacionSii[]
  const verif = verificarImportaciones(periodo, ['ventas'], importaciones)
  if (!verif.ok) return NextResponse.json(verif, { status: 409 })

  // ── 2) Documentos emitidos del período ────────────────────────────────────
  const { data: docs, error: errDocs } = await admin
    .from('sii_documentos')
    .select('periodo, fuente, dte, tipo_documento, rut_emisor, razon_social_emisor, folio, fecha_documento, neto, iva, total, monto, anulada, doc_ref_folio, doc_ref_tipo, raw')
    .eq('periodo', periodo)
    .eq('fuente', 'rcv_venta')
    .eq('anulada', false)
    .order('fecha_documento', { ascending: true })
  if (errDocs) {
    return NextResponse.json({ error: `No se pudieron leer los documentos del SII: ${errDocs.message}` }, { status: 500 })
  }
  const ventas = ((docs ?? []) as SiiDocumento[]).map(ventaDesdeDocumento)

  const notasCredito = ventas.filter((v) => v.tipo_documento === 'nota_credito')
  const facturas = ventas.filter((v) => v.tipo_documento !== 'nota_credito')

  // ── 3) Auto-match a cotizaciones (RUT receptor + monto + fecha) ────────────
  const { data: cots, error: errCots } = await admin
    .from('cotizaciones')
    .select(`
      id, numero_factura, fecha_factura_emitida, estado, con_iva,
      descuento_global, descuento_global_tipo, fecha_respuesta_cliente, created_at,
      grupo:cotizacion_grupos(numero_base),
      cliente:clientes!cliente_id(nombre, rut),
      departamentos:cotizacion_departamentos(
        subgrupos:cotizacion_subgrupos(items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo, subgrupo_id)),
        items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo, subgrupo_id)
      )
    `)
  if (errCots) {
    return NextResponse.json({ error: `No se pudieron leer las cotizaciones para sugerir el match: ${errCots.message}` }, { status: 500 })
  }

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
    importado: importaciones[0]?.importado_at ?? null,
    nota: 'Solo lectura, desde la última importación del SII (`importado`: si fue antes de que cerrara el mes, pueden faltar documentos posteriores; se refresca con hilvan_sii_solicitar_importacion). Para registrar: hilvan_registrar_factura_emitida(cotizacion_id, fecha_factura_emitida, numero_factura=folio) sólo en matches de confianza alta ya confirmados. Las NOTAS DE CRÉDITO emitidas (dte 61) reducen una venta previa (referencia_folio) — manéjalas aparte. El cobro sigue por su carril (movimientos/conciliar o registrar_pago).',
  })
}
