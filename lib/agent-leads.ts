// lib/agent-leads.ts
// Motor de descubrimiento de leads web para el CRM (CH-10).
// Usa Firecrawl (search + scrape) para encontrar empresas de un sector, leer su
// sitio REAL (no solo el snippet) y extraer un "dossier de acercamiento":
// empresa, sitio, canal de contacto (correo genérico o formulario) y un gancho.
//
// IMPORTANTE: esto NO obtiene el correo personal del decisor (no está publicado).
// Entrega el correo GENÉRICO publicado + contexto. Todo entra como PROPUESTA a la
// Bandeja; nada se crea directo. v1 — el método se irá afinando.

const FC = 'https://api.firecrawl.dev/v2'

// Dominios/patrones que NO son sitios de empresa (agregadores, redes, listados).
const JUNK_DOMINIO =
  /(wikipedia|youtube|facebook|instagram|twitter|x\.com|linkedin|tiktok|indeed|computrabajo|laborum|emol|latercera|biobio|df\.cl|guioteca|mercadolibre|amazon|google\.|maps\.|listas|ranking|sortlist|clutch|topagency|merca20|paredro|publimark|marketing4ecommerce|catalogosofertas|yelp|paginasamarillas|reddit)/i

const JUNK_EMAIL =
  /(sentry|wixpress|\.png|\.jpg|\.jpeg|\.svg|@2x|@3x|example\.|placeholder|domain\.com|tucorreo|tu-correo|youremail|your@|email@|@sentry|wix\.com|googleapis|cloudflare|schema\.org|w3\.org)/i

const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

export interface LeadDossier {
  empresa: string
  sitio: string
  email: string | null // correo genérico publicado (no personal)
  canal: 'email' | 'formulario'
  gancho: string | null
}

function origen(u: string): string | null {
  try {
    return new URL(u).origin
  } catch {
    return null
  }
}

function limpiarTitulo(t: string, dominio: string): string {
  // "MILA Agencia Creativa | Santiago" → "MILA Agencia Creativa"
  let s = (t || '').split(/[|—–\-·]/)[0].trim()
  if (!s || s.length < 2) {
    try {
      s = new URL(dominio).hostname.replace(/^www\./, '')
    } catch {
      s = dominio
    }
  }
  return s.slice(0, 80)
}

async function fcPost(path: string, body: unknown, apiKey: string): Promise<any> {
  const res = await fetch(`${FC}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let j: any
  try {
    j = JSON.parse(text)
  } catch {
    throw new Error(`Firecrawl ${path}: respuesta no-JSON (${res.status})`)
  }
  if (!res.ok || j?.success === false) {
    throw new Error(`Firecrawl ${path}: ${j?.error || res.status}`)
  }
  return j
}

function emailsDe(md: string): string[] {
  return [...new Set((md.match(RE_EMAIL) || []).filter(e => !JUNK_EMAIL.test(e)))]
}

function ganchoDe(md: string, fallback: string | null): string | null {
  // Primer párrafo con sustancia (≥ 60 chars), sin markdown de menús/links.
  const lineas = (md || '')
    .split('\n')
    .map(l => l.replace(/[#*_>`\[\]()]/g, ' ').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim())
    .filter(l => l.length >= 60 && /[a-záéíóúñ]/i.test(l) && !/cookie|política|privacidad|menú|copyright|derechos reservados/i.test(l))
  return (lineas[0] || fallback || '')?.slice(0, 220) || null
}

/**
 * Descubre leads de un sector y arma su dossier. Devuelve hasta `max` candidatos.
 * Requiere FIRECRAWL_API_KEY.
 */
export async function buscarLeadsWeb(
  sector: string,
  max: number,
  apiKey: string,
): Promise<{ candidatos: LeadDossier[]; revisados: number }> {
  // 1) Descubrir dominios candidatos (search devuelve resultados rankeados).
  const search = await fcPost('/search', { query: sector, limit: Math.min(15, max * 3), location: 'Chile' }, apiKey)
  const results: any[] = Array.isArray(search.data) ? search.data : (search.data?.web || search.web || [])

  const vistos = new Set<string>()
  const semillas: { url: string; titulo: string; desc: string }[] = []
  for (const r of results) {
    const o = origen(r.url || '')
    if (!o || JUNK_DOMINIO.test(r.url) || vistos.has(o)) continue
    vistos.add(o)
    semillas.push({ url: o, titulo: r.title || '', desc: r.description || '' })
    if (semillas.length >= max) break
  }

  // 2) Por cada candidato, leer su sitio real y extraer el dossier.
  const candidatos: LeadDossier[] = []
  for (const s of semillas) {
    let md = ''
    try {
      const sc = await fcPost('/scrape', { url: s.url, formats: ['markdown'] }, apiKey)
      md = sc.data?.markdown || ''
    } catch {
      // sigue: el dominio queda con canal=formulario sin gancho
    }
    let emails = emailsDe(md)
    // Si la home no trae correo, intentar /contacto una vez.
    if (emails.length === 0) {
      try {
        const sc2 = await fcPost('/scrape', { url: s.url.replace(/\/$/, '') + '/contacto', formats: ['markdown'] }, apiKey)
        const md2 = sc2.data?.markdown || ''
        emails = emailsDe(md2)
        if (!md) md = md2
      } catch {
        /* ignore */
      }
    }
    candidatos.push({
      empresa: limpiarTitulo(s.titulo, s.url),
      sitio: s.url,
      email: emails[0] || null,
      canal: emails[0] ? 'email' : 'formulario',
      gancho: ganchoDe(md, s.desc),
    })
  }

  return { candidatos, revisados: semillas.length }
}
