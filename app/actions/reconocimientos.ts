'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface Reconocimiento {
  id: string
  persona_id: string
  persona: string
  otorgado_por_nombre: string
  titulo: string
  texto: string
  imagen_url?: string | null
  created_at: string
  visto_en?: string | null
}

/**
 * Los reconocimientos del equipo, para todos.
 *
 * **Es lo único que ve todo el mundo.** Las medallas y las misiones diarias de
 * cada uno siguen siendo de cada uno: lo especial se ve, lo diario no. Sin ese
 * umbral el muro se llena de logros menores ajenos y se vuelve una tabla de
 * comparación, que es justo lo que este sistema evita.
 */
export async function getReconocimientos(limite = 12): Promise<Reconocimiento[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('reconocimientos')
    .select('*, persona:profiles!reconocimientos_persona_id_fkey(nombre, email), autor:profiles!reconocimientos_otorgado_por_fkey(nombre, email)')
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error || !data) return []

  return (data as any[]).map(r => ({
    id: r.id,
    persona_id: r.persona_id,
    persona: r.persona?.nombre ?? r.persona?.email ?? '—',
    otorgado_por_nombre: r.autor?.nombre ?? r.autor?.email ?? '—',
    titulo: r.titulo,
    texto: r.texto,
    imagen_url: r.imagen_url,
    created_at: r.created_at,
    visto_en: r.visto_en,
  }))
}

/**
 * Menciones que esta persona todavía no ha visto — sean de quien sean.
 *
 * Una mención es un reconocimiento PÚBLICO: el pergamino se le abre a todo el
 * equipo, no sólo a quien la recibe. Reconocer a alguien delante de los demás
 * es la mitad del gesto; en privado sería un mensaje, no un reconocimiento.
 *
 * Por eso "visto" es una relación entre la mención y cada persona, y no una
 * columna de la mención: con `visto_en` en la fila, el primero en entrar la
 * marcaba vista y los demás no la veían nunca.
 */
export async function getReconocimientosSinVer(): Promise<Reconocimiento[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: vistos } = await supabase
    .from('reconocimientos_vistos')
    .select('reconocimiento_id')
    .eq('persona_id', user.id)

  const yaVistos = new Set((vistos ?? []).map(v => v.reconocimiento_id))

  const { data, error } = await supabase
    .from('reconocimientos')
    .select('*, persona:profiles!reconocimientos_persona_id_fkey(nombre, email), autor:profiles!reconocimientos_otorgado_por_fkey(nombre, email)')
    .order('created_at')
    .limit(20)

  if (error || !data) return []

  return (data as any[])
    .filter(r => !yaVistos.has(r.id))
    .map(r => ({
      id: r.id,
      persona_id: r.persona_id,
      persona: r.persona?.nombre ?? r.persona?.email ?? '—',
      otorgado_por_nombre: r.autor?.nombre ?? r.autor?.email ?? '—',
      titulo: r.titulo,
      texto: r.texto,
      imagen_url: r.imagen_url,
      created_at: r.created_at,
      visto_en: null,
    }))
}

/** Marca vistas para quien está en sesión. Cada uno marca las suyas. */
export async function marcarVisto(ids: string[]) {
  if (ids.length === 0) return { ok: true }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sin sesión' }

  const { error } = await supabase
    .from('reconocimientos_vistos')
    .upsert(
      ids.map(reconocimiento_id => ({ reconocimiento_id, persona_id: user.id })),
      { onConflict: 'reconocimiento_id,persona_id', ignoreDuplicates: true },
    )

  return error ? { error: 'No se pudo guardar' } : { ok: true }
}

/** Las personas a las que se le puede escribir un reconocimiento. */
export async function getDestinatarios(): Promise<{ id: string; nombre: string }[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: perfil } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return []

  const { data } = await supabase
    .from('profiles').select('id, nombre, email').order('nombre')

  return (data ?? [])
    .filter(p => p.id !== user.id)
    .map(p => ({ id: p.id, nombre: p.nombre || p.email }))
}

/**
 * Escribir un reconocimiento.
 *
 * Solo admin, y con motivo obligatorio: un reconocimiento sin texto es una
 * palmada en la espalda —se agradece y se olvida—. Lo que lo hace valer es que
 * alguien se sentó a escribir por qué.
 */
export async function crearReconocimiento(
  persona_id: string, titulo: string, texto: string, imagen_url?: string | null,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sin sesión' }

  const { data: perfil } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return { error: 'No autorizado' }

  const t = titulo.trim()
  const x = texto.trim()
  if (!persona_id) return { error: 'Falta a quién' }
  if (!t) return { error: 'Falta el título' }
  if (x.length < 15) return { error: 'Escribe el motivo — es lo que lo hace valer' }

  const { error } = await supabase
    .from('reconocimientos')
    .insert({ persona_id, otorgado_por: user.id, titulo: t, texto: x, imagen_url: imagen_url || null })

  if (error) return { error: 'No se pudo guardar' }

  revalidatePath('/dashboard')
  revalidatePath('/perfil')
  return { ok: true }
}

/**
 * Sube la imagen de una mención.
 *
 * Llega ya reducida y convertida a PNG desde el cliente, así que la lista
 * blanca es de uno: lo que no genere el navegador no entra. Con eso el tope de
 * tamaño alcanza como única defensa —el archivo original puede pesar 40 MB y
 * llegar acá pesando 300 KB— y no hay que confiar en la extensión de un nombre.
 */
export async function subirImagenReconocimiento(dataUrl: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sin sesión' }

  const { data: perfil } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return { error: 'No autorizado' }

  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
  if (!m) return { error: 'Formato inválido' }

  const buf = Buffer.from(m[1], 'base64')
  if (buf.length > 4 * 1024 * 1024) return { error: 'La imagen quedó muy grande' }

  const nombre = `${user.id}/${crypto.randomUUID()}.png`
  const { error } = await supabase.storage
    .from('reconocimientos')
    .upload(nombre, buf, { contentType: 'image/png', upsert: false })

  // El mensaje real, no uno genérico: la primera vez que esto falló fue por
  // políticas de Storage y el error envuelto no dejaba verlo.
  if (error) return { error: `No se pudo subir: ${error.message}` }

  const { data } = supabase.storage.from('reconocimientos').getPublicUrl(nombre)
  return { url: data.publicUrl }
}
