'use server'

import { createClient } from '@/lib/supabase/server'
import type { Trabajo } from '@/lib/repertorio'

/**
 * Repertorio para la UI. Lectura con sesión: la escritura la hace el operador
 * por /api/agent/crm/repertorio, que es donde vive la validación.
 */
export async function getRepertorio(): Promise<Trabajo[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('repertorio')
    .select('*')
    .order('rubro', { ascending: true, nullsFirst: false })
    .order('anio', { ascending: false, nullsFirst: false })

  if (error) {
    console.error('[repertorio] no se pudo leer:', error.message)
    return []
  }

  return (data ?? []).map(t => ({
    ...t,
    links: Array.isArray(t.links) ? t.links : [],
  })) as Trabajo[]
}
