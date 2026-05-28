'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/email'
import { crearEventoGCal } from '@/lib/google-calendar'
import type {
  RentalReserva,
  EstadoRental,
  Equipo,
  Maleta,
  CategoriaEquipo,
  RentalCotizacion,
  RentalCotizacionSeccion,
  RentalCotizacionItem,
} from '@/types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// ─── Helpers internos ─────────────────────────────────────────────────────────

async function getAdminEmails(): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('email')
    .in('rol', ['admin', 'productor'])
  return (data ?? []).map((p: { email: string }) => p.email).filter(Boolean)
}

// ─── Listar todas las reservas con joins ─────────────────────────────────────

export async function listarRentalReservas(): Promise<(RentalReserva & {
  equipo?: { codigo: string; nombre: string } | null
  maleta?: { codigo: string; nombre: string } | null
  cliente?: { nombre: string } | null
  solicitante?: { nombre: string; email: string } | null
})[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rental_reservas')
    .select(`
      *,
      equipo:equipos(codigo, nombre),
      maleta:maletas(codigo, nombre),
      cliente:clientes(nombre),
      solicitante:profiles!rental_reservas_created_by_fkey(nombre, email)
    `)
    .order('fecha_inicio', { ascending: false })

  if (error) {
    // fallback sin join de solicitante si columna created_by aún no existe
    const { data: fallback } = await supabase
      .from('rental_reservas')
      .select(`*, equipo:equipos(codigo, nombre), maleta:maletas(codigo, nombre), cliente:clientes(nombre)`)
      .order('fecha_inicio', { ascending: false })
    return (fallback ?? []) as any
  }
  return (data ?? []) as any
}

// ─── Mis reservas (filtradas por created_by) ─────────────────────────────────

export async function listarMisReservas(): Promise<(RentalReserva & {
  equipo?: { codigo: string; nombre: string } | null
  maleta?: { codigo: string; nombre: string } | null
})[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('rental_reservas')
    .select(`*, equipo:equipos(codigo, nombre), maleta:maletas(codigo, nombre)`)
    .eq('created_by', user.id)
    .order('fecha_inicio', { ascending: false })

  if (error) return []
  return (data ?? []) as any
}

// ─── Listar equipos rentables ─────────────────────────────────────────────────

export async function listarEquiposRentables(categoriaFiltro?: string): Promise<(Equipo & {
  categoria?: CategoriaEquipo
})[]> {
  const admin = createAdminClient()
  let query = admin
    .from('equipos')
    .select('*, categoria:categorias_equipo(*)')
    .eq('rentable', true)
    .order('codigo')

  if (categoriaFiltro) query = query.eq('categoria_codigo', categoriaFiltro)

  const { data, error } = await query
  if (error) return []
  return (data ?? []) as any
}

// ─── Listar maletas para rental ───────────────────────────────────────────────

export async function listarMaletasRental(): Promise<Maleta[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('maletas')
    .select('id, codigo, nombre, descripcion, foto_url, foto_empaque, created_at')
    .order('codigo')

  if (error) return []
  return (data ?? []) as Maleta[]
}

// ─── Verificar disponibilidad ─────────────────────────────────────────────────

