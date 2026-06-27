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

// Clasificador de rubro (v2.1): Firecrawl extrae con LLM si el GIRO PRINCIPAL
// del sitio calza con el sector. Discrimina casos que el filtro por palabra no
// pilla (ej. dominio con "publicidad" pero giro real distinto).
const RUBRO_SCHEMA = {
  type: 'object',
  properties: {
    coincide: { type: 'boolean' },
    giro: { type: 'string' },
    gancho: { type: 'string' },
  },
  required: ['coincide', 'giro'],
}
function rubroPrompt(sector: string): string {
  return `Analiza este sitio web de una empresa.
1) ¿Su negocio PRINCIPAL corresponde al rubro "${sector}" (ignora la ciudad/país)? Marca coincide=true SOLO si el giro principal calza; si es de otro giro (aunque el dominio o algún texto sugiera lo contrario), coincide=false. Pon el giro real en "giro".
2) En "gancho", escribe 1 frase (máx 25 palabras) con algo REAL y específico de la marca útil para un acercamiento comercial: su propuesta, colección/producto, cliente, estilo o historia. IGNORA banners de envío, avisos de navegador/cookies, CTAs de WhatsApp y textos de menú. Si no hay nada sustantivo, deja "gancho" vacío.`
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

export interface Descartado {
  empresa: string
  sitio: string
  giro: string
}

/**
 * Descubre leads de un sector y arma su dossier. v3.
 * - clasificador LLM de rubro (v2.1) que ADEMÁS extrae el gancho real (v3);
 * - scrapes en PARALELO (v3, corta timeouts);
 * - devuelve el detalle de descartados (v3, para auditar recall).
 * Requiere FIRECRAWL_API_KEY.
 */
export async function buscarLeadsWeb(
  sector: string,
  max: number,
  apiKey: string,
  objetivos?: string[],
): Promise<{ candidatos: LeadDossier[]; revisados: number; descartados: number; descartadosDetalle: Descartado[] }> {
  const keywords = keywordsSector(sector)

  // 1) Obtener semillas: modo DIRIGIDO (lista de objetivos aprobada) o BÚSQUEDA.
  let semillas: { url: string; titulo: string; desc: string }[]
  if (objetivos && objetivos.length) {
    semillas = await seedsFromObjetivos(objetivos, apiKey)
  } else {
    const search = await fcPost('/search', { query: sector, limit: 20, location: 'Chile' }, apiKey)
    const results: any[] = Array.isArray(search.data) ? search.data : (search.data?.web || search.web || [])
    const vistos = new Set<string>()
    semillas = []
    const topeSemillas = Math.min(max * 2, 12)
    for (const r of results) {
      const o = origen(r.url || '')
      const titulo = r.title || ''
      if (!o || vistos.has(o)) continue
      if (JUNK_DOMINIO.test(r.url) || LISTICLE_TITULO.test(titulo) || LISTICLE_PATH.test(r.url)) continue // filtro 1
      vistos.add(o)
      semillas.push({ url: o, titulo, desc: r.description || '' })
      if (semillas.length >= topeSemillas) break
    }
  }

  // 2) Scrapear TODAS las semillas en paralelo (markdown + clasificación/gancho LLM).
  const scraped = await Promise.all(
    semillas.map(s =>
      fcPost(
        '/scrape',
        { url: s.url, formats: ['markdown', { type: 'json', prompt: rubroPrompt(sector), schema: RUBRO_SCHEMA }] },
        apiKey,
      )
        .then(sc => ({ s, md: sc.data?.markdown || '', clasif: sc.data?.json as any }))
        .catch(() => ({ s, md: '', clasif: null as any })),
    ),
  )

  // 3) Filtrar por rubro y armar dossier (gancho del LLM, fallback a heurística).
  const candidatos: LeadDossier[] = []
  const descartadosDetalle: Descartado[] = []
  let revisados = 0
  for (const d of scraped) {
    revisados++
    const enRubro =
      d.clasif && typeof d.clasif.coincide === 'boolean' ? d.clasif.coincide : coincideRubro(keywords, d.s.titulo, d.md)
    if (!enRubro) {
      descartadosDetalle.push({ empresa: limpiarTitulo(d.s.titulo, d.s.url), sitio: d.s.url, giro: d.clasif?.giro || '—' })
      continue
    }
    if (candidatos.length >= max) continue
    const ganchoLLM = (d.clasif?.gancho || '').trim()
    candidatos.push({
      empresa: limpiarTitulo(d.s.titulo, d.s.url),
      sitio: d.s.url,
      email: mejorEmail(d.md, host(d.s.url)),
      canal: 'formulario', // se ajusta tras el fallback de correo
      gancho: ganchoLLM || ganchoDe(d.md, d.s.desc),
    })
  }

  // 4) Fallback de correo en /contacto (en paralelo) para los que no traen email.
  await Promise.all(
    candidatos
      .filter(c => !c.email)
      .map(async c => {
        try {
          const sc2 = await fcPost('/scrape', { url: c.sitio.replace(/\/$/, '') + '/contacto', formats: ['markdown'] }, apiKey)
          c.email = mejorEmail(sc2.data?.markdown || '', host(c.sitio))
        } catch {
          /* ignore */
        }
      }),
  )
  for (const c of candidatos) c.canal = c.email ? 'email' : 'formulario'

  return { candidatos, revisados, descartados: descartadosDetalle.length, descartadosDetalle }
}

// ── Modo dirigido: convierte una lista de objetivos (dominios o nombres) en semillas ──
async function seedsFromObjetivos(
  objetivos: string[],
  apiKey: string,
): Promise<{ url: string; titulo: string; desc: string }[]> {
  const out: { url: string; titulo: string; desc: string }[] = []
  await Promise.all(
    objetivos.slice(0, 15).map(async raw => {
      const t = (raw || '').trim()
      if (!t) return
      // ¿es dominio/URL?
      if (/^https?:\/\//i.test(t) || /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(t)) {
        const og = origen(t.startsWith('http') ? t : 'https://' + t)
        if (og) out.push({ url: og, titulo: host(og), desc: '' })
        return
      }
      // es un nombre → resolver su sitio oficial
      try {
        const sr = await fcPost('/search', { query: `${t} sitio oficial`, limit: 3, location: 'Chile' }, apiKey)
        const rs: any[] = Array.isArray(sr.data) ? sr.data : (sr.data?.web || [])
        const hit = rs.find(r => r.url && !JUNK_DOMINIO.test(r.url) && !LISTICLE_PATH.test(r.url))
        const og = hit && origen(hit.url)
        if (og) out.push({ url: og, titulo: t, desc: hit.description || '' })
      } catch {
        /* ignore */
      }
    }),
  )
  return out
}

// ── Paso 1 de descubrimiento: minar FUENTES curadas (listicles/guías) y extraer ──
// la LISTA de marcas del rubro con el LLM de Firecrawl. NO scrapea cada marca ni
// escribe nada: devuelve la lista para que un humano la pode antes de enriquecer.
const MARCAS_SCHEMA = {
  type: 'object',
  properties: {
    marcas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { nombre: { type: 'string' }, sitio: { type: 'string' } },
        required: ['nombre'],
      },
    },
  },
  required: ['marcas'],
}
function marcasPrompt(sector: string): string {
  return `Esta página menciona varias marcas/empresas del rubro "${sector}". Extrae TODAS las que aparezcan, con su "nombre" y su "sitio" web si se indica.
REGLAS:
- Solo marcas reales del rubro indicado.
- Si el rubro menciona un país (ej. "Chile"), incluye SOLO marcas de ESE país; descarta las extranjeras/internacionales.
- NO incluyas el medio/blog que publica la nota, ni secciones genéricas del sitio, ni nombres que no sean una marca.`
}

