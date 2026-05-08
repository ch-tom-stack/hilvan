'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function actualizarNombre(nombre: string): Promise<{ ok?: boolean; error?: string }> {
  const trimmed = nombre.trim()
  if (!trimmed) return { error: 'El nombre no puede estar vacío' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('profiles')
    .update({ nombre: trimmed })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/perfil')
  return { ok: true }
}

export async function cambiarPassword(newPassword: string): Promise<{ ok?: boolean; error?: string }> {
  if (newPassword.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: newPassword })

  if (error) return { error: error.message }
  return { ok: true }
}