export async function verificarDisponibilidad(
  equipoId: string | null,
  maletaId: string | null,
  fechaInicio: string,
  fechaFin: string,
  reservaIdExcluir?: string,
): Promise<{ disponible: boolean; conflictos: { fecha_inicio: string; fecha_fin: string }[]; stockTotal?: number; stockDisponible?: number }> {
  const admin = createAdminClient()

  let query = admin
    .from('rental_reservas')
    .select('fecha_inicio, fecha_fin')
    .in('estado', ['aprobada', 'entregada'])
    .lte('fecha_inicio', fechaFin)
    .gte('fecha_fin', fechaInicio)

  if (equipoId) query = query.eq('equipo_id', equipoId)
  else if (maletaId) query = query.eq('maleta_id', maletaId)
  else return { disponible: false, conflictos: [] }

  if (reservaIdExcluir) query = query.neq('id', reservaIdExcluir)

  const { data: conflictos, error } = await query
  if (error) return { disponible: true, conflictos: [] }

  const lista = (conflictos ?? []) as { fecha_inicio: string; fecha_fin: string }[]

  // Si es equipo con cantidad > 1, verificar stock
  if (equipoId) {
    const { data: equipo } = await admin
      .from('equipos')
      .select('cantidad')
      .eq('id', equipoId)
      .single<{ cantidad: number }>()

    const stockTotal = equipo?.cantidad ?? 1
    const stockDisponible = stockTotal - lista.length
    return {
      disponible: stockDisponible > 0,
      conflictos: lista,
      stockTotal,
      stockDisponible: Math.max(0, stockDisponible),
    }
  }

  return { disponible: lista.length === 0, conflictos: lista }
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
}): Promise<{ ok?: boolean; error?: string; id?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'No autenticado' }

    const { data: self } = await supabase
      .from('profiles')
      .select('nombre, email, rol')
      .eq('id', user.id)
      .single<{ nombre: string; email: string; rol: string }>()

    const admin = createAdminClient()

    // Intentar con created_by; si la columna aún no existe, insertar sin ella
    let nueva: { id: string } | null = null
    let insertError: any = null

    const res1 = await admin
      .from('rental_reservas')
      .insert({ ...payload, estado: 'pendiente', created_by: user.id })
      .select('id')
      .single<{ id: string }>()

    if (res1.error) {
      // Columna created_by no existe aún — fallback
      const res2 = await admin
        .from('rental_reservas')
        .insert({ ...payload, estado: 'pendiente' })
        .select('id')
        .single<{ id: string }>()
      nueva = res2.data
      insertError = res2.error
    } else {
      nueva = res1.data
    }

    if (insertError || !nueva) {
      console.error('[rental] insert error:', insertError)
      return { error: insertError?.message ?? 'Error al crear reserva' }
    }

    revalidatePath('/rental/reservas')

    // Email a admin/productor
    try {
      const admins = await getAdminEmails()
      const itemNombre = payload.equipo_id
        ? (await admin.from('equipos').select('nombre, codigo').eq('id', payload.equipo_id).single<{ nombre: string; codigo: string }>()).data
        : payload.maleta_id
        ? (await admin.from('maletas').select('nombre, codigo').eq('id', payload.maleta_id).single<{ nombre: string; codigo: string }>()).data
        : null

      if (admins.length > 0) {
        await sendEmail({
          from: 'Hilván <noreply@casahiedra.com>',
          to: admins,
          subject: `[Rental] Nueva solicitud — ${itemNombre?.nombre ?? 'equipo'} · ${self?.nombre ?? user.email}`,
          html: `
            <p><strong>${self?.nombre ?? user.email}</strong> solicitó una reserva de rental.</p>
            <ul>
              <li>Equipo/Maleta: <strong>${itemNombre ? `${itemNombre.codigo} · ${itemNombre.nombre}` : '—'}</strong></li>
              <li>Período: ${payload.fecha_inicio} al ${payload.fecha_fin}</li>
              ${payload.notas ? `<li>Notas: ${payload.notas}</li>` : ''}
            </ul>
            <p><a href="${APP_URL}/rental/reservas">Ver en Hilván Rental →</a></p>
          `,
        })
      }
    } catch { /* email no crítico */ }

    return { ok: true, id: nueva.id }
  } catch (e: any) {
    console.error('[rental] crearRentalReserva threw:', e)
    return { error: e?.message ?? 'Error inesperado al crear reserva' }
  }
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
    .select('rol, nombre')
    .eq('id', user.id)
    .single<{ rol: string; nombre: string }>()

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

  revalidatePath('/rental/reservas')

  // Google Calendar al aprobar
  if (estado === 'aprobada') {
    try {
      const { data: reserva } = await admin
        .from('rental_reservas')
        .select(`
          fecha_inicio, fecha_fin, notas,
          equipo:equipos(codigo, nombre),
          maleta:maletas(codigo, nombre),
          cliente:clientes(nombre),
          solicitante:profiles!rental_reservas_created_by_fkey(nombre)
        `)
        .eq('id', id)
        .single()

      if (reserva) {
        const r = reserva as any
        const itemLabel = r.equipo
          ? `${r.equipo.codigo} · ${r.equipo.nombre}`
          : r.maleta
          ? `${r.maleta.codigo} · ${r.maleta.nombre}`
          : 'Equipo'
        const clienteLabel = r.cliente?.nombre ?? r.solicitante?.nombre ?? 'Sin cliente'
        const inicio = new Date(`${r.fecha_inicio}T09:00:00-03:00`)
        const fin = new Date(`${r.fecha_fin}T20:00:00-03:00`)
        await crearEventoGCal(
          `[RENTAL] ${itemLabel} · ${clienteLabel}`,
          inicio,
          fin,
          r.notas ?? undefined,
        )
      }
    } catch { /* gcal no crítico */ }
  }

  // Email al solicitante
  try {
    const { data: reserva } = await admin
      .from('rental_reservas')
      .select('notas, fecha_inicio, fecha_fin, equipo:equipos(nombre, codigo), maleta:maletas(nombre, codigo), solicitante:profiles!rental_reservas_created_by_fkey(nombre, email)')
      .eq('id', id)
      .single()

    const r = reserva as any
    const solicitante = r?.solicitante
    if (solicitante?.email) {
      const itemNombre = r?.equipo
        ? `${r.equipo.codigo} · ${r.equipo.nombre}`
        : r?.maleta
        ? `${r.maleta.codigo} · ${r.maleta.nombre}`
        : 'equipo'
      const estadoLabel = estado === 'aprobada' ? '✅ Aprobada' : estado === 'denegada' ? '❌ Denegada' : estado
      await sendEmail({
        from: 'Hilván <noreply@casahiedra.com>',
        to: solicitante.email,
        subject: `[Rental] Tu reserva fue ${estado === 'aprobada' ? 'aprobada' : 'actualizada'} — ${itemNombre}`,
        html: `
          <p>Hola ${solicitante.nombre},</p>
          <p>Tu solicitud de rental fue actualizada:</p>
          <ul>
            <li>Equipo/Maleta: <strong>${itemNombre}</strong></li>
            <li>Período: ${r?.fecha_inicio} al ${r?.fecha_fin}</li>
            <li>Estado: <strong>${estadoLabel}</strong></li>
          </ul>
          <p><a href="${APP_URL}/rental/reservas">Ver mis reservas →</a></p>
        `,
      })
    }
  } catch { /* email no crítico */ }

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
  revalidatePath('/rental/reservas')
  return { ok: true }
}

