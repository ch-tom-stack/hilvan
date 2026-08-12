'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  type Mision, diariaVigente, lunesDeLaSemana, hoyChile,
} from '@/lib/misiones'

export interface MisionVista extends Mision {
  /** Sigue viva hoy. Se calcula al leer, nunca se guarda — ver sql/misiones.sql. */
  vigente: boolean
}

export interface MisionesPersona {
  persona_id: string
  nombre: string
  semanal: MisionVista | null
  diarias: MisionVista[]
}

/**
 * Qué se muestra y qué no.
 *
 * Se muestran las vivas y las cumplidas; se esconden las que vencieron sin
 * cumplirse. **Vencer es silencioso**: un listado de lo que no se hizo es un
 * reproche diario, y es como estos sistemas se vuelven insoportables. La fila
 * queda en la tabla —sirve para saber qué se propuso— pero no se exhibe.
 */
function visibles(filas: Mision[], email: string, hoy: string): MisionVista[] {
  return filas
    .map(m => ({
      ...m,
      vigente: m.tipo === 'semanal'
        ? m.fecha_objetivo === lunesDeLaSemana(hoy)
        : diariaVigente(email, m.fecha_objetivo, hoy),
    }))
    .filter(m => m.cumplida_en || m.vigente)
    .sort((a, b) => a.fecha_objetivo.localeCompare(b.fecha_objetivo))
}

/** Las misiones de la semana en curso de quien está en sesión. */
export async function getMisMisiones(): Promise<MisionesPersona | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  const hoy = hoyChile()
  const lunes = lunesDeLaSemana(hoy)

  const { data, error } = await supabase
    .from('misiones')
    .select('*')
    .eq('persona_id', user.id)
    .gte('fecha_objetivo', lunes)
    .order('fecha_objetivo')

  if (error) return null

  const vistas = visibles((data ?? []) as Mision[], user.email, hoy)
  return {
    persona_id: user.id,
    nombre: '',
    semanal: vistas.find(m => m.tipo === 'semanal') ?? null,
    diarias: vistas.filter(m => m.tipo === 'diaria'),
  }
}

/**
 * Declarar una misión cumplida.
 *
 * Solo la persona dueña de la misión, nunca otra y nunca el sistema: eso es lo
 * que la hace honor system. Un admin marcando cumplida la misión de alguien más
 * convertiría esto en supervisión.
 */
export async function declararCumplida(id: string, cumplida: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sin sesión' }

  const { data: mision } = await supabase
    .from('misiones')
    .select('persona_id')
    .eq('id', id)
    .single()

  if (!mision) return { error: 'No existe' }
  if (mision.persona_id !== user.id) return { error: 'No es tuya' }

  const { error } = await supabase
    .from('misiones')
    .update({ cumplida_en: cumplida ? new Date().toISOString() : null })
    .eq('id', id)

  if (error) return { error: 'No se pudo guardar' }

  revalidatePath('/perfil')
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Las misiones de todo el equipo, para admin.
 *
 * Sin totales ni conteos por persona a propósito: dos números comparables son
 * un ranking con otro nombre, y acá no se compara a las personas.
 */
export async function getMisionesEquipo(): Promise<MisionesPersona[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: perfil } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return []

  const hoy = hoyChile()
  const lunes = lunesDeLaSemana(hoy)

  const { data, error } = await supabase
    .from('misiones')
    .select('*, persona:profiles!misiones_persona_id_fkey(nombre, email)')
    .gte('fecha_objetivo', lunes)
    .order('fecha_objetivo')

  if (error || !data) return []

  const porPersona = new Map<string, { nombre: string; email: string; filas: Mision[] }>()
  for (const fila of data as any[]) {
    const p: { nombre: string; email: string; filas: Mision[] } =
      porPersona.get(fila.persona_id) ?? {
        nombre: fila.persona?.nombre ?? fila.persona?.email ?? '—',
        email: fila.persona?.email ?? '',
        filas: [],
      }
    p.filas.push(fila as Mision)
    porPersona.set(fila.persona_id, p)
  }

  return [...porPersona.entries()].map(([persona_id, p]) => {
    const vistas = visibles(p.filas, p.email, hoy)
    return {
      persona_id,
      nombre: p.nombre,
      semanal: vistas.find(m => m.tipo === 'semanal') ?? null,
      diarias: vistas.filter(m => m.tipo === 'diaria'),
    }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre))
}
