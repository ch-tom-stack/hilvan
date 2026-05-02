'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Rendicion, TipoRendicion, TipoDocRendicion } from '@/types'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.casahiedra.com'

// ─── QUERIES ─────────────────────────────────────────────────────────────────

export async function getRendiciones(filtros?: { colaboradorId?: string; rodajeId?: string; estado?: string }) {
  const supabase = await createClient()
  let query = supabase
    .from('rendiciones')
    .select('*, colaborador:colaboradores(id, nombre, email), rodaje:rodajes(nombre, fecha)')
    .order('created_at', { ascending: false })

  if (filtros?.colaboradorId) query = query.eq('colaborador_id', filtros.colaboradorId)
  if (filtros?.rodajeId) query = query.eq('rodaje_id', filtros.rodajeId)
  if (filtros?.estado) query = query.eq('estado', filtros.estado)

  const { data, error } = await query
  if (error) throw error
  return data as Rendicion[]
}

export async function getRendicionesPorToken(token: string) {
  const supabase = await createClient()

  const { data: link } = await supabase
    .from('colaboradores_links_temporales')
    .select('colaborador_id, rodaje_id')
    .eq('token', token)
    .single()

  if (!link) return []

  let query = supabase
    .from('rendiciones')
    .select('*, rodaje:rodajes(nombre, fecha)')
    .eq('colaborador_id', link.colaborador_id)
    .order('created_at', { ascending: false })

  if (link.rodaje_id) query = query.eq('rodaje_id', link.rodaje_id)

  const { data } = await query
  return (data ?? []) as Rendicion[]
}

export async function getTodasPendientes() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rendiciones')
    .select('*, colaborador:colaboradores(id, nombre, email, banco, tipo_cuenta, numero_cuenta, rut, tipo_documento), rodaje:rodajes(id, nombre, fecha)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Rendicion[]
}

// ─── CREAR ────────────────────────────────────────────────────────────────────

export async function crearRendicion(payload: {
  rodaje_id: string
  colaborador_id?: string
  nombre_libre?: string
  tipo: TipoRendicion
  descripcion: string
  monto: number
  foto_url: string
  tipo_documento?: TipoDocRendicion
  notas?: string
}) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('rendiciones')
    .insert({ ...payload, estado: 'pendiente' })
    .select('*, colaborador:colaboradores(nombre, email), rodaje:rodajes(nombre)')
    .single()

  if (error) throw error

  revalidatePath('/rendiciones')
  revalidatePath('/rendiciones/admin')

  // Email a admin/productor
  try {
    await resend.emails.send({
      from: 'Hilván <noreply@casahiedra.com>',
      to: 'admin@casahiedra.com',
      subject: `Nueva rendición: ${data.colaborador?.nombre || data.nombre_libre} · ${data.rodaje?.nombre}`,
      html: `
        <p><strong>${data.colaborador?.nombre || data.nombre_libre}</strong> envió una nueva rendición para revisión.</p>
        <ul>
          <li>Rodaje: ${data.rodaje?.nombre}</li>
          <li>Tipo: ${data.tipo}</li>
          <li>Monto: $${data.monto.toLocaleString('es-CL')}</li>
          <li>Descripción: ${data.descripcion}</li>
        </ul>
        <p><a href="${APP_URL}/rendiciones/admin">Ver en Hilván →</a></p>
      `,
    })
  } catch { /* email no crítico */ }

  return data as Rendicion
}

export async function actualizarRendicion(id: string, payload: Partial<Rendicion>) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rendiciones')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'pendiente') // solo pendientes son editables
  if (error) throw error
  revalidatePath('/rendiciones')
}

// ─── APROBAR / RECHAZAR ───────────────────────────────────────────────────────

export async function aprobarRendicion(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('rendiciones')
    .update({ estado: 'aprobada', aprobada_por: user?.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, colaborador:colaboradores(nombre, email), rodaje:rodajes(nombre)')
    .single()

  if (error) throw error
  revalidatePath('/rendiciones/admin')

  // Email al colaborador
  if (data.colaborador?.email) {
    try {
      await resend.emails.send({
        from: 'Hilván <noreply@casahiedra.com>',
        to: data.colaborador.email,
        subject: `Rendición aprobada · ${data.rodaje?.nombre}`,
        html: `
          <p>Hola ${data.colaborador.nombre},</p>
          <p>Tu rendición fue <strong>aprobada</strong>.</p>
          <ul>
            <li>Rodaje: ${data.rodaje?.nombre}</li>
            <li>Tipo: ${data.tipo}</li>
            <li>Monto: $${data.monto.toLocaleString('es-CL')}</li>
          </ul>
          <p>Casa Hiedra</p>
        `,
      })
    } catch { /* email no crítico */ }
  }

  return data as Rendicion
}

export async function rechazarRendicion(id: string, motivo: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('rendiciones')
    .update({ estado: 'rechazada', motivo_rechazo: motivo, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, colaborador:colaboradores(nombre, email), rodaje:rodajes(nombre)')
    .single()

  if (error) throw error
  revalidatePath('/rendiciones/admin')

  // Email al colaborador
  if (data.colaborador?.email) {
    try {
      await resend.emails.send({
        from: 'Hilván <noreply@casahiedra.com>',
        to: data.colaborador.email,
        subject: `Rendición rechazada · ${data.rodaje?.nombre}`,
        html: `
          <p>Hola ${data.colaborador.nombre},</p>
          <p>Tu rendición fue <strong>rechazada</strong>.</p>
          <ul>
            <li>Rodaje: ${data.rodaje?.nombre}</li>
            <li>Tipo: ${data.tipo}</li>
            <li>Monto: $${data.monto.toLocaleString('es-CL')}</li>
            <li><strong>Motivo:</strong> ${motivo}</li>
          </ul>
          <p>Puedes corregirla y volver a enviarla desde el portal.</p>
          <p>Casa Hiedra</p>
        `,
      })
    } catch { /* email no crítico */ }
  }

  return data as Rendicion
}

export async function eliminarRendicion(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rendiciones')
    .delete()
    .eq('id', id)
    .eq('estado', 'pendiente')
  if (error) throw error
  revalidatePath('/rendiciones')
  revalidatePath('/rendiciones/admin')
}
