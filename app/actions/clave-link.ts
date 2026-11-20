'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { crearLinkClave, enviarLinkClavePorCorreo, leerClaveLink, consumirClaveLink } from '@/lib/clave-link-io'
import { validarNuevaClave } from '@/lib/clave-link'
import type { Profile } from '@/types'

async function soloAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'No autenticado'
  const { data: self } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<Pick<Profile, 'rol'>>()
  if (self?.rol !== 'admin') return 'Sin permisos'
  return null
}

/**
 * Genera el link para que el usuario defina su contraseña (reemplaza al
 * anterior). Con `enviarCorreo`, además se lo manda a su email; si el correo
 * falla, el link igual queda generado y se devuelve para copiarlo.
 */
export async function generarLinkClave(
  userId: string,
  opciones: { enviarCorreo?: boolean; bienvenida?: boolean } = {},
): Promise<{ ok?: boolean; error?: string; url?: string; expira?: string; correo?: 'enviado' | 'fallido' }> {
  const sinPermiso = await soloAdmin()
  if (sinPermiso) return { error: sinPermiso }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error || !data.user) return { error: 'Usuario no encontrado' }

  let link
  try {
    link = await crearLinkClave(admin, userId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo generar el link' }
  }

  let correo: 'enviado' | 'fallido' | undefined
  if (opciones.enviarCorreo && data.user.email) {
    const { data: perfil } = await admin
      .from('profiles').select('nombre').eq('id', userId).maybeSingle<{ nombre: string | null }>()
    try {
      await enviarLinkClavePorCorreo({ email: data.user.email, nombre: perfil?.nombre || undefined }, link, !!opciones.bienvenida)
      correo = 'enviado'
    } catch (e) {
      console.error('[clave-link] no se pudo enviar el correo:', e)
      correo = 'fallido'
    }
  }

  return { ok: true, url: link.url, expira: link.expira, correo }
}

/**
 * Pública (sin sesión): el secreto del link ES la autorización. Valida el link
 * de nuevo, fija la contraseña, borra el link y deja la sesión iniciada.
 */
export async function definirClaveConLink(
  token: string,
  clave: string,
  repetida: string,
): Promise<{ ok?: boolean; error?: string; sesion?: boolean }> {
  const invalida = validarNuevaClave(String(clave ?? ''), String(repetida ?? ''))
  if (invalida) return { error: invalida }

  const link = await leerClaveLink(String(token ?? ''))
  if (link.estado === 'vencido') return { error: 'El link venció. Pide uno nuevo a quien te lo mandó.' }
  if (link.estado !== 'valido' || !link.userId) return { error: 'El link no es válido o ya se usó.' }

  try {
    await consumirClaveLink(link.userId, clave)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/weak|pwned|leaked/i.test(msg)) return { error: 'Esa contraseña es demasiado débil o conocida. Prueba otra.' }
    return { error: 'No se pudo guardar la contraseña. Intenta de nuevo.' }
  }

  // Deja la sesión iniciada. Si falla, la contraseña igual quedó guardada.
  let sesion = false
  if (link.email) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.auth.signInWithPassword({ email: link.email, password: clave })
      sesion = !error
    } catch (e) {
      console.error('[clave-link] no se pudo iniciar sesión tras definir la clave:', e)
    }
  }

  return { ok: true, sesion }
}
