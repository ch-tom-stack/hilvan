'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { Cliente, ClienteContacto, Proyecto, ProyectoTarea, ProyectoContacto, EstadoProyecto } from '@/types'
import { subtotalDepartamento } from '@/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

function r(path: string) {
  revalidatePath(path)
  revalidatePath('/clientes')
}

// ─── CLIENTES ────────────────────────────────────────────────────────────────

export async function getClientes(): Promise<Cliente[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clientes')
    .select('*, parent:clientes!parent_id(id, nombre, empresa)')
    .order('nombre')
  if (error) throw new Error(error.message)
  return data as Cliente[]
}

export async function getCliente(id: string): Promise<Cliente | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clientes')
    .select('*, parent:clientes!parent_id(id, nombre, empresa)')
    .eq('id', id)
    .single()
  if (error) return null
  return data as Cliente
}

export async function crearCliente(payload: Omit<Cliente, 'id' | 'created_at' | 'updated_at'>): Promise<Cliente> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data, error } = await supabase
    .from('clientes')
    .insert({ ...payload, created_by: user.id })
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/clientes')
  return data as Cliente
}

export async function actualizarCliente(
  id: string,
  payload: Partial<Omit<Cliente, 'id' | 'created_at' | 'updated_at' | 'created_by'>>
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('clientes')
    .update(payload)
    .eq('id', id)
  if (error) throw new Error(error.message)
  r(`/clientes/${id}`)
}

export async function eliminarCliente(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/clientes')
}

// ─── CONTACTOS ───────────────────────────────────────────────────────────────

export async function getContactosCliente(clienteId: string): Promise<ClienteContacto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cliente_contactos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('nombre')
  if (error) throw new Error(error.message)
  return data as ClienteContacto[]
}

export async function crearContacto(
  clienteId: string,
  payload: Omit<ClienteContacto, 'id' | 'cliente_id' | 'created_at' | 'updated_at'>
): Promise<ClienteContacto> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cliente_contactos')
    .insert({ ...payload, cliente_id: clienteId })
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(`/clientes/${clienteId}`)
  return data as ClienteContacto
}

export async function actualizarContacto(
  id: string,
  clienteId: string,
  payload: Partial<Omit<ClienteContacto, 'id' | 'cliente_id' | 'created_at' | 'updated_at'>>
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cliente_contactos')
    .update(payload)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/clientes/${clienteId}`)
}

export async function eliminarContacto(id: string, clienteId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('cliente_contactos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/clientes/${clienteId}`)
}

// ─── PROYECTOS ───────────────────────────────────────────────────────────────

export async function getProyectosCliente(clienteId: string): Promise<Proyecto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proyectos')
    .select('*, cliente:clientes(id, nombre, empresa)')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Proyecto[]
}

export async function getProyecto(id: string): Promise<Proyecto | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proyectos')
    .select('*, cliente:clientes(id, nombre, empresa)')
    .eq('id', id)
    .single()
  if (error) return null
  return data as Proyecto
}

export async function crearProyecto(
  payload: Omit<Proyecto, 'id' | 'created_at' | 'updated_at' | 'cliente'>
): Promise<Proyecto> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data, error } = await supabase
    .from('proyectos')
    .insert({ ...payload, created_by: user.id })
    .select('*, cliente:clientes(id, nombre, empresa)')
    .single()
  if (error) throw new Error(error.message)
  if (payload.cliente_id) revalidatePath(`/clientes/${payload.cliente_id}`)
  revalidatePath('/clientes')
  return data as Proyecto
}

export async function actualizarProyecto(
  id: string,
  payload: Partial<Pick<Proyecto, 'nombre' | 'estado' | 'descripcion' | 'notas' | 'fecha_inicio' | 'fecha_cierre' | 'cliente_id'>>
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('proyectos').update(payload).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/proyectos/${id}`)
  revalidatePath('/clientes')
}

// ─── TAREAS ──────────────────────────────────────────────────────────────────

export async function getTareasProyecto(proyectoId: string): Promise<ProyectoTarea[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proyecto_tareas')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return data as ProyectoTarea[]
}

export async function getTareasCliente(clienteId: string): Promise<(ProyectoTarea & { proyecto_nombre: string })[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proyecto_tareas')
    .select('*, proyecto:proyectos!inner(id, nombre, cliente_id)')
    .eq('proyecto.cliente_id', clienteId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return ((data ?? []) as any[]).map(t => ({
    ...t,
    proyecto_nombre: t.proyecto?.nombre ?? '',
  }))
}

export async function crearTarea(proyectoId: string, texto: string): Promise<ProyectoTarea> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proyecto_tareas')
    .insert({ proyecto_id: proyectoId, texto })
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(`/proyectos/${proyectoId}`)
  return data as ProyectoTarea
}

export async function toggleTarea(id: string, completada: boolean, proyectoId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('proyecto_tareas').update({ completada }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/proyectos/${proyectoId}`)
}

