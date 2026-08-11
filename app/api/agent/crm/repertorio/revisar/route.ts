import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA, hoyChile } from '@/lib/agent-crm'
import type { EstadoLink, LinkTrabajo, Trabajo } from '@/lib/repertorio'

export const runtime = 'nodejs'
// Sin esto la función usa el tope por defecto y se corta antes de terminar.
export const maxDuration = 60

const TIMEOUT_MS = 8000
const MAX_LINKS = 120
/**
 * Links que se revisan a la vez.
 *
 * En serie, sesenta links a 8 s de timeout cada uno no caben en el presupuesto
 * de la función: el cliente ve un timeout aunque el servidor termine el trabajo
 * —y entonces no sabe si corrió, que es peor que fallar—. De a seis alcanza sin
 * castigar al origen.
 */
const CONCURRENCIA = 6

/**
 * Hosts que no tiene sentido revisar y que además no queremos alcanzar desde el
 * servidor. Los links los escribe un operador autenticado, así que esto es
 * cinturón sobre tirantes — pero una revisión automática que puede tocar la red
 * interna es justo el tipo de cosa que no se arregla después.
 */
function hostProhibido(url: string): boolean {
  let h: string
  try {
    h = new URL(url).hostname.toLowerCase()
  } catch {
    return true
  }
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true
  // IPv4 privadas y loopback
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  return false
}

/**
 * Un link está roto sólo si el servidor dice que no existe. Un 403 o un 429 es
 * casi siempre bloqueo de bots —Instagram lo hace con todo— y marcarlo muerto
 * borraría media biblioteca de un plumazo. Ante la duda se deja como estaba.
 */
async function revisarUrl(url: string): Promise<{ estado: EstadoLink | null; detalle: string }> {
  if (hostProhibido(url)) return { estado: null, detalle: 'host no revisable' }

  const intentar = async (method: 'HEAD' | 'GET') => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      return await fetch(url, {
        method,
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'HilvanRepertorio/1.0 (verificación de links)' },
      })
    } finally {
      clearTimeout(t)
    }
  }

  try {
    let res = await intentar('HEAD')
    // Hartos servidores no implementan HEAD y responden 405: se reintenta con GET.
    if (res.status === 405 || res.status === 501) res = await intentar('GET')

    if (res.ok || (res.status >= 300 && res.status < 400)) return { estado: 'vivo', detalle: `HTTP ${res.status}` }
    if (res.status === 404 || res.status === 410) return { estado: 'muerto', detalle: `HTTP ${res.status}` }
    return { estado: null, detalle: `HTTP ${res.status} — no concluyente` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Un timeout tampoco prueba que el link esté muerto.
    if (/abort/i.test(msg)) return { estado: null, detalle: 'timeout' }
    return { estado: 'muerto', detalle: msg.slice(0, 120) }
  }
}

// POST /api/agent/crm/repertorio/revisar { id? }
//
// Revisa que los links del repertorio sigan vivos y marca los rotos. Sin `id`
// revisa todo el catálogo. Es la parte que hace que "se renueve de tanto en
// tanto" sea real: un link roto en un correo de captación es peor que ninguno.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    // Sin cuerpo se revisa todo: es el uso normal de la rutina.
  }

  const admin = createAdminClient()
  const id = strA(body?.id)

  let query = admin.from('repertorio').select('*')
  if (id) query = query.eq('id', id)
  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const trabajos = (data ?? []) as Trabajo[]
  if (trabajos.length === 0) {
    return NextResponse.json({ revisados: 0, mensaje: id ? 'id no encontrado' : 'repertorio vacío' })
  }

  const hoy = hoyChile()
  let comprobados = 0
  let tope = false
  const cambios: { marca: string; url: string; de: EstadoLink; a: EstadoLink; detalle: string }[] = []
  const noConcluyentes: { marca: string; url: string; detalle: string }[] = []

  for (const t of trabajos) {
    const links = Array.isArray(t.links) ? t.links : []
    if (links.length === 0) continue

    // Cuántos caben todavía dentro del tope global.
    const cabe = Math.max(0, MAX_LINKS - comprobados)
    const aRevisar = links.slice(0, cabe)
    if (aRevisar.length < links.length) tope = true
    comprobados += aRevisar.length

    // En tandas paralelas: el orden del resultado se mantiene, así que sigue
    // calzando uno a uno con `links`.
    const resultados: { estado: EstadoLink | null; detalle: string }[] = []
    for (let i = 0; i < aRevisar.length; i += CONCURRENCIA) {
      const tanda = aRevisar.slice(i, i + CONCURRENCIA)
      resultados.push(...(await Promise.all(tanda.map(l => revisarUrl(l.url)))))
    }

    const nuevos: LinkTrabajo[] = []
    let cambio = false

    links.forEach((l, i) => {
      // Los que quedaron fuera del tope se dejan intactos, sin tocar su estado.
      if (i >= aRevisar.length) { nuevos.push(l); return }
      const { estado, detalle } = resultados[i]
      if (estado === null) {
        noConcluyentes.push({ marca: t.marca, url: l.url, detalle })
        nuevos.push(l)
        return
      }
      if (estado !== l.estado) {
        cambios.push({ marca: t.marca, url: l.url, de: l.estado, a: estado, detalle })
        cambio = true
      }
      nuevos.push({ ...l, estado, revisado_en: hoy })
    })

    if (cambio || nuevos.some(l => l.revisado_en === hoy)) {
      await admin
        .from('repertorio')
        .update({ links: nuevos, revisado_en: hoy, updated_at: new Date().toISOString() })
        .eq('id', t.id)
    }
  }

  await registrarAccion({
    herramienta: 'crm-repertorio-revisar',
    payload: { trabajos: trabajos.length, comprobados, cambios: cambios.length },
    resultado_tabla: 'repertorio',
    ok: true,
  })

  return NextResponse.json({
    trabajos: trabajos.length,
    links_comprobados: comprobados,
    cambios,
    no_concluyentes: noConcluyentes,
    // Se declara el corte en vez de dejarlo implícito: "revisado" con un tope
    // silencioso se lee como "todo está bien" cuando no se miró todo.
    ...(tope ? { aviso: `Se cortó en ${MAX_LINKS} links — vuelve a correrlo para el resto` } : {}),
  })
}
