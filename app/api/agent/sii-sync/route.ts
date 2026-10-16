import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { claveDedup, filaDesdeDocumento, type FilaSugerida, type SiiDocumento } from '@/lib/agent-sii'
import { periodoAAAAMM, verificarImportaciones, type ImportacionSii, type LadoSii } from '@/lib/sii-cli'

export const runtime = 'nodejs'

// POST /api/agent/sii-sync (JSON)  { periodo: "202606", tipo?: "ambos"|"rcv"|"bhe", incluir_crudo?: boolean }
//
// SOLO LECTURA. Entrega las FACTURAS COMPRADAS/RECIBIDAS (RCV compras), las NOTAS
// DE CRÉDITO recibidas y las BOLETAS DE HONORARIOS RECIBIDAS de un período, en el
// shape de gasto, marcando cuáles YA están cargadas en Hilván (por rut+folio). NO
// escribe nada: la carga la hace después hilvan_crear_gastos_bulk, tras la
// clasificación humana (origen/categoría/cotizacion_item_id).
//
// Desde oct-2026 NO consulta al SII: lee sii_documentos, que llena
// /api/agent/sii-importar con lo que trae la CLI `sii` desde el Mac. Si el
// período no se importó completo, responde ERROR (409): "no se pudo consultar"
// nunca se ve como "no hubo documentos".
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const periodo = periodoAAAAMM(body?.periodo)
  if (!periodo) {
    return NextResponse.json({ error: 'periodo inválido (formato AAAAMM, ej. 202606)' }, { status: 400 })
  }
  const tipo = ['ambos', 'rcv', 'bhe'].includes(body?.tipo) ? body.tipo : 'ambos'
  const incluirCrudo = body?.incluir_crudo === true

  const lados: LadoSii[] = tipo === 'rcv' ? ['compras'] : tipo === 'bhe' ? ['bhe'] : ['compras', 'bhe']
  const fuentes = lados.map((l) => (l === 'compras' ? 'rcv_compra' : 'bhe_recibida'))

  const admin = createAdminClient()

  // ── ¿Está importado y completo? ───────────────────────────────────────────
  const { data: imps, error: errImp } = await admin
    .from('sii_importaciones')
    .select('periodo, lado, estado, documentos, errores, importado_at')
    .eq('periodo', periodo)
    .in('lado', lados)
  if (errImp) {
    return NextResponse.json({ error: `No se pudo leer el estado de importación: ${errImp.message}` }, { status: 500 })
  }
  const importaciones = (imps ?? []) as ImportacionSii[]
  const verif = verificarImportaciones(periodo, lados, importaciones)
  if (!verif.ok) return NextResponse.json(verif, { status: 409 })

  // ── Documentos del período ────────────────────────────────────────────────
  const { data: docs, error: errDocs } = await admin
    .from('sii_documentos')
    .select('periodo, fuente, dte, tipo_documento, rut_emisor, razon_social_emisor, folio, fecha_documento, neto, iva, total, monto, anulada, doc_ref_folio, doc_ref_tipo, raw')
    .eq('periodo', periodo)
    .in('fuente', fuentes)
    .eq('anulada', false)
    .order('fecha_documento', { ascending: true })
  if (errDocs) {
    return NextResponse.json({ error: `No se pudieron leer los documentos del SII: ${errDocs.message}` }, { status: 500 })
  }

  const filas = ((docs ?? []) as SiiDocumento[]).map(filaDesdeDocumento)
  // Una NC RESTA una factura previa → NO va como gasto positivo por crear-gastos-bulk:
  // se carga con hilvan_crear_nota_credito (gasto negativo, sin retención).
  const compras: FilaSugerida[] = filas.filter((f) => f.fuente === 'rcv_compra' && f.tipo_documento !== 'nota_credito')
  const notasCredito = filas.filter((f) => f.tipo_documento === 'nota_credito')
  const honorarios = filas.filter((f) => f.fuente === 'bhe_recibida')

  // ── Dedup contra lo ya cargado como gasto en Hilván (rut + folio) ──────────
  const folios = [...new Set(filas.map((f) => f.folio).filter(Boolean) as string[])]
  const yaCargado = new Set<string>()
  if (folios.length > 0) {
    for (const tabla of ['rendicion_gastos', 'rendicion_mensual_gastos'] as const) {
      const { data, error } = await admin.from(tabla).select('rut_emisor, folio').in('folio', folios)
      if (error) {
        return NextResponse.json({ error: `No se pudo revisar qué ya está cargado (${tabla}): ${error.message}` }, { status: 500 })
      }
      for (const row of data ?? []) yaCargado.add(claveDedup(row.rut_emisor, row.folio))
    }
  }

  const marcar = (f: FilaSugerida) => {
    const out: any = { ...f, ya_cargado: yaCargado.has(claveDedup(f.rut_emisor, f.folio)) }
    if (!incluirCrudo) delete out.crudo
    return out
  }
  const comprasOut = compras.map(marcar)
  const notasCreditoOut = notasCredito.map(marcar)
  const honorariosOut = honorarios.map(marcar)
  const nuevos = (arr: any[]) => arr.filter((f) => !f.ya_cargado).length

  return NextResponse.json({
    periodo,
    compras: comprasOut,
    notas_credito: notasCreditoOut,
    honorarios: honorariosOut,
    resumen: {
      compras: compras.length,
      compras_nuevas: nuevos(comprasOut),
      notas_credito: notasCredito.length,
      notas_credito_nuevas: nuevos(notasCreditoOut),
      honorarios: honorarios.length,
      honorarios_nuevas: nuevos(honorariosOut),
      ya_cargados: comprasOut.concat(notasCreditoOut, honorariosOut).filter((f) => f.ya_cargado).length,
    },
    importado: Object.fromEntries(importaciones.map((i) => [i.lado, i.importado_at])),
    nota: 'Solo lectura, desde la última importación del SII (`importado`: si fue antes de que cerrara el mes, pueden faltar documentos posteriores; se reimporta con `npm run sii:importar -- AAAA-MM` en el Mac de Tomás). Facturas y boletas NUEVAS: clasifícalas (origen mensual/proyecto, categoría o cotizacion_item_id) y cárgalas con hilvan_crear_gastos_bulk. Las NOTAS DE CRÉDITO (notas_credito) NO van por ahí: cárgalas con hilvan_crear_nota_credito (monto = el valor mostrado en POSITIVO; se persiste negativo; pasa referencia_folio = la factura que anula).',
  })
}
