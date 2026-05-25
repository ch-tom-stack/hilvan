'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { randomBytes } from 'crypto'
import type { Profile, Rol } from '@/types'

function generarPasswordTemporal(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  const bytes = randomBytes(12)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

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
): Promise<{ ok?: boolean; error?: string; password?: string }> {
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
  const passwordTemporal = generarPasswordTemporal()

  // Crear usuario con contraseña temporal (sin enviar email)
  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    password: passwordTemporal,
    email_confirm: true,
    user_metadata: { nombre, rol },
  })

  if (createError) {
    if (createError.message.toLowerCase().includes('already')) {
      return { error: 'Ya existe una cuenta con ese email' }
    }
    return { error: createError.message }
  }

  // Crear el profile con nombre y rol
  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      { id: data.user.id, email: data.user.email!, nombre, rol },
      { onConflict: 'id' },
    )

  if (profileError) return { error: profileError.message }

  revalidatePath('/usuarios')
  return { ok: true, password: passwordTemporal }
}
