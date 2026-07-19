// lib/descuento-codigos.ts
// Códigos de descuento del pop-up de Rental: 10% en el primer arriendo, 90 días
// de vigencia. Se APILAN con la promo Jul-Ago y el descuento por volumen.
// Regla: UN código por correo (si vuelve a pedirlo, se le reenvía el mismo).

import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const DIAS_VIGENCIA = 90
export const PCT_DEFECTO = 10

// Alfabeto sin caracteres ambiguos (fuera 0/O, 1/I/L) → el código se puede
// dictar por teléfono o WhatsApp sin equivocarse.
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Genera un código tipo "CH10-K7M2P". */
export function generarCodigo(pct: number): string {
  const b = randomBytes(5)
  let s = ''
  for (let i = 0; i < 5; i++) s += ALFABETO[b[i] % ALFABETO.length]
  return `CH${pct}-${s}`
}

/** Normaliza lo que tipea el usuario: mayúsculas, sin espacios. */
export function normalizarCodigo(v: unknown): string {
  return String(v ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

function hoyISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function venceISO(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export interface CodigoEmitido { codigo: string; pct: number; vence_at: string; nuevo: boolean }

/**
 * Emite (o recupera) el código de un correo. Idempotente: un correo = un código
 * mientras siga vigente y sin usar. Devuelve null si la tabla no existe todavía.
 */
export async function emitirCodigo(
  admin: SupabaseClient,
  { email, nombre, pct = PCT_DEFECTO, origen = 'rental', dias = DIAS_VIGENCIA }: { email: string; nombre?: string | null; pct?: number; origen?: string; dias?: number },
): Promise<CodigoEmitido | null> {
  try {
    // ¿ya tiene uno vigente y sin usar?
    const { data: previo } = await admin
      .from('descuento_codigos')
      .select('codigo, pct, vence_at')
      .ilike('email', email)
      .eq('estado', 'emitido')
      .gte('vence_at', hoyISO())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ codigo: string; pct: number; vence_at: string }>()
    if (previo) return { ...previo, nuevo: false }

    const vence_at = venceISO(dias)
    // Reintenta ante colisión de código (improbable: 30^5 ≈ 24M).
    for (let intento = 0; intento < 5; intento++) {
      const codigo = generarCodigo(pct)
      const { data, error } = await admin
        .from('descuento_codigos')
        .insert({ codigo, email, nombre: nombre ?? null, pct, origen, estado: 'emitido', vence_at })
        .select('codigo, pct, vence_at')
        .single<{ codigo: string; pct: number; vence_at: string }>()
      if (!error && data) return { ...data, nuevo: true }
      if (error && !/duplicate|unique/i.test(error.message)) throw error
    }
    return null
  } catch (e) {
    console.error('[descuento-codigos] emitir:', e)
    return null
  }
}

export interface ValidacionCodigo { valido: boolean; pct: number; motivo?: string; email?: string }

/** Valida un código para aplicarlo. SIEMPRE en el servidor (el cliente no decide el %). */
export async function validarCodigo(admin: SupabaseClient, codigoRaw: unknown): Promise<ValidacionCodigo> {
  const codigo = normalizarCodigo(codigoRaw)
  if (!codigo) return { valido: false, pct: 0, motivo: 'Sin código' }
  try {
    const { data } = await admin
      .from('descuento_codigos')
      .select('codigo, pct, estado, vence_at, email')
      .eq('codigo', codigo)
      .maybeSingle<{ codigo: string; pct: number; estado: string; vence_at: string; email: string }>()
    if (!data) return { valido: false, pct: 0, motivo: 'Ese código no existe.' }
    if (data.estado === 'usado') return { valido: false, pct: 0, motivo: 'Ese código ya se usó.' }
    if (data.estado === 'anulado') return { valido: false, pct: 0, motivo: 'Ese código ya no está vigente.' }
    if (data.vence_at < hoyISO()) return { valido: false, pct: 0, motivo: 'Ese código venció.' }
    return { valido: true, pct: data.pct, email: data.email }
  } catch (e) {
    console.error('[descuento-codigos] validar:', e)
    return { valido: false, pct: 0, motivo: 'No pudimos validar el código.' }
  }
}

// ── Gestión (operador / agente) ────────────────────────────────────────────

export interface CodigoRow {
  codigo: string; email: string; nombre: string | null; pct: number
  origen: string; estado: string; vence_at: string; usado_at: string | null
  cotizacion_id: string | null; created_at: string
}

/** Lista códigos, con filtro opcional por estado (emitido/usado/anulado/vencido) o correo. */
export async function listarCodigos(
  admin: SupabaseClient,
  { estado, email, limite = 50 }: { estado?: string; email?: string; limite?: number } = {},
): Promise<CodigoRow[]> {
  let q = admin.from('descuento_codigos').select('*').order('created_at', { ascending: false }).limit(Math.min(200, limite))
  if (email) q = q.ilike('email', `%${email}%`)
  // 'vencido' no es un estado en DB: es 'emitido' con vence_at pasado.
  if (estado === 'vencido') q = q.eq('estado', 'emitido').lt('vence_at', hoyISO())
  else if (estado && estado !== 'todos') q = q.eq('estado', estado)
  const { data } = await q
  return (data ?? []) as CodigoRow[]
}

/** Crea un código a mano (para un trato/persona puntual). Idempotente por correo. */
export async function crearCodigoManual(
  admin: SupabaseClient,
  { email, nombre, pct = PCT_DEFECTO, dias = DIAS_VIGENCIA, origen = 'manual' }: { email: string; nombre?: string | null; pct?: number; dias?: number; origen?: string },
): Promise<CodigoEmitido | null> {
  return emitirCodigo(admin, { email, nombre, pct, origen, dias })
}

export interface CambioEstado { ok: boolean; error?: string; previo?: { estado: string; usado_at: string | null } }

/** Marca un código como 'usado' (se quema al confirmar la reserva). Guarda el previo para deshacer. */
export async function usarCodigo(admin: SupabaseClient, codigoRaw: unknown, cotizacion_id?: string | null): Promise<CambioEstado> {
  const codigo = normalizarCodigo(codigoRaw)
  const { data: actual } = await admin.from('descuento_codigos').select('estado, usado_at').eq('codigo', codigo).maybeSingle<{ estado: string; usado_at: string | null }>()
  if (!actual) return { ok: false, error: 'Ese código no existe.' }
  if (actual.estado === 'usado') return { ok: false, error: 'Ese código ya estaba usado.' }
  if (actual.estado === 'anulado') return { ok: false, error: 'Ese código está anulado.' }
  const { error } = await admin.from('descuento_codigos').update({ estado: 'usado', usado_at: new Date().toISOString(), ...(cotizacion_id ? { cotizacion_id } : {}) }).eq('codigo', codigo)
  if (error) return { ok: false, error: error.message }
  return { ok: true, previo: { estado: actual.estado, usado_at: actual.usado_at } }
}

/** Anula un código (lo mata). Guarda el previo para deshacer. */
export async function anularCodigo(admin: SupabaseClient, codigoRaw: unknown): Promise<CambioEstado> {
  const codigo = normalizarCodigo(codigoRaw)
  const { data: actual } = await admin.from('descuento_codigos').select('estado, usado_at').eq('codigo', codigo).maybeSingle<{ estado: string; usado_at: string | null }>()
  if (!actual) return { ok: false, error: 'Ese código no existe.' }
  if (actual.estado === 'anulado') return { ok: false, error: 'Ese código ya estaba anulado.' }
  const { error } = await admin.from('descuento_codigos').update({ estado: 'anulado' }).eq('codigo', codigo)
  if (error) return { ok: false, error: error.message }
  return { ok: true, previo: { estado: actual.estado, usado_at: actual.usado_at } }
}
