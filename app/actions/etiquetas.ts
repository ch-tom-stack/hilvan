'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Etiqueta } from '@/types'

// Sets SEPARADOS por módulo: cotizacion_etiquetas y rodaje_etiquetas son
// catálogos independientes (ver sql/etiquetas.sql). Mismo shape, tablas
// distintas — de ahí que cada módulo tenga su propio trío de funciones en vez
// de una sola parametrizada por nombre de tabla (evita construir SQL con
// interpolación de nombres de tabla).

const PALETA_DEFECTO = '#7a9e7e'

function limpiarTexto(texto: string): string {
  return texto.trim().slice(0, 40)
}

// ─── Cotizaciones (se asignan al GRUPO, no a cada versión) ────────────────────

export async function getEtiquetasCotizacion(): Promise<Etiqueta[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cotizacion_etiquetas')
    .select('*')
    .order('texto')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function crearEtiquetaCotizacion(texto: string, color: string = PALETA_DEFECTO): Promise<Etiqueta> {
  const supabase = await createClient()
  const limpio = limpiarTexto(texto)
  if (!limpio) throw new Error('Falta el texto de la etiqueta')

  // Si ya existe (case-insensitive), la reusa en vez de duplicar.
  const { data: existente } = await supabase
    .from('cotizacion_etiquetas')
    .select('*')
    .ilike('texto', limpio)
    .maybeSingle()
  if (existente) return existente as Etiqueta

  const { data, error } = await supabase
    .from('cotizacion_etiquetas')
    .insert({ texto: limpio, color })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/cotizaciones')
  return data as Etiqueta
}

export async function asignarEtiquetaCotizacion(grupoId: string, etiquetaId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotizacion_grupo_etiquetas')
    .upsert({ grupo_id: grupoId, etiqueta_id: etiquetaId }, { onConflict: 'grupo_id,etiqueta_id' })
  if (error) throw new Error(error.message)
  revalidatePath('/cotizaciones')
}

export async function quitarEtiquetaCotizacion(grupoId: string, etiquetaId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotizacion_grupo_etiquetas')
    .delete()
    .eq('grupo_id', grupoId)
    .eq('etiqueta_id', etiquetaId)
  if (error) throw new Error(error.message)
  revalidatePath('/cotizaciones')
}

// ─── Rodajes ────────────────────────────────────────────────────────────────

export async function getEtiquetasRodaje(): Promise<Etiqueta[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rodaje_etiquetas')
    .select('*')
    .order('texto')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function crearEtiquetaRodaje(texto: string, color: string = PALETA_DEFECTO): Promise<Etiqueta> {
  const supabase = await createClient()
  const limpio = limpiarTexto(texto)
  if (!limpio) throw new Error('Falta el texto de la etiqueta')

  const { data: existente } = await supabase
    .from('rodaje_etiquetas')
    .select('*')
    .ilike('texto', limpio)
    .maybeSingle()
  if (existente) return existente as Etiqueta

  const { data, error } = await supabase
    .from('rodaje_etiquetas')
    .insert({ texto: limpio, color })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/rodaje')
  return data as Etiqueta
}

export async function asignarEtiquetaRodaje(rodajeId: string, etiquetaId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rodaje_etiqueta_asignaciones')
    .upsert({ rodaje_id: rodajeId, etiqueta_id: etiquetaId }, { onConflict: 'rodaje_id,etiqueta_id' })
  if (error) throw new Error(error.message)
  revalidatePath('/rodaje')
}

export async function quitarEtiquetaRodaje(rodajeId: string, etiquetaId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rodaje_etiqueta_asignaciones')
    .delete()
    .eq('rodaje_id', rodajeId)
    .eq('etiqueta_id', etiquetaId)
  if (error) throw new Error(error.message)
  revalidatePath('/rodaje')
}