// ─── COTIZACIONES RENTAL ──────────────────────────────────────────────────────

export async function listarRentalCotizaciones(): Promise<(RentalCotizacion & {
  cliente?: { nombre: string } | null
  reserva?: { equipo?: { nombre: string } | null; maleta?: { nombre: string } | null } | null
})[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rental_cotizaciones')
    .select(`
      *,
      cliente:clientes(nombre),
      reserva:rental_reservas(equipo:equipos(nombre), maleta:maletas(nombre))
    `)
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []) as any
}

export async function obtenerRentalCotizacion(id: string): Promise<(RentalCotizacion & {
  cliente?: { nombre: string; empresa?: string; email?: string; rut?: string; direccion?: string } | null
  reserva?: { fecha_inicio: string; fecha_fin: string; equipo?: { nombre: string; codigo: string } | null; maleta?: { nombre: string; codigo: string } | null } | null
  secciones: (RentalCotizacionSeccion & { items: RentalCotizacionItem[] })[]
}) | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rental_cotizaciones')
    .select(`
      *,
      cliente:clientes(nombre, empresa, email, rut, direccion),
      reserva:rental_reservas(fecha_inicio, fecha_fin, equipo:equipos(nombre, codigo), maleta:maletas(nombre, codigo)),
      secciones:rental_cotizacion_secciones(
        *,
        items:rental_cotizacion_items(*, equipo:equipos(codigo, nombre), maleta:maletas(codigo, nombre))
      )
    `)
    .eq('id', id)
    .single()

  if (error) return null
  return data as any
}

