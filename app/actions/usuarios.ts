'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Profile, Rol } from '@/types'

export async function listarUsuarios(): Promise<Profile[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) return []
  return data as Profile[]
}

export async function actualizarRol(
  userId: string,
  nuevoRol: Rol,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()

  // Solo admins pueden cambiar roles
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: self } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<Pick<Profile, 'rol'>>()

  if (self?.rol !== 'admin') return { error: 'Sin permisos' }

  const { error } = await supabase
    .from('profiles')
    .update({ rol: nuevoRol })
    .eq('id', userId)

  if (error) return { error: error.message }

  revalidatePath('/usuarios')
  return { ok: true }
}
