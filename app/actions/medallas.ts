'use server'

import { createClient } from '@/lib/supabase/server'
import { temperaturaDe } from '@/lib/crm-temperatura'
import { medallasCumplidas, type DatosMedallas } from '@/lib/crm-medallas'

// OJO: archivo 'use server'. Todo export tiene que ser una función async —
// exportar una constante invalida el módulo entero y el build falla señalando
// archivos que no tienen nada que ver. Las constantes van en lib/crm-medallas.ts.

export interface EstadoMedallas {
  datos: DatosMedallas
  /** Claves ya registradas, con la fecha en que se ganaron. */
  ganadas: { medalla: string; ganada_en: string }[]
  /** Las que se acaban de registrar en ESTA llamada: hay que celebrarlas. */
  nuevas: string[]
}

const VACIO: DatosMedallas = {
  contactos: 0, diasActivos: 0, marcasTocadas: 0, tuvoRespuesta: false,
  cierres: 0, cierresFrios: 0, maxToquesEnUnaMarca: 0,
}

/**
 * Estado de medallas del usuario en sesión. Registra las que acaba de cumplir
 * y devuelve cuáles son nuevas, para celebrarlas una sola vez.
 *
 * Es idempotente: el índice único (profile_id, medalla) hace que llamarla en
 * cada carga no duplique ni vuelva a celebrar.
 */
export async function revisarMedallas(): Promise<EstadoMedallas> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { datos: VACIO, ganadas: [], nuevas: [] }

  const [{ data: toques }, { data: mios }] = await Promise.all([
    // Sólo los contactos que registró ESTA persona. Los anteriores a la columna
    // tienen registrado_por NULL y no cuentan para nadie — atribuirlos sería
    // inventar el dato.
    supabase
      .from('crm_interacciones')
      .select('prospecto_id, fecha, respondido')
      .eq('registrado_por', user.id),
    // Los cierres se atribuyen por responsable: el prospecto ES suyo.
    supabase
      .from('prospectos')
      .select('id, etapa, origen')
      .eq('responsable_id', user.id),
  ])

  const filas = toques ?? []
  const porMarca = new Map<string, number>()
  for (const t of filas) {
    porMarca.set(t.prospecto_id, (porMarca.get(t.prospecto_id) ?? 0) + 1)
  }

  const confirmados = (mios ?? []).filter(p => p.etapa === 'confirmado')

  const datos: DatosMedallas = {
    contactos: filas.length,
    diasActivos: new Set(filas.map(t => t.fecha).filter(Boolean)).size,
    marcasTocadas: porMarca.size,
    tuvoRespuesta: filas.some(t => t.respondido),
    cierres: confirmados.length,
    cierresFrios: confirmados.filter(p => temperaturaDe(p.origen) === 'frio').length,
    maxToquesEnUnaMarca: porMarca.size ? Math.max(...porMarca.values()) : 0,
  }

  const { data: yaTiene } = await supabase
    .from('crm_medallas')
    .select('medalla, ganada_en')
    .eq('profile_id', user.id)

  const registradas = new Set((yaTiene ?? []).map(m => m.medalla))
  const nuevas = medallasCumplidas(datos).filter(m => !registradas.has(m))

  if (nuevas.length > 0) {
    // `ignoreDuplicates` para que dos pestañas abiertas no se peleen: si otra
    // llamada ya la insertó, esta no falla — pero tampoco la reporta como nueva
    // dos veces, porque cada una calculó su propio diff contra lo registrado.
    const { error } = await supabase
      .from('crm_medallas')
      .upsert(
        nuevas.map(medalla => ({ profile_id: user.id, medalla })),
        { onConflict: 'profile_id,medalla', ignoreDuplicates: true },
      )
    if (error) {
      console.error('[medallas] no se pudieron registrar:', error.message)
      return { datos, ganadas: yaTiene ?? [], nuevas: [] }
    }
  }

  const { data: finales } = await supabase
    .from('crm_medallas')
    .select('medalla, ganada_en')
    .eq('profile_id', user.id)
    .order('ganada_en', { ascending: false })

  return { datos, ganadas: finales ?? [], nuevas }
}