export async function crearRentalCotizacion(payload: {
  reserva_id?: string | null
  cliente_id?: string | null
  cliente_nombre_libre?: string | null
  cliente_email_libre?: string | null
  con_iva: boolean
  notas_internas?: string | null
  notas_cliente?: string | null
}): Promise<{ ok?: boolean; error?: string; id?: string }> {
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

  // Generar número R-XXX
  const { data: ultima } = await admin
    .from('rental_cotizaciones')
    .select('numero')
    .order('created_at', { ascending: false })
    .limit(1)
    .single<{ numero: string }>()

  let siguiente = 1
  if (ultima?.numero) {
    const match = ultima.numero.match(/R-(\d+)/)
    if (match) siguiente = parseInt(match[1]) + 1
  }
  const numero = `R-${String(siguiente).padStart(3, '0')}`

  const { data: nueva, error } = await admin
    .from('rental_cotizaciones')
    .insert({
      ...payload,
      numero,
      estado: 'borrador',
      descuento_global: 0,
      descuento_global_tipo: 'porcentaje',
      created_by: user.id,
    })
    .select('id')
    .single<{ id: string }>()

  if (error) return { error: error.message }

  // Crear sección inicial
  await admin
    .from('rental_cotizacion_secciones')
    .insert({ cotizacion_id: nueva.id, nombre: 'Equipos', orden: 1 })

  revalidatePath('/rental/cotizaciones')
  return { ok: true, id: nueva.id }
}

export async function actualizarRentalCotizacion(
  id: string,
  payload: Partial<Pick<RentalCotizacion, 'estado' | 'con_iva' | 'descuento_global' | 'descuento_global_tipo' | 'notas_internas' | 'notas_cliente' | 'cliente_nombre_libre' | 'cliente_email_libre' | 'cliente_id'>>,
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
    .from('rental_cotizaciones')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath(`/rental/cotizaciones/${id}`)
  revalidatePath('/rental/cotizaciones')
  return { ok: true }
}

export async function agregarItemRentalCotizacion(
  cotizacionId: string,
  payload: {
    seccion_id?: string | null
    equipo_id?: string | null
    maleta_id?: string | null
    descripcion: string
    cantidad: number
    dias: number
    precio_unitario: number
    descuento?: number
    descuento_tipo?: 'porcentaje' | 'monto'
    incluido?: boolean
  },
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { data: ultimo } = await admin
    .from('rental_cotizacion_items')
    .select('orden')
    .eq('cotizacion_id', cotizacionId)
    .order('orden', { ascending: false })
    .limit(1)
    .single<{ orden: number }>()

  const { error } = await admin
    .from('rental_cotizacion_items')
    .insert({
      cotizacion_id: cotizacionId,
      seccion_id: payload.seccion_id ?? null,
      equipo_id: payload.equipo_id ?? null,
      maleta_id: payload.maleta_id ?? null,
      descripcion: payload.descripcion,
      cantidad: payload.cantidad,
      dias: payload.dias,
      precio_unitario: payload.precio_unitario,
      descuento: payload.descuento ?? 0,
      descuento_tipo: payload.descuento_tipo ?? 'porcentaje',
      incluido: payload.incluido ?? false,
      orden: (ultimo?.orden ?? 0) + 1,
    })

  if (error) return { error: error.message }
  revalidatePath(`/rental/cotizaciones/${cotizacionId}`)
  return { ok: true }
}

export async function eliminarItemRentalCotizacion(
  itemId: string,
  cotizacionId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('rental_cotizacion_items')
    .delete()
    .eq('id', itemId)

  if (error) return { error: error.message }
  revalidatePath(`/rental/cotizaciones/${cotizacionId}`)
  return { ok: true }
}

export async function agregarSeccionRentalCotizacion(
  cotizacionId: string,
  nombre: string,
): Promise<{ ok?: boolean; error?: string; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { data: ultima } = await admin
    .from('rental_cotizacion_secciones')
    .select('orden')
    .eq('cotizacion_id', cotizacionId)
    .order('orden', { ascending: false })
    .limit(1)
    .single<{ orden: number }>()

  const { data, error } = await admin
    .from('rental_cotizacion_secciones')
    .insert({ cotizacion_id: cotizacionId, nombre, orden: (ultima?.orden ?? 0) + 1 })
    .select('id')
    .single<{ id: string }>()

  if (error) return { error: error.message }
  revalidatePath(`/rental/cotizaciones/${cotizacionId}`)
  return { ok: true, id: data.id }
}

export async function obtenerEquiposParaCotizacion(): Promise<(Equipo & { categoria?: CategoriaEquipo })[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('equipos')
    .select('*, categoria:categorias_equipo(*)')
    .eq('rentable', true)
    .order('codigo')
  return (data ?? []) as any
}
