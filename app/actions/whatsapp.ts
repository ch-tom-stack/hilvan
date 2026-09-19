'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolverDesconocido } from '@/lib/whatsapp-io'

// WhatsApp → CRM, el lado de las personas: decidir de quién es un número que
// cayó en cuarentena. Las tablas de WhatsApp no tienen políticas RLS (solo
// service role), así que TODO pasa por acá con sesión y rol verificados antes.

export interface WhatsappDesconocido {
  telefono: string
  nombre_perfil: string | null
  primer_mensaje: string
  ultimo_mensaje: string
  mensajes: number
}

async function accesoCrm(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: self } = await supabase.from('profiles').select('rol').eq('id', user.id).single<{ rol: string }>()
  return !!self && ['admin', 'productor'].includes(self.rol)
}

export async function getWhatsappDesconocidos(): Promise<WhatsappDesconocido[]> {
  if (!(await accesoCrm())) return []
  const { data, error } = await createAdminClient()
    .from('whatsapp_desconocidos')
    .select('telefono, nombre_perfil, primer_mensaje, ultimo_mensaje, mensajes')
    .eq('estado', 'pendiente')
    .order('ultimo_mensaje', { ascending: false })
    .limit(50)
  // Si el número todavía no está conectado (o la tabla no existe) el CRM se ve
  // igual que siempre: esto es un aviso, no puede tumbar el tablero.
  if (error) return []
  return (data ?? []) as WhatsappDesconocido[]
}

export async function resolverWhatsappDesconocido(input: {
  telefono: string
  accion: 'vincular' | 'ignorar'
  prospecto_id?: string
  nombre?: string
}): Promise<{ ok: true; empresa?: string } | { ok: false; error: string }> {
  if (!(await accesoCrm())) return { ok: false, error: 'Sin permisos' }
  if (input.accion !== 'vincular' && input.accion !== 'ignorar') return { ok: false, error: 'Acción inválida' }

  const res = await resolverDesconocido(createAdminClient(), input)
  if (!res.ok) return { ok: false, error: res.error }

  revalidatePath('/crm')
  if (res.prospecto_id) revalidatePath(`/crm/${res.prospecto_id}`)
  return { ok: true, empresa: res.respuesta.empresa as string | undefined }
}
