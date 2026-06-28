import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  normalizarCompra,
  normalizarBhe,
  extraerDocumentos,
  claveDedup,
  type FilaSugerida,
} from '@/lib/agent-sii'

export const runtime = 'nodejs'

// POST /api/agent/sii-sync (JSON)  { periodo: "202606", tipo?: "ambos"|"rcv"|"bhe", incluir_crudo?: boolean }
//
// SOLO LECTURA. Trae del SII (vía API Gateway) las FACTURAS COMPRADAS/RECIBIDAS
// (RCV compras) y las BOLETAS DE HONORARIOS RECIBIDAS de un período, las
// normaliza al shape de gasto y marca cuáles YA están cargadas en Hilván
// (por rut+folio). NO escribe nada: la carga la hace después
// hilvan_crear_gastos_bulk, tras la clasificación humana (origen/categoría/
// cotizacion_item_id). Así la escritura y su reversibilidad viven en un solo lugar.
//
// Credenciales (env, NUNCA en el código ni en la respuesta):
//   APIGATEWAY_API_TOKEN  → header Authorization: Token <token>
//   SII_RUT, SII_CLAVE    → body { auth: { pass: { rut, clave } } }
//   APIGATEWAY_API_URL    → opcional (default https://app.apigateway.cl)
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // periodo: aceptar AAAAMM o AAAA-MM.
  let periodo = String(body?.periodo ?? '').trim().replace('-', '')
  if (!/^\d{6}$/.test(periodo)) {
    return NextResponse.json({ error: 'periodo inválido (formato AAAAMM, ej. 202606)' }, { status: 400 })
  }
  const tipo = ['ambos', 'rcv', 'bhe'].includes(body?.tipo) ? body.tipo : 'ambos'
  const incluirCrudo = body?.incluir_crudo === true

  const token = process.env.APIGATEWAY_API_TOKEN
  const rut = process.env.SII_RUT
  const clave = process.env.SII_CLAVE
  if (!token || !rut || !clave) {
    return NextResponse.json(
      { error: 'Faltan credenciales en el servidor (APIGATEWAY_API_TOKEN, SII_RUT, SII_CLAVE)' },
      { status: 503 },
    )
  }
  const baseUrl = (process.env.APIGATEWAY_API_URL || 'https://app.apigateway.cl').replace(/\/$/, '')

  const auth = { auth: { pass: { rut, clave } } }
  const headers = { 'Content-Type': 'application/json', Authorization: `Token ${token}` }

  // Llamada POST a API Gateway. Devuelve { ok, status, json } sin filtrar la clave.
  async function ag(path: string): Promise<{ ok: boolean; status: number; json: any }> {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(auth),
      })
      const text = await res.text()
      let json: any = null
      try { json = text ? JSON.parse(text) : null } catch { json = { raw: text.slice(0, 500) } }
      return { ok: res.ok, status: res.status, json }
    } catch (e: any) {
      return { ok: false, status: 0, json: { error: e?.message ?? 'fetch falló' } }
    }
  }

  const errores: string[] = []
  let compras: FilaSugerida[] = []
  let honorarios: FilaSugerida[] = []

  // ── RCV compras (facturas recibidas) — detalle JSON ───────────────────────
  if (tipo === 'ambos' || tipo === 'rcv') {
    const r = await ag(`/sii/rcv/compras/detalle/${rut}/${periodo}/0/REGISTRO?tipo=rcv`)
    if (!r.ok) errores.push(`RCV compras: HTTP ${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`)
    else compras = extraerDocumentos(r.json).map(normalizarCompra)
  }

  // ── BHE recibidas — paginado defensivo (sigue pagina_sig_codigo) ──────────
  if (tipo === 'ambos' || tipo === 'bhe') {
    let pagina = 1
    let sigCodigo: string | null = null
    for (let i = 0; i < 50; i++) {
      const qs = pagina > 1 ? `?pagina=${pagina}&pagina_sig_codigo=${sigCodigo ?? '00000000000000'}` : ''
      const r = await ag(`/sii/bhe/recibidas/documentos/${rut}/${periodo}${qs}`)
      if (!r.ok) { errores.push(`BHE recibidas (pág ${pagina}): HTTP ${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`); break }
      const docs = extraerDocumentos(r.json)
      if (docs.length === 0) break
      honorarios.push(...docs.map(normalizarBhe))
      // Continuar solo si la respuesta declara una página siguiente.
      const sig = r.json?.pagina_sig_codigo ?? r.json?.paginaSigCodigo ?? r.json?.siguiente
      if (!sig || String(sig) === '00000000000000') break
      sigCodigo = String(sig)
      pagina++
    }
  }

  // ── Dedup contra lo ya cargado en Hilván (rut + folio) ────────────────────
  const todas = [...compras, ...honorarios]
  const folios = [...new Set(todas.map((f) => f.folio).filter(Boolean) as string[])]
  const yaCargado = new Set<string>()
  if (folios.length > 0) {
    const admin = createAdminClient()
    for (const tabla of ['rendicion_gastos', 'rendicion_mensual_gastos'] as const) {
      const { data } = await admin.from(tabla).select('rut_emisor, folio').in('folio', folios)
      for (const row of data ?? []) yaCargado.add(claveDedup(row.rut_emisor, row.folio))
    }
  }

  const marcar = (f: FilaSugerida) => {
    const out: any = { ...f, ya_cargado: yaCargado.has(claveDedup(f.rut_emisor, f.folio)) }
    if (!incluirCrudo) delete out.crudo
    return out
  }
  const comprasOut = compras.map(marcar)
  const honorariosOut = honorarios.map(marcar)
  const nuevos = (arr: any[]) => arr.filter((f) => !f.ya_cargado).length

  return NextResponse.json({
    periodo,
    compras: comprasOut,
    honorarios: honorariosOut,
    resumen: {
      compras: compras.length,
      compras_nuevas: nuevos(comprasOut),
      honorarios: honorarios.length,
      honorarios_nuevas: nuevos(honorariosOut),
      ya_cargados: comprasOut.concat(honorariosOut).filter((f) => f.ya_cargado).length,
    },
    nota: 'Solo lectura. Clasifica cada fila (origen mensual/proyecto, categoría o cotizacion_item_id) y cárgalas con hilvan_crear_gastos_bulk. Revisa montos: el mapeo de campos del SII se afina tras la primera corrida real (usa incluir_crudo=true para ver el registro original).',
    ...(errores.length ? { errores } : {}),
  })
}
