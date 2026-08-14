'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Registra que alguien cruzó desde Hilván a otra app de Casa Hiedra.
 *
 * QUÉ MIDE, CON PRECISIÓN: el clic en el enlace. Hilván no puede saber si la
 * otra app cargó — vive en otro dominio y no comparte sesión ni base. Registrar
 * "visitó Bastidor" sería afirmar algo que no sabemos; registramos el cruce,
 * que es lo que de verdad ocurre de este lado de la puerta.
 *
 * Nunca lanza: fallar acá no puede impedir que el enlace se abra. La medalla es
 * el adorno, ir a la otra app es lo que la persona vino a hacer.
 */
export async function registrarPuente(destino: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const d = destino.trim().toLowerCase()
    if (!/^[a-z0-9_-]{2,30}$/.test(d)) return

    const { data: previo } = await supabase
      .from('puentes')
      .select('id, veces')
      .eq('persona_id', user.id)
      .eq('destino', d)
      .maybeSingle()

    if (previo) {
      await supabase
        .from('puentes')
        .update({ veces: previo.veces + 1, ultima: new Date().toISOString() })
        .eq('id', previo.id)
    } else {
      await supabase.from('puentes').insert({ persona_id: user.id, destino: d })
    }
  } catch {
    // Silencio deliberado: ver el comentario de arriba.
  }
}
