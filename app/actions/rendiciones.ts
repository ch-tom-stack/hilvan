'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { Rendicion, RendicionGasto, TipoRendicion, TipoDocRendicion, RendicionNotaGlosa } from '@/types'
import { sendEmail } from '@/lib/email'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.casahiedra.com'

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

// ─── SUMAS APROBADAS POR ÍTEM (para mostrar "disponible") ─────────────────────

export async function getGastosSumasPorItem(): Promise<Record<string, number>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rendicion_gastos')
    .select('cotizacion_item_id, monto')
    .in('estado', ['enviada', 'aprobada', 'pago_aprobado'])
    .not('cotizacion_item_id', 'is', null)

  const map: Record<string, number> = {}
  for (const g of data ?? []) {
    if (g.cotizacion_item_id) {
      map[g.cotizacion_item_id] = (map[g.cotizacion_item_id] || 0) + g.monto
    }
  }
  return map
}

// ─── RENDICIONES PADRE ────────────────────────────────────────────────────────

const GASTO_SELECT = `
  *,
  colaborador:colaboradores(id, nombre, email, banco, tipo_cuenta, numero_cuenta, rut),
  cotizacion_item:cotizacion_items(id, nombre, tipo)
`

export async function getTodasRendiciones(): Promise<Rendicion[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rendiciones')
    .select(`
      *,
      cotizacion:cotizaciones(id, nombre, grupo:cotizacion_grupos(numero_base)),
      gastos:rendicion_gastos(${GASTO_SELECT})
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Rendicion[]
}

export async function getRendicionPorCotizacion(cotizacionId: string): Promise<Rendicion | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rendiciones')
    .select(`
      *,
      cotizacion:cotizaciones(id, nombre, grupo:cotizacion_grupos(numero_base)),
      gastos:rendicion_gastos(${GASTO_SELECT})
    `)
    .eq('cotizacion_id', cotizacionId)
    .single()
  return data as Rendicion | null
}

export async function crearRendicion(cotizacionId: string): Promise<Rendicion> {
  const supabase = await createClient()
  const admin = createAdminClient()

  // Usar admin client para el check — misma fuente que el delete, evita lag de replicación
  const { data: existente } = await admin
    .from('rendiciones')
    .select('id')
    .eq('cotizacion_id', cotizacionId)
    .maybeSingle()
  if (existente) throw new Error('Ya existe una rendición para esta cotización')

  const { data, error } = await supabase
    .from('rendiciones')
    .insert({ cotizacion_id: cotizacionId })
    .select(`
      *,
      cotizacion:cotizaciones(id, nombre, grupo:cotizacion_grupos(numero_base)),
      gastos:rendicion_gastos(${GASTO_SELECT})
    `)
    .single()
  if (error) throw error
  return data as Rendicion
}

export async function purgarYCrearRendicion(cotizacionId: string): Promise<Rendicion> {
  const admin = createAdminClient()
  const { data: existentes } = await admin
    .from('rendiciones')
    .select('id')
    .eq('cotizacion_id', cotizacionId)
  if (existentes && existentes.length > 0) {
    for (const r of existentes) {
      // CASCADE elimina gastos y links automáticamente
      await admin.from('rendiciones').delete().eq('id', r.id)
    }
    // Pequeña espera para que Supabase propague el delete antes del insert
    await new Promise(r => setTimeout(r, 300))
  }
  const { data, error } = await admin
    .from('rendiciones')
    .insert({ cotizacion_id: cotizacionId })
    .select('*')
    .single()
  if (error) throw error
  return { ...data, gastos: [] } as Rendicion
}

export async function eliminarRendicion(rendicionId: string): Promise<void> {
  const admin = createAdminClient()
  // CASCADE en FK elimina gastos y links automáticamente
  const { error } = await admin.from('rendiciones').delete().eq('id', rendicionId)
  if (error) throw new Error(`Error al eliminar: ${error.message}`)
}

// ─── GASTOS ───────────────────────────────────────────────────────────────────

export async function crearGasto(payload: {
  rendicion_id: string
  cotizacion_item_id?: string | null
  colaborador_id?: string | null
  nombre_libre?: string
  origen?: 'interno' | 'externo'
  tipo: TipoRendicion
  descripcion?: string | null
  monto: number
  tipo_documento?: TipoDocRendicion | null
  foto_url?: string | null
  estado?: 'borrador' | 'enviada'
  rut_emisor?: string | null
  razon_social_emisor?: string | null
  factura_casa_hiedra?: boolean
}): Promise<RendicionGasto> {
  const TIPO_LABEL: Record<string, string> = {
    honorarios: 'Honorarios', transporte: 'Transporte', alimentacion: 'Alimentación',
    arte: 'Arte / Props', insumos: 'Insumos', servicios: 'Servicios', viaticos: 'Viáticos', otro: 'Gasto',
  }
  const admin = createAdminClient()
  const { estado = 'enviada', descripcion, ...rest } = payload
  const descripcionFinal = descripcion?.trim() || TIPO_LABEL[payload.tipo] || 'Gasto'
  const { data, error } = await admin
    .from('rendicion_gastos')
    .insert({ ...rest, descripcion: descripcionFinal, estado })
    .select(GASTO_SELECT)
    .single()
  if (error) throw error

  if (estado !== 'borrador') {
    try {
      const { data: rendicion } = await admin
        .from('rendiciones')
        .select('cotizacion:cotizaciones(nombre)')
        .eq('id', payload.rendicion_id)
        .single()
      const cotNombre = (rendicion?.cotizacion as any)?.nombre || ''
      const itemNombre = (data.cotizacion_item as any)?.nombre || 'Gasto no presupuestado'
      const quienRinde = (data.colaborador as any)?.nombre || payload.nombre_libre || 'Externo'
      await sendEmail({
        from: 'Hilván <noreply@casahiedra.com>',
        to: 'tomas@casahiedra.com',
        subject: `Nuevo gasto: ${quienRinde} · ${cotNombre}`,
        html: `<p><strong>${quienRinde}</strong> agregó un gasto.</p>
          <ul>
            <li>Cotización: ${cotNombre}</li>
            <li>Glosa: ${itemNombre}</li>
            <li>Tipo: ${data.tipo}</li>
            <li>Monto: $${data.monto.toLocaleString('es-CL')}</li>
          </ul>
          <p><a href="${APP_URL}/rendiciones/admin">Ver en Hilván →</a></p>`,
      })
    } catch { /* email no crítico */ }
  }

  return data as RendicionGasto
}

export async function aprobarGasto(id: string): Promise<RendicionGasto> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rendicion_gastos')
    .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(GASTO_SELECT)
    .single()
  if (error) throw error

  const col = (data.colaborador as any)
  if (col?.email) {
    try {
      await sendEmail({
        from: 'Hilván <noreply@casahiedra.com>',
        to: col.email,
        subject: 'Gasto aprobado · Hilván',
        html: `<p>Hola ${col.nombre},</p><p>Tu gasto de $${data.monto.toLocaleString('es-CL')} fue <strong>aprobado</strong>.</p><p>Casa Hiedra</p>`,
      })
    } catch { /* email no crítico */ }
  }
  return data as RendicionGasto
}

export async function rechazarGasto(id: string, motivo: string): Promise<RendicionGasto> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rendicion_gastos')
    .update({ estado: 'rechazada', motivo_rechazo: motivo, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(GASTO_SELECT)
    .single()
  if (error) throw error

  const col = (data.colaborador as any)
  if (col?.email) {
    try {
      await sendEmail({
        from: 'Hilván <noreply@casahiedra.com>',
        to: col.email,
        subject: 'Gasto rechazado · Hilván',
        html: `<p>Hola ${col.nombre},</p><p>Tu gasto fue <strong>rechazado</strong>.</p><p>Motivo: ${motivo}</p><p>Puedes corregirlo y volver a enviarlo.</p><p>Casa Hiedra</p>`,
      })
    } catch { /* email no crítico */ }
  }
  return data as RendicionGasto
}

export async function aprobarPagoGasto(id: string, comprobante_pago_url?: string): Promise<RendicionGasto> {
  const supabase = await createClient()
  const updates: Record<string, any> = { estado: 'pago_aprobado', updated_at: new Date().toISOString() }
  if (comprobante_pago_url) updates.comprobante_pago_url = comprobante_pago_url
  const { data, error } = await supabase
    .from('rendicion_gastos')
    .update(updates)
    .eq('id', id)
    .select(GASTO_SELECT)
    .single()
  if (error) throw error
  return data as RendicionGasto
}

export async function eliminarGasto(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('rendicion_gastos').delete().eq('id', id)
  if (error) throw error
}

export async function revertirAprobacionGasto(id: string): Promise<RendicionGasto> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rendicion_gastos')
    .update({ estado: 'pendiente', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(GASTO_SELECT)
    .single()
  if (error) throw error
  return data as RendicionGasto
}

export async function toggleItemCompletado(itemId: string, valor: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotizacion_items')
    .update({ rendicion_completada: valor })
    .eq('id', itemId)
  if (error) throw error
}

// ─── LINK TEMPORAL EXTERNOS ───────────────────────────────────────────────────

export async function generarLinkTemporalExterno(payload: {
  rendicion_id: string
  cotizacion_item_id: string
  email?: string
  colaborador_id?: string | null
  dias_expiracion?: number
}): Promise<{ url: string }> {
  const supabase = await createClient()
  const { rendicion_id, cotizacion_item_id, email, colaborador_id, dias_expiracion = 7 } = payload

  const token = crypto.randomUUID().replace(/-/g, '')
  const expires_at = new Date()
  expires_at.setDate(expires_at.getDate() + dias_expiracion)

  const { error } = await supabase
    .from('rendiciones_links_temporales')
    .insert({ rendicion_id, cotizacion_item_id, email: email || null, colaborador_id: colaborador_id || null, token, expires_at: expires_at.toISOString() })
  if (error) throw error

  const url = `${APP_URL}/r/${token}`

  if (email?.trim()) {
    try {
      await sendEmail({
        from: 'Hilván <noreply@casahiedra.com>',
        to: email,
        subject: 'Hilván · Envío de gastos de producción',
        html: `<p>Hola,</p>
          <p>Casa Hiedra te invita a registrar tus gastos de producción.</p>
          <p><a href="${url}" style="display:inline-block;background:#4ade80;color:#000;padding:10px 20px;text-decoration:none;font-family:monospace;">Ingresar mis gastos →</a></p>
          <p style="color:#888;font-size:12px;">Este link expira en ${dias_expiracion} días.</p>
          <p>Casa Hiedra</p>`,
      })
    } catch { /* email no crítico */ }
  }

  return { url }
}

export async function getInfoPorToken(token: string): Promise<{
  rendicion: Rendicion
  cotizacionItem: { id: string; nombre: string; tipo: string; precio_neto_proveedor: number; cantidad: number }
  colaboradorId: string | null
  email: string | null
  gastos: RendicionGasto[]
} | null> {
  const admin = createAdminClient()

  const { data: link, error: linkError } = await admin
    .from('rendiciones_links_temporales')
    .select(`
      *,
      cotizacion_item:cotizacion_items(id, nombre, tipo, precio_neto_proveedor, cantidad)
    `)
    .eq('token', token)
    .single()

  if (linkError) console.error('[getInfoPorToken] link error:', linkError.message)
  if (!link) return null
  if (new Date(link.expires_at) < new Date()) { console.error('[getInfoPorToken] link expirado'); return null }

  const { data: rendicion, error: rendicionError } = await admin
    .from('rendiciones')
    .select(`*, cotizacion:cotizaciones(id, nombre, grupo:cotizacion_grupos(numero_base))`)
    .eq('id', link.rendicion_id)
    .single()

  if (rendicionError) console.error('[getInfoPorToken] rendicion error:', rendicionError.message)
  if (!rendicion) return null

  const { data: gastos } = await admin
    .from('rendicion_gastos')
    .select(GASTO_SELECT)
    .eq('rendicion_id', link.rendicion_id)
    .eq('cotizacion_item_id', link.cotizacion_item_id)
    .order('created_at', { ascending: false })

  return {
    rendicion: rendicion as Rendicion,
    cotizacionItem: link.cotizacion_item as any,
    colaboradorId: link.colaborador_id,
    email: link.email,
    gastos: (gastos ?? []) as RendicionGasto[],
  }
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

// ─── GESTIÓN DE LINKS TEMPORALES ──────────────────────────────────────────────

const LINK_SELECT = `
  *,
  cotizacion_item:cotizacion_items(id, nombre),
  colaborador:colaboradores(id, nombre, email),
  rendicion:rendiciones(
    id,
    cotizacion:cotizaciones(id, nombre, grupo:cotizacion_grupos(numero_base))
  )
`

export async function getLinksTemporales() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('rendiciones_links_temporales')
    .select(LINK_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function eliminarLinkTemporal(id: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('rendiciones_links_temporales').delete().eq('id', id)
  if (error) throw new Error(`Error al eliminar link: ${error.message}`)
}

export async function reenviarEmailLink(id: string): Promise<void> {
  const admin = createAdminClient()
  const { data: link, error } = await admin
    .from('rendiciones_links_temporales')
    .select(LINK_SELECT)
    .eq('id', id)
    .single()
  if (error || !link) throw new Error('Link no encontrado')
  if (!link.email?.trim()) throw new Error('Este link no tiene email asociado')

  const url = `${APP_URL}/r/${link.token}`
  const cotNombre = (link.rendicion as any)?.cotizacion?.nombre || ''
  const diasRestantes = Math.max(0, Math.ceil(
    (new Date(link.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ))

  await sendEmail({
    from: 'Hilván <noreply@casahiedra.com>',
    to: link.email,
    subject: `Hilván · Recordatorio — Envío de gastos${cotNombre ? ` (${cotNombre})` : ''}`,
    html: `<p>Hola,</p>
      <p>Este es un recordatorio para registrar tus gastos de producción.</p>
      <p><a href="${url}" style="display:inline-block;background:#4ade80;color:#000;padding:10px 20px;text-decoration:none;font-family:monospace;">Ingresar mis gastos →</a></p>
      <p style="color:#888;font-size:12px;">Este link ${diasRestantes > 0 ? `vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}` : 'vence hoy'}.</p>
      <p>Casa Hiedra</p>`,
  })
}

// ─── FACTURA Y PAGO ───────────────────────────────────────────────────────────

export async function toggleFacturaEmitida(rendicionId: string, valor: boolean): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rendiciones')
    .update({ factura_emitida: valor, updated_at: new Date().toISOString() })
    .eq('id', rendicionId)
  if (error) throw error
  revalidatePath('/rendiciones/admin')
}

export async function agregarArchivoFactura(rendicionId: string, url: string): Promise<string[]> {
  const supabase = await createClient()
  const { data: r } = await supabase.from('rendiciones').select('factura_archivos').eq('id', rendicionId).single()
  const archivos = [...(r?.factura_archivos ?? []), url]
  const { error } = await supabase
    .from('rendiciones')
    .update({ factura_archivos: archivos, updated_at: new Date().toISOString() })
    .eq('id', rendicionId)
  if (error) throw error
  revalidatePath('/rendiciones/admin')
  return archivos
}

export async function eliminarArchivoFactura(rendicionId: string, url: string): Promise<string[]> {
  const supabase = await createClient()
  const { data: r } = await supabase.from('rendiciones').select('factura_archivos').eq('id', rendicionId).single()
  const archivos = (r?.factura_archivos ?? []).filter((a: string) => a !== url)
  const { error } = await supabase
    .from('rendiciones')
    .update({ factura_archivos: archivos, updated_at: new Date().toISOString() })
    .eq('id', rendicionId)
  if (error) throw error
  revalidatePath('/rendiciones/admin')
  return archivos
}

export async function togglePagoRecibido(rendicionId: string, valor: boolean): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rendiciones')
    .update({ pago_recibido: valor, updated_at: new Date().toISOString() })
    .eq('id', rendicionId)
  if (error) throw error
  revalidatePath('/rendiciones/admin')
}