export async function eliminarTarea(id: string, proyectoId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('proyecto_tareas').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/proyectos/${proyectoId}`)
}

// ─── CONTACTOS DE PROYECTO ────────────────────────────────────────────────────

export async function getContactosProyecto(proyectoId: string): Promise<ProyectoContacto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proyecto_contactos')
    .select('*, contacto:cliente_contactos(*)')
    .eq('proyecto_id', proyectoId)
  if (error) throw new Error(error.message)
  return data as ProyectoContacto[]
}

export async function vincularContactoProyecto(
  proyectoId: string,
  contactoId: string,
  rol?: string
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('proyecto_contactos')
    .upsert({ proyecto_id: proyectoId, contacto_id: contactoId, rol_en_proyecto: rol ?? null })
  if (error) throw new Error(error.message)
  revalidatePath(`/proyectos/${proyectoId}`)
}

export async function desvincularContactoProyecto(proyectoId: string, contactoId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('proyecto_contactos')
    .delete()
    .eq('proyecto_id', proyectoId)
    .eq('contacto_id', contactoId)
  if (error) throw new Error(error.message)
  revalidatePath(`/proyectos/${proyectoId}`)
}

// ─── MÉTRICAS PROYECTO ───────────────────────────────────────────────────────

export type CotizacionProyecto = {
  id: string
  nombre: string
  estado: string
  fecha_factura_emitida: string | null
  numero_factura: string | null
  fecha_pago_recibido: string | null
  total: number   // calculado desde departamentos
}

export type MetricasProyecto = {
  cotizaciones: CotizacionProyecto[]
  total_cotizado: number
  total_facturado: number
  total_cobrado: number
  total_rendido: number
  margen_bruto: number
}

export async function getMetricasProyecto(proyectoId: string): Promise<MetricasProyecto> {
  const supabase = await createClient()

  // Cotizaciones con items para calcular totales
  const { data: cots } = await supabase
    .from('cotizaciones')
    .select(`
      id, nombre, estado, fecha_factura_emitida, numero_factura, fecha_pago_recibido,
      departamentos:cotizacion_departamentos(
        *,
        subgrupos:cotizacion_subgrupos(*, items:cotizacion_items(*)),
        items:cotizacion_items(*)
      )
    `)
    .eq('proyecto_id', proyectoId)
    .not('estado', 'eq', 'borrador')

  const cotizaciones: CotizacionProyecto[] = (cots ?? []).map((c: any) => {
    // Filtrar items directos (sin subgrupo)
    const deps = (c.departamentos ?? []).map((d: any) => ({
      ...d,
      items: (d.items ?? []).filter((i: any) => !i.subgrupo_id),
    }))
    const total = deps.reduce((s: number, d: any) => s + subtotalDepartamento(d), 0)
    return {
      id: c.id,
      nombre: c.nombre,
      estado: c.estado,
      fecha_factura_emitida: c.fecha_factura_emitida ?? null,
      numero_factura: c.numero_factura ?? null,
      fecha_pago_recibido: c.fecha_pago_recibido ?? null,
      total,
    }
  })

  const total_cotizado = cotizaciones.reduce((s, c) => s + c.total, 0)
  const total_facturado = cotizaciones
    .filter(c => c.fecha_factura_emitida)
    .reduce((s, c) => s + c.total, 0)
  const total_cobrado = cotizaciones
    .filter(c => c.fecha_pago_recibido)
    .reduce((s, c) => s + c.total, 0)

  // Gastos aprobados via rendiciones de este proyecto
  const cotIds = (cots ?? []).map((c: any) => c.id)
  let total_rendido = 0
  if (cotIds.length > 0) {
    const { data: rendRows } = await supabase
      .from('rendiciones')
      .select('id')
      .in('cotizacion_id', cotIds)
    const rendIds = (rendRows ?? []).map((r: any) => r.id)
    if (rendIds.length > 0) {
      const { data: gastos } = await supabase
        .from('rendicion_gastos')
        .select('monto')
        .in('rendicion_id', rendIds)
        .in('estado', ['aprobada', 'pago_aprobado'])
      total_rendido = (gastos ?? []).reduce((s: number, g: any) => s + (g.monto ?? 0), 0)
    }
  }

  return {
    cotizaciones,
    total_cotizado,
    total_facturado,
    total_cobrado,
    total_rendido,
    margen_bruto: total_cobrado - total_rendido,
  }
}

// ─── AUTO-CREAR PROYECTO (llamado desde responderCotizacion) ─────────────────

export async function autoCrearProyectoDesdeAprobacion(
  cotizacionId: string,
  cotizacionNombre: string,
  clienteId: string | null
): Promise<string | null> {
  const admin = createAdminClient()

  // Verificar que la cotización no tenga ya un proyecto
  const { data: cot } = await admin
    .from('cotizaciones')
    .select('proyecto_id')
    .eq('id', cotizacionId)
    .single()

  if (cot?.proyecto_id) return cot.proyecto_id // ya tiene, no crear

  const { data: proyecto, error } = await admin
    .from('proyectos')
    .insert({
      nombre: cotizacionNombre,
      cliente_id: clienteId,
      estado: 'activo',
    })
    .select('id')
    .single()

  if (error || !proyecto) return null

  // Vincular la cotización al nuevo proyecto
  await admin
    .from('cotizaciones')
    .update({ proyecto_id: proyecto.id })
    .eq('id', cotizacionId)

  if (clienteId) revalidatePath(`/clientes/${clienteId}`)
  revalidatePath('/clientes')
  return proyecto.id
}
