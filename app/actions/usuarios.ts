'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

  // Usar admin client para bypassear RLS en el update
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ rol: nuevoRol })
    .eq('id', userId)

  if (error) return { error: error.message }

  revalidatePath('/usuarios')
  return { ok: true }
}

export async function invitarUsuario(
  email: string,
  nombre: string,
  rol: Rol,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()

  // Solo admins pueden invitar
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: self } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<Pick<Profile, 'rol'>>()

  if (self?.rol !== 'admin') return { error: 'Sin permisos' }

  const admin = createAdminClient()

  // Enviar invitación por email (Supabase Auth)
  const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nombre, rol },
  })

  if (inviteError) {
    // Supabase devuelve error genérico si el email ya existe
    if (inviteError.message.toLowerCase().includes('already')) {
      return { error: 'Ya existe una cuenta con ese email' }
    }
    return { error: inviteError.message }
  }

  // Crear el profile de inmediato con nombre y rol definidos
  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      { id: data.user.id, email: data.user.email!, nombre, rol },
      { onConflict: 'id' },
    )

  if (profileError) return { error: profileError.message }

  revalidatePath('/usuarios')
  return { ok: true }
}
