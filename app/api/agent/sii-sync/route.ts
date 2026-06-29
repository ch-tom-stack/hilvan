import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  normalizarCompra,
  normalizarBhe,
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
  const rut = process.env.SII_RUT // empresa cuyos documentos se consultan (receptor en la URL)
  // Quién inicia sesión en el SII: el usuario DELEGADO de solo consulta (su propio
  // RUT) si está configurado; si no, la propia empresa (compat con la clave admin).
  const loginRut = process.env.SII_LOGIN_RUT || rut
  const clave = process.env.SII_CLAVE
  if (!token || !rut || !clave) {
    return NextResponse.json(
      { error: 'Faltan credenciales en el servidor (APIGATEWAY_API_TOKEN, SII_RUT, SII_CLAVE)' },
      { status: 503 },
    )
  }
  // La API v2 vive bajo /api/v2 (ej. https://app.apigateway.cl/api/v2/sii/...).
  const baseUrl = (process.env.APIGATEWAY_API_URL || 'https://app.apigateway.cl/api/v2').replace(/\/$/, '')

  const auth = { auth: { pass: { rut: loginRut, clave } } }
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

  // ── RCV compras (facturas recibidas) ──────────────────────────────────────
  // tipo=rcv_csv devuelve TODOS los DTE del período como array en `data`
  // (tipo=rcv con dte=0 da 500; solo sirve por dte específico). Respuesta:
  // { data: [ {dte,rut,razon_social,folio,fecha,neto,iva,total,...}, ... ], metadata }.
  if (tipo === 'ambos' || tipo === 'rcv') {
    const r = await ag(`/sii/rcv/compras/detalle/${rut}/${periodo}/0/REGISTRO?tipo=rcv_csv`)
    if (!r.ok) errores.push(`RCV compras: HTTP ${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`)
    else compras = (Array.isArray(r.json?.data) ? r.json.data : []).map(normalizarCompra)
  }

  // ── BHE recibidas — paginado ──────────────────────────────────────────────
  // `pagina` es obligatorio (incluso la 1ª). Respuesta:
  // { data: { n_paginas, n_boletas, boletas: [ {numero,rut,dv,nombre,fecha,
  //   total_honorarios,total_retencion,total_liquido,anulada,codigo,...} ] }, metadata }.
  // Descarta ANULADAS y dedup entre páginas por `codigo` (robusto aunque la API
  // ignore `pagina`). Corta cuando no llegan boletas nuevas o se alcanza n_paginas.
  if (tipo === 'ambos' || tipo === 'bhe') {
    const vistos = new Set<string>()
    let pagina = 1
    for (let i = 0; i < 50; i++) {
      const r = await ag(`/sii/bhe/recibidas/documentos/${rut}/${periodo}?pagina=${pagina}`)
      if (!r.ok) { errores.push(`BHE recibidas (pág ${pagina}): HTTP ${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`); break }
      const d = r.json?.data ?? {}
      const boletas = (Array.isArray(d.boletas) ? d.boletas : []).filter((b: any) => !b.anulada)
      const nuevas = boletas.filter((b: any) => {
        const k = String(b.codigo ?? `${b.rut}-${b.numero}`)
        if (vistos.has(k)) return false
        vistos.add(k)
        return true
      })
      if (nuevas.length === 0) break
      honorarios.push(...nuevas.map(normalizarBhe))
      const nPag = Number(d.n_paginas) || 0
      if (nPag > 0 && pagina >= nPag) break
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
