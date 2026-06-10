import { createClient } from '@/lib/supabase/server'

/**
 * Verifica que hay una sesión activa. Lanza Error('Sin permisos') si no.
 * Usar al inicio de toda server action mutadora (regla de auditoría, CLAUDE.md).
 */
export async function requireSesion(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sin permisos')
}

/**
 * Verifica que hay una sesión activa y que el usuario tiene alguno de los roles
 * indicados. Lanza Error('Sin permisos') si no se cumple alguna condición.
 * Usa createClient() (respeta RLS en profiles) — no el admin client.
 */
export async function requireRol(roles: string[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sin permisos')
  const { data: profile } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single()
  if (!profile || !roles.includes(profile.rol)) throw new Error('Sin permisos')
}
