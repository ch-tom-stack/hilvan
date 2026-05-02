'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Rendicion, TipoRendicion, TipoDocRendicion, RendicionNotaGlosa } from '@/types'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.casahiedra.com'

const RENDICION_SELECT = `
  *,
  colaborador:colaboradores(id, nombre, email),
  cotizacion:cotizaciones(id, nombre, grupo:cotizacion_grupos(numero_base)),
  cotizacion_item:cotizacion_items(id, nombre, tipo)
`

const RENDICION_ADMIN_SELECT = `
  *,
  colaborador:colaboradores(id, nombre, email, banco, tipo_cuenta, numero_cuenta, rut, tipo_documento),
  cotizacion:cotizaciones(id, nombre, grupo:cotizacion_grupos(numero_base)),
  cotizacion_item:cotizacion_items(id, nombre, tipo, precio_neto_proveedor, cantidad, departamento_id, subgrupo_id)
`

// ─── COTIZACIONES PARA FORMULARIO ─────────────────────────────────────────────

export async function getCotizacionesParaRendiciones() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cotizaciones')
    .select(`
      id, nombre, estado,
      grupo:cotizacion_grupos(numero_base),
      departamentos:cotizacion_departamentos(
        id, nombre, orden,
        subgrupos:cotizacion_subgrupos(
          id, nombre, orden,
          items:cotizacion_items(id, nombre, tipo, precio_neto_proveedor, cantidad, incluido, orden)
        ),
        items:cotizacion_items(id, nombre, tipo, precio_neto_proveedor, cantidad, incluido, orden, subgrupo_id)
      )
    `)
    .in('estado', ['aprobada', 'en_produccion', 'cerrada'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getCotizacionesConEstructura(ids: string[]) {
  if (ids.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cotizaciones')
    .select(`
      id, nombre, estado,
      grupo:cotizacion_grupos(numero_base),
      departamentos:cotizacion_departamentos(
        id, nombre, orden,
        subgrupos:cotizacion_subgrupos(
          id, nombre, orden,
          items:cotizacion_items(id, nombre, tipo, precio_neto_proveedor, cantidad, incluido, orden)
        ),
        items:cotizacion_items(id, nombre, tipo, precio_neto_proveedor, cantidad, incluido, orden, subgrupo_id)
      )
    `)
    .in('id', ids)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ─── SUMAS APROBADAS POR ÍTEM ─────────────────────────────────────────────────

export async function getRendicionesSumasPorItem(): Promise<Record<string, number>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rendiciones')
    .select('cotizacion_item_id, monto')
    .eq('estado', 'aprobada')
    .not('cotizacion_item_id', 'is', null)

  const map: Record<string, number> = {}
  for (const r of data ?? []) {
    if (r.cotizacion_item_id) {
      map[r.cotizacion_item_id] = (map[r.cotizacion_item_id] || 0) + r.monto
    }
  }
  return map
}

// ─── QUERIES ──────────────────────────────────────────────────────────────────

export async function getRendiciones(filtros?: {
  colaboradorId?: string
  cotizacionId?: string
  estado?: string
}) {
  const supabase = await createClient()
  let query = supabase
    .from('rendiciones')
    .select(RENDICION_SELECT)
    .order('created_at', { ascending: false })

  if (filtros?.colaboradorId) query = query.eq('colaborador_id', filtros.colaboradorId)
  if (filtros?.cotizacionId) query = query.eq('cotizacion_id', filtros.cotizacionId)
  if (filtros?.estado) query = query.eq('estado', filtros.estado)

  const { data, error } = await query
  if (error) throw error
  return data as Rendicion[]
}

export async function getTodasRendiciones() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rendiciones')
    .select(RENDICION_ADMIN_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Rendicion[]
}

export async function getRendicionesPorToken(token: string) {
  const supabase = await createClient()
  const { data: link } = await supabase
    .from('colaboradores_links_temporales')
    .select('colaborador_id')
    .eq('token', token)
    .single()
  if (!link) return []
  const { data } = await supabase
    .from('rendiciones')
    .select(RENDICION_SELECT)
    .eq('colaborador_id', link.colaborador_id)
    .order('created_at', { ascending: false })
  return (data ?? []) as Rendicion[]
}

// ─── CREAR ────────────────────────────────────────────────────────────────────

export async function crearRendicion(payload: {
  cotizacion_id: string
  cotizacion_item_id?: string | null
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
    .select(`
      *,
      colaborador:colaboradores(nombre, email),
      cotizacion:cotizaciones(nombre, grupo:cotizacion_grupos(numero_base)),
      cotizacion_item:cotizacion_items(nombre)
    `)
    .single()
  if (error) throw error

  revalidatePath('/rendiciones')
  revalidatePath('/rendiciones/admin')

  try {
    const cotNombre = (data.cotizacion as any)?.nombre || ''
    const itemNombre = (data.cotizacion_item as any)?.nombre || 'Gasto no presupuestado'
    await resend.emails.send({
      from: 'Hilván <noreply@casahiedra.com>',
      to: 'admin@casahiedra.com',
      subject: `Nueva rendición: ${data.colaborador?.nombre || data.nombre_libre} · ${cotNombre}`,
      html: `
        <p><strong>${data.colaborador?.nombre || data.nombre_libre}</strong> envió una nueva rendición.</p>
        <ul>
          <li>Cotización: ${cotNombre}</li>
          <li>Ítem: ${itemNombre}</li>
          <li>Tipo: ${data.tipo}</li>
          <li>Monto: $${data.monto.toLocaleString('es-CL')}</li>
        </ul>
        <p><a href="${APP_URL}/rendiciones/admin">Ver en Hilván →</a></p>
      `,
    })
  } catch { /* email no crítico */ }

  return data as Rendicion
}

// ─── APROBAR / RECHAZAR ───────────────────────────────────────────────────────

export async function aprobarRendicion(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('rendiciones')
    .update({ estado: 'aprobada', aprobada_por: user?.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(`*, colaborador:colaboradores(nombre, email), cotizacion:cotizaciones(nombre)`)
    .single()
  if (error) throw error
  revalidatePath('/rendiciones/admin')

  if (data.colaborador?.email) {
    try {
      await resend.emails.send({
        from: 'Hilván <noreply@casahiedra.com>',
        to: data.colaborador.email,
        subject: `Rendición aprobada · ${(data.cotizacion as any)?.nombre}`,
        html: `<p>Hola ${data.colaborador.nombre},</p><p>Tu rendición fue <strong>aprobada</strong>.</p><p>Monto: $${data.monto.toLocaleString('es-CL')}</p><p>Casa Hiedra</p>`,
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
    .select(`*, colaborador:colaboradores(nombre, email), cotizacion:cotizaciones(nombre)`)
    .single()
  if (error) throw error
  revalidatePath('/rendiciones/admin')

  if (data.colaborador?.email) {
    try {
      await resend.emails.send({
        from: 'Hilván <noreply@casahiedra.com>',
        to: data.colaborador.email,
        subject: `Rendición rechazada · ${(data.cotizacion as any)?.nombre}`,
        html: `<p>Hola ${data.colaborador.nombre},</p><p>Tu rendición fue <strong>rechazada</strong>.</p><p>Motivo: ${motivo}</p><p>Puedes corregirla y volver a enviarla.</p><p>Casa Hiedra</p>`,
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

// ─── NOTAS POR GLOSA ──────────────────────────────────────────────────────────

export async function getNotasGlosa(cotizacionItemId: string): Promise<RendicionNotaGlosa[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rendiciones_notas_glosa')
    .select('*, autor:profiles(nombre, email)')
    .eq('cotizacion_item_id', cotizacionItemId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as RendicionNotaGlosa[]
}

export async function crearNotaGlosa(cotizacionItemId: string, nota: string): Promise<RendicionNotaGlosa> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('rendiciones_notas_glosa')
    .insert({ cotizacion_item_id: cotizacionItemId, autor_id: user?.id, nota })
    .select('*, autor:profiles(nombre, email)')
    .single()
  if (error) throw error
  return data as RendicionNotaGlosa
}