export interface MarcaDescubierta {
  nombre: string
  sitio: string | null
  fuente: string
}

export async function descubrirMarcas(
  sector: string,
  apiKey: string,
  maxFuentes = 5,
): Promise<{ marcas: MarcaDescubierta[]; fuentes: number }> {
  // 1) Buscar fuentes curadas (acá SÍ queremos listicles/guías como materia prima).
  const queries = [`mejores marcas ${sector}`, `${sector} marcas recomendadas`, sector]
  const urls = new Set<string>()
  const fuentes: string[] = []
  for (const q of queries) {
    if (fuentes.length >= maxFuentes) break
    try {
      const sr = await fcPost('/search', { query: q, limit: 6, location: 'Chile' }, apiKey)
      const rs: any[] = Array.isArray(sr.data) ? sr.data : (sr.data?.web || [])
      for (const r of rs) {
        const o = origen(r.url || '')
        if (!o || urls.has(o)) continue
        if (/youtube|facebook|instagram|tiktok|x\.com|pinterest/i.test(r.url)) continue
        urls.add(o)
        fuentes.push(r.url)
        if (fuentes.length >= maxFuentes) break
      }
    } catch {
      /* ignore */
    }
  }

  // 2) Scrapear cada fuente en paralelo y extraer la lista de marcas (LLM).
  const extr = await Promise.all(
    fuentes.map(u =>
      fcPost('/scrape', { url: u, formats: [{ type: 'json', prompt: marcasPrompt(sector), schema: MARCAS_SCHEMA }] }, apiKey)
        .then(sc => ({ u, marcas: (sc.data?.json?.marcas as any[]) || [] }))
        .catch(() => ({ u, marcas: [] as any[] })),
    ),
  )

  // 3) Agregar y deduplicar por nombre.
  const map = new Map<string, MarcaDescubierta>()
  for (const e of extr) {
    for (const m of e.marcas) {
      const nombre = (m?.nombre || '').trim()
      if (!nombre || nombre.length < 2) continue
      const k = deaccent(nombre)
      let sitio: string | null = (m?.sitio || '').trim() || null
      if (sitio && /^(n\/?a|na|-|—|none|no|sin sitio|s\/i)$/i.test(sitio)) sitio = null
      if (!map.has(k)) map.set(k, { nombre, sitio, fuente: e.u })
      else if (!map.get(k)!.sitio && sitio) map.get(k)!.sitio = sitio
    }
  }
  return { marcas: [...map.values()], fuentes: fuentes.length }
}
