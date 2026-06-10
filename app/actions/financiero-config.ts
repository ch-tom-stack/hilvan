'use server'

import { requireRol } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { type PersonaNomina, NOMINA_DEFAULT } from './financiero-helpers'

// ── Lecturas internas de configuracion_financiero (sin check de rol) ──────────
// Estas funciones se usan desde getDatosFinancieros (que ya validó el rol).
// Las versiones exportadas públicas añaden requireRol encima.

export async function _getPPMTasa(): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('configuracion_financiero')
    .select('valor')
    .eq('clave', 'ppm_tasa')
    .single()
  return data ? parseFloat(data.valor) : 0.05
}

export async function _getPreviredMensual(): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('configuracion_financiero')
    .select('valor')
    .eq('clave', 'previred_mensual')
    .single()
  return data ? parseInt(data.valor, 10) : 0
}

export async function _getIUSCMensual(): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('configuracion_financiero')
    .select('valor')
    .eq('clave', 'iusc_mensual')
    .single()
  return data ? parseInt(data.valor, 10) : 0
}

export async function _getNomina(): Promise<PersonaNomina[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('configuracion_financiero')
    .select('valor')
    .eq('clave', 'nomina_personas')
    .single()
  if (!data?.valor) return NOMINA_DEFAULT
  try { return JSON.parse(data.valor) } catch { return NOMINA_DEFAULT }
}

// ── Versiones públicas (exportadas) con validación de rol ─────────────────────

export async function getPPMTasa(): Promise<number> {
  await requireRol(['admin', 'contabilidad'])
  return _getPPMTasa()
}

export async function setPPMTasa(tasa: number): Promise<{ error?: string }> {
  await requireRol(['admin'])
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('configuracion_financiero')
    .upsert({ clave: 'ppm_tasa', valor: String(tasa), updated_at: new Date().toISOString() })
  return error ? { error: error.message } : {}
}

export async function getPreviredMensual(): Promise<number> {
  await requireRol(['admin', 'contabilidad'])
  return _getPreviredMensual()
}

export async function setPreviredMensual(monto: number): Promise<{ error?: string }> {
  await requireRol(['admin'])
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('configuracion_financiero')
    .upsert({ clave: 'previred_mensual', valor: String(Math.round(monto)), updated_at: new Date().toISOString() })
  return error ? { error: error.message } : {}
}

export async function getIUSCMensual(): Promise<number> {
  await requireRol(['admin', 'contabilidad'])
  return _getIUSCMensual()
}

export async function setIUSCMensual(monto: number): Promise<{ error?: string }> {
  await requireRol(['admin'])
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('configuracion_financiero')
    .upsert({ clave: 'iusc_mensual', valor: String(Math.round(monto)), updated_at: new Date().toISOString() })
  return error ? { error: error.message } : {}
}

export async function getNomina(): Promise<PersonaNomina[]> {
  await requireRol(['admin', 'contabilidad'])
  return _getNomina()
}

export async function setNomina(personas: PersonaNomina[]): Promise<{ error?: string }> {
  await requireRol(['admin'])
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('configuracion_financiero')
    .upsert({ clave: 'nomina_personas', valor: JSON.stringify(personas), updated_at: new Date().toISOString() })
  return error ? { error: error.message } : {}
}
