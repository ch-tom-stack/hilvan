'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { RentalReserva, EstadoRental } from '@/types'

// ─── Listar todas las reservas con joins ─────────────────────────────────────

export async function listarRentalReservas(): Promise<(RentalReserva & {
  equipo?: { codigo: string; nombre: string } | null
  maleta?: { codigo: string; nombre: string } | null
  cliente?: { nombre: string } | null
})[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rental_reservas')
    .select(`
      *,
      equipo:equipos(codigo, nombre),
      maleta:maletas(codigo, nombre),
      cliente:clientes(nombre)
    `)
    .order('fecha_inicio', { ascending: false })

  if (error) return []
  return data as any
}

// ─── Crear reserva ────────────────────────────────────────────────────────────

export async function crearRentalReserva(payload: {
  equipo_id?: string | null
  maleta_id?: string | null
  cliente_id?: string | null
  fecha_inicio: string
  fecha_fin: string
  notas?: string | null
  cotizacion_id?: string | null
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('rental_reservas')
    .insert({
      ...payload,
      estado: 'pendiente',
    })

  if (error) return { error: error.message }
  revalidatePath('/equipos/reservas')
  return { ok: true }
}

// ─── Actualizar estado ────────────────────────────────────────────────────────

export async function actualizarEstadoReserva(
  id: string,
  estado: EstadoRental,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: self } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<{ rol: string }>()

  if (!self || !['admin', 'productor'].includes(self.rol)) {
    return { error: 'Sin permisos' }
  }

  const admin = createAdminClient()
  const updateData: Record<string, unknown> = { estado }
  if (estado === 'aprobada') updateData.aprobada_por = user.id

  const { error } = await admin
    .from('rental_reservas')
    .update(updateData)
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/equipos/reservas')
  return { ok: true }
}

// ─── Eliminar reserva ─────────────────────────────────────────────────────────

export async function eliminarReserva(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: self } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<{ rol: string }>()

  if (!self || !['admin', 'productor'].includes(self.rol)) {
    return { error: 'Sin permisos' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('rental_reservas')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/equipos/reservas')
  return { ok: true }
}
