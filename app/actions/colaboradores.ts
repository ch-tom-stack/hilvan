'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Colaborador, ColaboradorTarifa, ColaboradorLinkTemporal } from '@/types'

// ─── COLABORADORES ────────────────────────────────────────────────────────────

export async function getColaboradores(q?: string, especialidad?: string) {
  const supabase = await createClient()
  let query = supabase
    .from('colaboradores')
    .select('*')
    .order('nombre')

  if (q) query = query.ilike('nombre', `%${q}%`)
  if (especialidad) query = query.contains('especialidades', [especialidad])

  const { data, error } = await query
  if (error) throw error
  return data as Colaborador[]
}

export async function buscarColaboradores(q: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('colaboradores')
    .select('id, nombre, email, telefono, rol_habitual, tipo_documento, banco, tipo_cuenta, numero_cuenta')
    .ilike('nombre', `%${q}%`)
    .eq('disponible', true)
    .order('nombre')
    .limit(8)
  return (data ?? []) as Colaborador[]
}

export async function getColaborador(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Colaborador
}

export async function crearColaborador(payload: Partial<Colaborador> & { nombre: string }) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('colaboradores')
    .insert({
      nombre: payload.nombre,
      rut: payload.rut || null,
      email: payload.email || null,
      telefono: payload.telefono || null,
      tipo_persona: payload.tipo_persona || 'natural',
      razon_social: payload.razon_social || null,
      tipo_documento: payload.tipo_documento || null,
      alerta_tributaria: payload.alerta_tributaria || null,
      banco: payload.banco || null,
      tipo_cuenta: payload.tipo_cuenta || null,
      numero_cuenta: payload.numero_cuenta || null,
      disponible: payload.disponible ?? true,
      requiere_release: payload.requiere_release ?? false,
      contrato_marco: payload.contrato_marco ?? false,
      especialidades: payload.especialidades || [],
      notas_internas: payload.notas_internas || null,
    })
    .select()
    .single()
  if (error) throw error
  revalidatePath('/colaboradores')
  return data as Colaborador
}

export async function actualizarColaborador(id: string, payload: Partial<Colaborador>) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('colaboradores')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  revalidatePath('/colaboradores')
  revalidatePath(`/colaboradores/${id}`)
}

export async function eliminarColaborador(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('colaboradores').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/colaboradores')
}

// ─── TARIFAS ─────────────────────────────────────────────────────────────────

export async function getTarifas(colaboradorId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('colaboradores_tarifas')
    .select('*, rodaje:rodajes(nombre, fecha)')
    .eq('colaborador_id', colaboradorId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as ColaboradorTarifa[]
}

export async function crearTarifa(payload: {
  colaborador_id: string
  rodaje_id?: string
  rol?: string
  monto_dia: number
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('colaboradores_tarifas').insert(payload)
  if (error) throw error
  revalidatePath(`/colaboradores/${payload.colaborador_id}`)
}

export async function eliminarTarifa(id: string, colaboradorId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('colaboradores_tarifas').delete().eq('id', id)
  if (error) throw error
  revalidatePath(`/colaboradores/${colaboradorId}`)
}

// ─── LINKS TEMPORALES ─────────────────────────────────────────────────────────

export async function crearLinkTemporal(colaboradorId: string, rodajeId?: string, diasExpiracion = 7) {
  const supabase = await createClient()
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const expires_at = new Date(Date.now() + diasExpiracion * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('colaboradores_links_temporales')
    .insert({ colaborador_id: colaboradorId, rodaje_id: rodajeId || null, token, expires_at })
    .select()
    .single()
  if (error) throw error
  revalidatePath(`/colaboradores/${colaboradorId}`)
  return data as ColaboradorLinkTemporal
}

export async function getLinksPorColaborador(colaboradorId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('colaboradores_links_temporales')
    .select('*, rodaje:rodajes(nombre)')
    .eq('colaborador_id', colaboradorId)
    .order('created_at', { ascending: false })
    .limit(5)
  return (data ?? []) as (ColaboradorLinkTemporal & { rodaje?: { nombre: string } })[]
}

export async function validarLinkTemporal(token: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('colaboradores_links_temporales')
    .select('*, colaborador:colaboradores(*), rodaje:rodajes(id, nombre, fecha)')
    .eq('token', token)
    .single()

  if (!data) return null
  if (new Date(data.expires_at) < new Date()) return null

  return data as ColaboradorLinkTemporal & {
    colaborador: Colaborador
    rodaje?: { id: string; nombre: string; fecha?: string }
  }
}

// ─── CONTRATOS ───────────────────────────────────────────────────────────────

export async function getContratos(colaboradorId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('contratos_generados')
    .select('*, rodaje:rodajes(nombre)')
    .eq('colaborador_id', colaboradorId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function registrarContrato(payload: {
  colaborador_id: string
  rodaje_id?: string
  tipo: string
  archivo_url?: string
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contratos_generados')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  revalidatePath(`/colaboradores/${payload.colaborador_id}`)
  return data
}
