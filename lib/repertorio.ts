// Repertorio (CH-10): el cuerpo de obra de Casa Hiedra, con links vivos.
// Lógica PURA compartida por la UI (session) y los endpoints de agente (admin).

export type EstadoLink = 'vivo' | 'muerto' | 'sin_revisar'

export interface LinkTrabajo {
  url: string
  titulo?: string | null
  plataforma?: string | null   // youtube | instagram | sitio | vimeo | otro
  estado: EstadoLink
  revisado_en?: string | null  // YYYY-MM-DD
}

export interface Trabajo {
  id: string
  marca: string
  rubro?: string | null
  escala?: 'grande' | 'chica' | null
  anio?: number | null
  formato?: string | null
  descripcion?: string | null
  links: LinkTrabajo[]
  mostrable: boolean
  notas?: string | null
  revisado_en?: string | null
  created_at?: string
  updated_at?: string
}

export const FORMATOS_TRABAJO = ['banco', 'lookbook', 'spot', 'otro'] as const
export const ESCALAS_TRABAJO = ['grande', 'chica'] as const

export const ESCALA_LABELS: Record<string, string> = {
  grande: 'Grande',
  chica:  'Chica',
}

export const ESTADO_LINK_LABELS: Record<EstadoLink, string> = {
  vivo:        'Vivo',
  muerto:      'Roto',
  sin_revisar: 'Sin revisar',
}

/** Sólo http(s). Evita que un `javascript:` o un `file:` entre a la tabla. */
export function urlValida(u: unknown): u is string {
  if (typeof u !== 'string') return false
  try {
    const p = new URL(u.trim())
    return p.protocol === 'http:' || p.protocol === 'https:'
  } catch {
    return false
  }
}

/** Adivina la plataforma desde el host, para no pedírsela al operador. */
export function plataformaDe(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    if (h.endsWith('youtube.com') || h === 'youtu.be') return 'youtube'
    if (h.endsWith('instagram.com')) return 'instagram'
    if (h.endsWith('vimeo.com')) return 'vimeo'
    if (h.endsWith('tiktok.com')) return 'tiktok'
    return 'sitio'
  } catch {
    return 'otro'
  }
}

/**
 * Normaliza lo que llega del operador a `LinkTrabajo[]`.
 * Acepta strings sueltos o objetos; descarta lo que no sea http(s) y deduplica
 * por URL — el operador corre la actualización más de una vez.
 */
export function normalizarLinks(raw: unknown): { links: LinkTrabajo[]; descartados: string[] } {
  const entrada = Array.isArray(raw) ? raw : []
  const links: LinkTrabajo[] = []
  const descartados: string[] = []
  const vistos = new Set<string>()

  for (const item of entrada) {
    const url = typeof item === 'string' ? item.trim() : String((item as any)?.url ?? '').trim()
    if (!urlValida(url)) {
      if (url) descartados.push(url)
      continue
    }
    if (vistos.has(url)) continue
    vistos.add(url)

    const o = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>

    // El estado sólo se conserva si viene acompañado de la fecha en que se
    // revisó — es decir, si salió de una revisión real y no de la palabra de
    // quien escribe. Así un round-trip (editar la descripción de un trabajo ya
    // revisado) no pierde el resultado, pero nadie puede declarar "vivo" a mano.
    const revisadoEn = typeof o.revisado_en === 'string' && o.revisado_en.trim() ? o.revisado_en.trim() : null
    const declarado = o.estado
    const verificado = revisadoEn && (declarado === 'vivo' || declarado === 'muerto')

    links.push({
      url,
      titulo: typeof o.titulo === 'string' && o.titulo.trim() ? o.titulo.trim().slice(0, 200) : null,
      plataforma: typeof o.plataforma === 'string' && o.plataforma.trim()
        ? o.plataforma.trim().toLowerCase()
        : plataformaDe(url),
      estado: verificado ? (declarado as EstadoLink) : 'sin_revisar',
      revisado_en: verificado ? revisadoEn : null,
    })
  }

  return { links, descartados }
}

/** Trabajos utilizables como credencial: mostrables y con al menos un link no roto. */
export function utilizables(trabajos: Trabajo[]): Trabajo[] {
  return trabajos.filter(t => t.mostrable && t.links.some(l => l.estado !== 'muerto'))
}

/** Cuántos links rotos hay en total — lo que dispara la próxima revisión. */
export function contarRotos(trabajos: Trabajo[]): number {
  return trabajos.reduce((n, t) => n + t.links.filter(l => l.estado === 'muerto').length, 0)
}

/**
 * El par de credenciales para un correo: una grande y una chica del mismo
 * rubro. Es la consulta para la que existe esta tabla.
 *
 * Si no hay del rubro, cae a cualquier rubro antes que devolver nada: una
 * credencial de otro rubro sirve más que ninguna, y quien escribe decide.
 */
export function parDeCredenciales(
  trabajos: Trabajo[],
  rubro?: string | null,
): { grande: Trabajo | null; chica: Trabajo | null; delRubro: boolean } {
  const pool = utilizables(trabajos)
  const r = (rubro ?? '').trim().toLowerCase()
  const mismos = r ? pool.filter(t => (t.rubro ?? '').toLowerCase() === r) : []
  const usar = mismos.length > 0 ? mismos : pool

  const reciente = (a: Trabajo, b: Trabajo) => (b.anio ?? 0) - (a.anio ?? 0)
  return {
    grande: usar.filter(t => t.escala === 'grande').sort(reciente)[0] ?? null,
    chica: usar.filter(t => t.escala === 'chica').sort(reciente)[0] ?? null,
    delRubro: mismos.length > 0,
  }
}
