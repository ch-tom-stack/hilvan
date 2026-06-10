'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { RodajeLocacion, RodajeBloque, PLANTILLAS_BLOQUES } from '@/types'

// ─── LOCACIONES ───────────────────────────────────────────────────────────────

export async function getLocaciones(rodajeId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rodaje_locaciones')
    .select('*')
    .eq('rodaje_id', rodajeId)
    .order('orden')
  if (error) throw error
  return data as RodajeLocacion[]
}

export async function crearLocacion(rodajeId: string, payload: {
  nombre: string
  direccion?: string
  lat?: number
  lng?: number
  es_principal?: boolean
  notas?: string
}) {
  const supabase = await createClient()

  const { data: existentes } = await supabase
    .from('rodaje_locaciones')
    .select('orden')
    .eq('rodaje_id', rodajeId)
    .order('orden', { ascending: false })
    .limit(1)

  const orden = existentes?.length ? existentes[0].orden + 1 : 0

  if (payload.es_principal) {
    await supabase
      .from('rodaje_locaciones')
      .update({ es_principal: false })
      .eq('rodaje_id', rodajeId)
  }

  const { data, error } = await supabase
    .from('rodaje_locaciones')
    .insert({ rodaje_id: rodajeId, orden, ...payload })
    .select()
    .single()
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}`)
  return data as RodajeLocacion
}

export async function actualizarLocacion(id: string, rodajeId: string, payload: Partial<RodajeLocacion>) {
  const supabase = await createClient()

  if (payload.es_principal) {
    await supabase
      .from('rodaje_locaciones')
      .update({ es_principal: false })
      .eq('rodaje_id', rodajeId)
  }

  const { error } = await supabase
    .from('rodaje_locaciones')
    .update(payload)
    .eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}`)
}

export async function eliminarLocacion(id: string, rodajeId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('rodaje_locaciones').delete().eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}`)
}

// ─── GEOCODING ────────────────────────────────────────────────────────────────

export async function geocodificarDireccion(
  direccion: string
): Promise<{ lat: number; lng: number; display: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(direccion)}&format=json&limit=1&countrycodes=cl`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Hilvan/1.0 (casahiedra.com)' },
    })
    const data = await res.json()
    if (!data || data.length === 0) return null
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      display: data[0].display_name,
    }
  } catch {
    return null
  }
}

// ─── BLOQUES ──────────────────────────────────────────────────────────────────

export async function getBloques(rodajeId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rodaje_bloques')
    .select('*, locacion:rodaje_locaciones(id, nombre)')
    .eq('rodaje_id', rodajeId)
    .order('orden')
  if (error) throw error
  return data as RodajeBloque[]
}

export async function crearBloque(
  rodajeId: string,
  payload: Partial<RodajeBloque> & { titulo: string }
) {
  const supabase = await createClient()

  const { data: existentes } = await supabase
    .from('rodaje_bloques')
    .select('orden')
    .eq('rodaje_id', rodajeId)
    .is('padre_id', payload.padre_id ?? null)
    .order('orden', { ascending: false })
    .limit(1)

  const orden = existentes?.length ? existentes[0].orden + 1 : 0

  const { data, error } = await supabase
    .from('rodaje_bloques')
    .insert({
      rodaje_id: rodajeId,
      orden,
      padre_id: payload.padre_id ?? null,
      titulo: payload.titulo,
      tipo: payload.tipo ?? 'rodaje',
      scenes_label: payload.scenes_label ?? null,
      scenes_color: payload.scenes_color ?? '#353135',
      character_num: payload.character_num ?? null,
      dia_noche: payload.dia_noche ?? 'D',
      interior_exterior: payload.interior_exterior ?? 'I',
      locacion_id: payload.locacion_id ?? null,
      descripcion: payload.descripcion ?? null,
      nota_previa: payload.nota_previa ?? null,
      hora_inicio_fija: payload.hora_inicio_fija ?? null,
      hora_fin: payload.hora_fin ?? null,
      duracion_min: payload.duracion_min ?? null,
      es_paralelo: payload.es_paralelo ?? false,
      es_anclado: payload.es_anclado ?? false,
      visible_equipo: payload.visible_equipo ?? true,
      visible_catering: payload.visible_catering ?? true,
      visible_extras: payload.visible_extras ?? false,
      visible_cliente: payload.visible_cliente ?? false,
    })
    .select()
    .single()
  if (error) throw error
  return data as RodajeBloque
}

export async function crearBloqueDesdePlantilla(
  rodajeId: string,
  plantillaLabel: string
) {
  const plantilla = PLANTILLAS_BLOQUES.find(p => p.label === plantillaLabel)
  if (!plantilla) throw new Error('Plantilla no encontrada')

  return crearBloque(rodajeId, {
    titulo: plantilla.titulo,
    tipo: plantilla.tipo,
    scenes_label: plantilla.label,
    scenes_color: plantilla.scenes_color,
    dia_noche: plantilla.dia_noche,
    interior_exterior: plantilla.interior_exterior,
    duracion_min: plantilla.duracion_min,
  })
}

/**
 * Guarda múltiples bloques de una vez (para auto-save de cascada)
 */
