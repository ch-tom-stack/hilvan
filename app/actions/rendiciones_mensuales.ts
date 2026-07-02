'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { RendicionMensual, RendicionMensualGasto, EstadoRendicionMensual } from '@/types'

function periodoActual(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export async function getOCrearRendicionMensual(periodo?: string): Promise<RendicionMensual> {
  const supabase = await createClient()
  const p = periodo ?? periodoActual()

  const { data: existing } = await supabase
    .from('rendiciones_mensuales')
    .select('*')
    .eq('periodo', p)
    .single()

  if (existing) return existing as RendicionMensual

  const { data, error } = await supabase
    .from('rendiciones_mensuales')
    .insert({ periodo: p })
    .select()
    .single()

  if (error) throw error
  return data as RendicionMensual
}

export async function getRendicionMensualConGastos(periodo?: string): Promise<RendicionMensual> {
  const supabase = await createClient()
  const p = periodo ?? periodoActual()

  const { data: existing } = await supabase
    .from('rendiciones_mensuales')
    .select('*, gastos:rendicion_mensual_gastos(*)')
    .eq('periodo', p)
    .single()

  if (existing) return existing as RendicionMensual

  const { data, error } = await supabase
    .from('rendiciones_mensuales')
    .insert({ periodo: p })
    .select('*, gastos:rendicion_mensual_gastos(*)')
    .single()

  if (error) throw error
  return data as RendicionMensual
}

export async function getRendicionesMensuales(): Promise<RendicionMensual[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rendiciones_mensuales')
    .select('*, gastos:rendicion_mensual_gastos(*)')
    .order('periodo', { ascending: false })
  if (error) throw error
  return (data ?? []) as RendicionMensual[]
}

export async function agregarGastoMensual(payload: {
  rendicion_mensual_id: string
  descripcion: string
  monto: number
  categoria?: string | null
  archivo_url?: string | null
  tipo_documento?: string | null
  cargado_por: string
  cargado_por_id: string
  rut_emisor?: string | null
  razon_social_emisor?: string | null
  factura_casa_hiedra?: boolean
  documento_recibido?: boolean
  fecha_documento?: string | null
}): Promise<RendicionMensualGasto> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rendicion_mensual_gastos')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  revalidatePath('/costos/mensual')
  revalidatePath('/costos/admin')
  return data as RendicionMensualGasto
}

export async function eliminarGastoMensual(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('rendicion_mensual_gastos').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/costos/mensual')
  revalidatePath('/costos/admin')
}

export async function actualizarEstadoRendicionMensual(
  id: string,
  estado: EstadoRendicionMensual
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rendiciones_mensuales')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  revalidatePath('/costos/mensual')
  revalidatePath('/costos/admin')
}

export async function actualizarPresupuestoMensual(id: string, presupuesto: number): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rendiciones_mensuales')
    .update({ presupuesto, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  revalidatePath('/costos/mensual')
}

export async function exportarCSVGastosMensual(rendicionId: string): Promise<string> {
  const supabase = await createClient()
  const { data: gastos, error } = await supabase
    .from('rendicion_mensual_gastos')
    .select('*')
    .eq('rendicion_mensual_id', rendicionId)
    .order('created_at')

  if (error) throw error

  const rows = (gastos ?? []).map((g: RendicionMensualGasto) => [
    g.descripcion,
    g.monto,
    g.categoria ?? '',
    g.cargado_por,
    g.tipo_documento ?? '',
    g.created_at.slice(0, 10),
  ])

  const header = ['Descripción', 'Monto', 'Categoría', 'Cargado por', 'Tipo documento', 'Fecha']
  const lines = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  return lines.join('\n')
}
