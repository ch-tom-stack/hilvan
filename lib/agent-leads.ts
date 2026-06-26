// lib/agent-leads.ts
// Motor de descubrimiento de leads web para el CRM (CH-10). v2.
// Usa Firecrawl (search + scrape) para encontrar empresas de un sector, leer su
// sitio REAL y extraer un "dossier de acercamiento": empresa, sitio, canal de
// contacto (correo genérico o formulario) y un gancho.
//
// NO obtiene el correo personal del decisor (no está publicado). Entrega el
// correo GENÉRICO publicado + contexto. Todo entra como PROPUESTA a la Bandeja.
//
// v2 (jun 2026) — afinada con la prueba de agencias:
//   1. filtra listicles/directorios/agregadores (por dominio, título y path);
//   2. valida rubro (la página debe calzar con el sector buscado);
//   3. limpia el gancho (descarta nombres de archivo, metadata, timestamps);
//   4. prefiere correo de dominio propio sobre Gmail/Hotmail.

const FC = 'https://api.firecrawl.dev/v2'

// Dominios que NO son sitios de empresa (agregadores, redes, listados, directorios).
const JUNK_DOMINIO =
  /(wikipedia|youtube|facebook|instagram|twitter|x\.com|linkedin|tiktok|indeed|computrabajo|laborum|emol|latercera|biobio|df\.cl|guioteca|mercadolibre|amazon|google\.|maps\.|listas|ranking|sortlist|clutch|topagency|merca20|paredro|publimark|marketing4ecommerce|catalogosofertas|yelp|paginasamarillas|reddit|agencias\.marketing|designrush|goodfirms|trustpilot)/i

// Señales de "esto es un listicle / directorio / blog", no una empresa individual.
const LISTICLE_TITULO =
  /\b(las|los|top|mejores|ranking|rankings|directorio|gu[íi]a|listado|lista de|\d+\s+(mejores|agencias|empresas)|mejores\s+\d+)\b/i
const LISTICLE_PATH =
  /(mejores|ranking|top-|directorio|guia|gu%C3%ADa|listado|\/blog\/|\/noticias\/|\/article|\/category\/|\/tag\/|\/lista)/i

const JUNK_EMAIL =
  /(sentry|wixpress|\.png|\.jpg|\.jpeg|\.svg|@2x|@3x|example\.|placeholder|domain\.com|tucorreo|tu-correo|youremail|your@|email@|@sentry|wix\.com|googleapis|cloudflare|schema\.org|w3\.org)/i

const FREE_EMAIL = /@(gmail|hotmail|outlook|yahoo|icloud|live|me)\./i

const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

// Líneas que NO sirven como gancho: archivos, dimensiones, metadata, timestamps, logos.
const GANCHO_BASURA =
  /(\.(jpg|jpeg|png|svg|webp|gif)|\/v1\/(fill|crop)|\bw\s*\d+,\s*h\s*\d+|\d{4}-\d{2}-\d{2}t|fullback|\blogo\b|usm\s|al\s+c,|q\s+\d{2}|\b\d{6,}\b)/i

const STOP =
  /^(de|del|la|el|los|las|en|para|por|con|y|o|a|chile|chilena|chilenas|santiago|providencia|las condes|vitacura|region|región|metropolitana|rm|cl|sus|una|un)$/

export interface LeadDossier {
  empresa: string
  sitio: string
  email: string | null
  canal: 'email' | 'formulario'
  gancho: string | null
}

