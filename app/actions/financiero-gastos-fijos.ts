'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRol } from '@/lib/auth'
import type { GastoFijo, GastoFijoCuota, TipoGastoFijo } from '@/types'
import { generarFechaVencimiento } from './financiero-helpers'

// ─────────────────────────────────────────────────────────────────────────────
// CRÉDITOS Y CUOTAS
// ─────────────────────────────────────────────────────────────────────────────

export async function getGastosFijos(): Promise<GastoFijo[]> {
  await requireRol(['admin', 'contabilidad'])
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gastos_fijos')
    .select('*, cuotas:gastos_fijos_cuotas(*)')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((g: any) => ({
    ...g,
    cuotas: (g.cuotas ?? []).sort((a: any, b: any) => a.numero_cuota - b.numero_cuota),
  })) as GastoFijo[]
}

export async function crearGastoFijo(data: {
  nombre: string
  tipo: TipoGastoFijo
  acreedor: string
  descripcion: string
  monto_total: number
  monto_cuota: number
  n_cuotas: number
  dia_vencimiento: number
  fecha_inicio: string
  tasa_interes: number | null
}): Promise<GastoFijo> {
  await requireRol(['admin'])
  const supabase = await createClient()

  const { data: gasto, error } = await supabase
    .from('gastos_fijos')
    .insert({
      nombre: data.nombre,
      tipo: data.tipo,
      acreedor: data.acreedor || null,
      descripcion: data.descripcion || null,
      monto_total: data.monto_total,
      monto_cuota: data.monto_cuota,
      n_cuotas: data.n_cuotas,
      dia_vencimiento: data.dia_vencimiento,
      fecha_inicio: data.fecha_inicio,
      tasa_interes: data.tasa_interes,
      activo: true,
    })
    .select('*')
    .single()
  if (error) throw error

  const cuotas = Array.from({ length: data.n_cuotas }, (_, i) => ({
    gasto_fijo_id: (gasto as any).id,
    numero_cuota: i + 1,
    fecha_vencimiento: generarFechaVencimiento(data.fecha_inicio, i + 1, data.dia_vencimiento),
    monto: data.monto_cuota,
    pagada: false,
    fecha_pago: null,
  }))

  const { data: cuotasCreadas, error: errCuotas } = await supabase
    .from('gastos_fijos_cuotas')
    .insert(cuotas)
    .select('*')
  if (errCuotas) throw errCuotas

  return {
    ...(gasto as any),
    cuotas: (cuotasCreadas ?? []).sort((a: any, b: any) => a.numero_cuota - b.numero_cuota),
  } as GastoFijo
}

export async function eliminarGastoFijo(id: string): Promise<void> {
  await requireRol(['admin'])
  const supabase = await createClient()
  // cuotas se eliminan por CASCADE en la DB; si no, borrar primero
  await supabase.from('gastos_fijos_cuotas').delete().eq('gasto_fijo_id', id)
  const { error } = await supabase.from('gastos_fijos').delete().eq('id', id)
  if (error) throw error
}

export async function toggleGastoFijoActivo(id: string, activo: boolean): Promise<void> {
  await requireRol(['admin'])
  const supabase = await createClient()
  const { error } = await supabase.from('gastos_fijos').update({ activo }).eq('id', id)
  if (error) throw error
}

export async function marcarCuotaPagada(id: string, fecha_pago: string): Promise<GastoFijoCuota> {
  await requireRol(['admin'])
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gastos_fijos_cuotas')
    .update({ pagada: true, fecha_pago })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as GastoFijoCuota
}

export async function desmarcarCuotaPagada(id: string): Promise<GastoFijoCuota> {
  await requireRol(['admin'])
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gastos_fijos_cuotas')
    .update({ pagada: false, fecha_pago: null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as GastoFijoCuota
}