export async function guardarBloques(
  rodajeId: string,
  bloques: Array<{
    id: string
    hora_inicio_fija?: string | null
    hora_fin?: string | null
    duracion_min?: number | null
    es_anclado?: boolean
    orden?: number
    titulo?: string
    tipo?: string
    scenes_label?: string | null
    scenes_color?: string | null
    character_num?: string | null
    dia_noche?: string | null
    interior_exterior?: string | null
    locacion_id?: string | null
    descripcion?: string | null
    nota_previa?: string | null
    es_paralelo?: boolean
    visible_equipo?: boolean
    visible_catering?: boolean
    visible_extras?: boolean
    visible_cliente?: boolean
  }>
) {
  const supabase = await createClient()
  const reales = bloques.filter(b => !b.id.startsWith('temp-'))
  if (reales.length === 0) { revalidatePath(`/rodaje/${rodajeId}`); return }

  const resultados = await Promise.allSettled(
    reales.map(({ id, ...resto }) =>
      supabase
        .from('rodaje_bloques')
        .update(resto)
        .eq('id', id)
        .then(({ error }) => {
          if (error) throw new Error(error.message)
        })
    )
  )

  revalidatePath(`/rodaje/${rodajeId}`)

  const fallidos = resultados.filter((r) => r.status === 'rejected')
  if (fallidos.length > 0) {
    throw new Error(`No se pudieron guardar ${fallidos.length} de ${reales.length} bloques. Recarga e intenta de nuevo.`)
  }
}

export async function eliminarBloque(id: string, rodajeId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('rodaje_bloques').delete().eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}`)
}

export async function dividirBloque(id: string, rodajeId: string) {
  const supabase = await createClient()

  const { data: original } = await supabase
    .from('rodaje_bloques')
    .select('*')
    .eq('id', id)
    .single()

  if (!original) throw new Error('Bloque no encontrado')

  const mitad = Math.ceil((original.duracion_min ?? 30) / 2)
  const segunda = (original.duracion_min ?? 30) - mitad

  await supabase
    .from('rodaje_bloques')
    .update({ duracion_min: mitad })
    .eq('id', id)

  const { data: existentes } = await supabase
    .from('rodaje_bloques')
    .select('orden')
    .eq('rodaje_id', rodajeId)
    .order('orden', { ascending: false })
    .limit(1)

  const orden = existentes?.length ? existentes[0].orden + 1 : original.orden + 1

  await supabase.from('rodaje_bloques').insert({
    rodaje_id: rodajeId,
    padre_id: original.padre_id ?? null,
    orden,
    titulo: `${original.titulo} (cont.)`,
    tipo: original.tipo,
    scenes_label: original.scenes_label,
    scenes_color: original.scenes_color,
    dia_noche: original.dia_noche,
    interior_exterior: original.interior_exterior,
    locacion_id: original.locacion_id,
    duracion_min: segunda,
    es_paralelo: false,
    es_anclado: false,
    visible_equipo: original.visible_equipo,
    visible_catering: original.visible_catering,
    visible_extras: original.visible_extras,
    visible_cliente: original.visible_cliente,
  })

  revalidatePath(`/rodaje/${rodajeId}`)
}

// ─── CLIMA (Open-Meteo) ───────────────────────────────────────────────────────

export async function getClima(lat: number, lng: number, fecha: string): Promise<{
  temp_min: number
  temp_max: number
  condicion: string
  condicion_codigo: number
} | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=America%2FSantiago&start_date=${fecha}&end_date=${fecha}`
  try {
    const res = await fetch(url)
    const data = await res.json()
    if (!data?.daily?.temperature_2m_max?.[0]) return null

    const codigo = data.daily.weathercode[0]
    const condicion = interpretarCodigoClima(codigo)

    return {
      temp_min: Math.round(data.daily.temperature_2m_min[0]),
      temp_max: Math.round(data.daily.temperature_2m_max[0]),
      condicion,
      condicion_codigo: codigo,
    }
  } catch {
    return null
  }
}

function interpretarCodigoClima(codigo: number): string {
  if (codigo === 0) return 'Despejado'
  if (codigo <= 2) return 'Parcialmente nublado'
  if (codigo === 3) return 'Nublado'
  if (codigo <= 49) return 'Neblina'
  if (codigo <= 59) return 'Llovizna'
  if (codigo <= 69) return 'Lluvia'
  if (codigo <= 79) return 'Nieve'
  if (codigo <= 82) return 'Chubascos'
  if (codigo <= 99) return 'Tormenta'
  return 'Variable'
}

// ─── IMAGEN POR BLOQUE ────────────────────────────────────────────────────────

export async function actualizarImagenBloque(bloqueId: string, rodajeId: string, imagenUrl: string | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rodaje_bloques')
    .update({ imagen_url: imagenUrl })
    .eq('id', bloqueId)
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}`)
}

// ─── SUBIDA DE IMAGEN DEL CHISTE ─────────────────────────────────────────────

export async function subirImagenChiste(
  rodajeId: string,
  archivo: File
): Promise<string> {
  const supabase = await createClient()
  const ext = archivo.name.split('.').pop()
  const path = `${rodajeId}/chiste.${ext}`

  const { error } = await supabase.storage
    .from('rodajes')
    .upload(path, archivo, { upsert: true })
  if (error) throw error

  const { data } = supabase.storage.from('rodajes').getPublicUrl(path)
  return data.publicUrl
}