function deaccent(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function origen(u: string): string | null {
  try {
    return new URL(u).origin
  } catch {
    return null
  }
}

function host(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function limpiarTitulo(t: string, dominio: string): string {
  let s = (t || '').split(/[|—–\-·]/)[0].trim()
  if (!s || s.length < 2) s = host(dominio) || dominio
  return s.slice(0, 80)
}

// Palabras de rubro derivadas del sector (sin conectores ni ubicaciones).
function keywordsSector(sector: string): string[] {
  return [...new Set(
    deaccent(sector)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !STOP.test(w)),
  )]
}

// ¿La página calza con el rubro buscado? (título + primeros ~3000 chars del cuerpo)
function coincideRubro(keywords: string[], titulo: string, md: string): boolean {
  if (keywords.length === 0) return true
  const texto = deaccent((titulo || '') + ' ' + (md || '').slice(0, 3000))
  return keywords.some(kw => texto.includes(kw) || (kw.length > 4 && texto.includes(kw.slice(0, kw.length - 1))))
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
  if (!res.ok || j?.success === false) throw new Error(`Firecrawl ${path}: ${j?.error || res.status}`)
  return j
}

// Mejor correo: 1º dominio propio, 2º no-gratuito, 3º lo que haya.
function mejorEmail(md: string, sitioHost: string): string | null {
  const emails = [...new Set((md.match(RE_EMAIL) || []).filter(e => !JUNK_EMAIL.test(e)))]
  if (emails.length === 0) return null
  const dominioPropio = emails.find(e => sitioHost && e.toLowerCase().endsWith('@' + sitioHost))
  if (dominioPropio) return dominioPropio
  const noGratuito = emails.find(e => !FREE_EMAIL.test(e))
  return noGratuito || emails[0]
}

function ganchoDe(md: string, fallback: string | null): string | null {
  const lineas = (md || '')
    .split('\n')
    .map(l => l.replace(/[#*_>`\[\]()]/g, ' ').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim())
    .filter(l => {
      if (l.length < 60 || l.length > 400) return false
      if (GANCHO_BASURA.test(l)) return false
      if (/cookie|política|privacidad|menú|copyright|derechos reservados|iniciar sesión|carrito/i.test(l)) return false
      const letras = (l.match(/[a-záéíóúñ]/gi) || []).length
      if (letras / l.length < 0.6) return false // demasiados símbolos = basura
      if (l.split(' ').length < 8) return false // exige una frase, no un fragmento
      return true
    })
  const g = lineas[0] || (fallback && !GANCHO_BASURA.test(fallback) ? fallback : null)
  return g ? g.slice(0, 220) : null
}

/**
 * Descubre leads de un sector y arma su dossier. v2 con filtros de calidad.
 * Requiere FIRECRAWL_API_KEY.
 */
export async function buscarLeadsWeb(
  sector: string,
  max: number,
  apiKey: string,
): Promise<{ candidatos: LeadDossier[]; revisados: number; descartados: number }> {
  const keywords = keywordsSector(sector)

  // 1) Descubrir dominios candidatos (pedimos de más porque filtramos duro).
  const search = await fcPost('/search', { query: sector, limit: 20, location: 'Chile' }, apiKey)
  const results: any[] = Array.isArray(search.data) ? search.data : (search.data?.web || search.web || [])

  const vistos = new Set<string>()
  const semillas: { url: string; titulo: string; desc: string }[] = []
  for (const r of results) {
    const o = origen(r.url || '')
    const titulo = r.title || ''
    if (!o || vistos.has(o)) continue
    if (JUNK_DOMINIO.test(r.url) || LISTICLE_TITULO.test(titulo) || LISTICLE_PATH.test(r.url)) continue // filtro 1
    vistos.add(o)
    semillas.push({ url: o, titulo, desc: r.description || '' })
    if (semillas.length >= max * 2) break // tope para acotar tiempo/credito
  }

  // 2) Leer cada candidato, validar rubro y extraer dossier. Paramos al llegar a `max`.
  const candidatos: LeadDossier[] = []
  let revisados = 0
  let descartados = 0
  for (const s of semillas) {
    if (candidatos.length >= max) break
    revisados++
    let md = ''
    try {
      const sc = await fcPost('/scrape', { url: s.url, formats: ['markdown'] }, apiKey)
      md = sc.data?.markdown || ''
    } catch {
      /* sigue */
    }

    // filtro 2: ¿calza con el rubro? (si no, se descarta — no ensucia la Bandeja)
    if (!coincideRubro(keywords, s.titulo, md)) {
      descartados++
      continue
    }

    let email = mejorEmail(md, host(s.url)) // filtro 4: prioriza dominio propio
    if (!email) {
      try {
        const sc2 = await fcPost('/scrape', { url: s.url.replace(/\/$/, '') + '/contacto', formats: ['markdown'] }, apiKey)
        const md2 = sc2.data?.markdown || ''
        email = mejorEmail(md2, host(s.url))
        if (!md) md = md2
      } catch {
        /* ignore */
      }
    }

    candidatos.push({
      empresa: limpiarTitulo(s.titulo, s.url),
      sitio: s.url,
      email,
      canal: email ? 'email' : 'formulario',
      gancho: ganchoDe(md, s.desc), // filtro 3: gancho limpio
    })
  }

  return { candidatos, revisados, descartados }
}
