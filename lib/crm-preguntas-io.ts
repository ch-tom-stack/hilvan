// lib/crm-preguntas-io.ts
// "¿En qué quedó?" — la parte que toca la base.

import type { SupabaseClient } from '@supabase/supabase-js'
import { hiloVigente, insertarRespuesta } from '@/lib/crm-conversacion'
import {
  DIAS_SIN_REPREGUNTAR, DIAS_POSTERGACION_DEFECTO, ETIQUETA_RESPUESTA,
  diasEntre, sumarDias, type CandidatoPregunta, type MotivoPregunta, type RespuestaPregunta,
} from '@/lib/crm-preguntas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA = /^\d{4}-\d{2}-\d{2}$/

export function hoyChile(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/**
 * Prospectos por los que NO hay que preguntar hoy: alguien ya contestó hace poco
 * (incluido "nada nuevo" — preguntar todos los días enseña a ignorar el correo).
 */
export async function prospectosRecienContestados(admin: SupabaseClient): Promise<Set<string>> {
  const desde = new Date(Date.now() - DIAS_SIN_REPREGUNTAR * 86_400_000).toISOString()
  const { data, error } = await admin
    .from('crm_preguntas').select('prospecto_id').not('respuesta', 'is', null).gte('respondida_at', desde)
  if (error) return new Set()
  return new Set((data ?? []).map(f => (f as { prospecto_id: string }).prospecto_id))
}

/**
 * Deja una pregunta abierta por candidato y devuelve su token. Si ya hay una
 * vigente para esa persona y ese prospecto se REUSA: el link del correo de ayer
 * y el de hoy son el mismo, y contestar cualquiera cierra la pregunta.
 */
export async function asegurarPreguntas(
  admin: SupabaseClient,
  perfilId: string,
  candidatos: CandidatoPregunta[],
): Promise<Map<string, string>> {
  const tokens = new Map<string, string>()
  if (candidatos.length === 0) return tokens

  const ids = candidatos.map(c => c.prospecto_id)
  const { data: abiertas, error } = await admin
    .from('crm_preguntas')
    .select('prospecto_id, token')
    .eq('perfil_id', perfilId).is('respuesta', null)
    .gt('expires_at', new Date(Date.now() + 86_400_000).toISOString())  // que le quede al menos un día
    .in('prospecto_id', ids)
  // Si la tabla no existe todavía, el digest sale igual, sin la sección.
  if (error) return tokens
  for (const a of abiertas ?? []) {
    const f = a as { prospecto_id: string; token: string }
    tokens.set(f.prospecto_id, f.token)
  }

  const nuevas = candidatos.filter(c => !tokens.has(c.prospecto_id))
  if (nuevas.length > 0) {
    const { data: creadas, error: eC } = await admin
      .from('crm_preguntas')
      .insert(nuevas.map(c => ({ prospecto_id: c.prospecto_id, perfil_id: perfilId, motivo: c.motivo })))
      .select('prospecto_id, token')
    if (eC) { console.error('[crm-preguntas] crear:', eC.message); return tokens }
    for (const c of creadas ?? []) {
      const f = c as { prospecto_id: string; token: string }
      tokens.set(f.prospecto_id, f.token)
    }
  }
  return tokens
}

export interface PreguntaAbierta {
  token: string
  empresa: string
  etapa: string
  motivo: MotivoPregunta
  quien: string
  ultimaFecha: string | null
  ultimoTipo: string | null
  dias: number | null
  plantonesPrevios: number
  estado: 'abierta' | 'respondida' | 'vencida'
  respuesta: RespuestaPregunta | null
}

const PLANTON = 'No llegó a la reunión'

export async function leerPregunta(admin: SupabaseClient, token: string): Promise<PreguntaAbierta | null> {
  if (!UUID.test(token)) return null
  const { data: p } = await admin
    .from('crm_preguntas')
    .select('token, motivo, respuesta, expires_at, prospecto_id, perfil_id')
    .eq('token', token).maybeSingle()
  if (!p) return null
  const fila = p as { token: string; motivo: MotivoPregunta; respuesta: RespuestaPregunta | null; expires_at: string; prospecto_id: string; perfil_id: string }

  const [{ data: pro }, { data: perfil }, { data: toques }] = await Promise.all([
    admin.from('prospectos').select('empresa, etapa').eq('id', fila.prospecto_id).maybeSingle(),
    admin.from('profiles').select('nombre').eq('id', fila.perfil_id).maybeSingle(),
    admin.from('crm_interacciones').select('fecha, tipo, resumen').eq('prospecto_id', fila.prospecto_id)
      .order('fecha', { ascending: false }).limit(50),
  ])
  if (!pro) return null

  const lista = (toques ?? []) as { fecha: string | null; tipo: string | null; resumen: string | null }[]
  const ultimo = lista.find(t => t.fecha) ?? null
  const hoy = hoyChile()
  return {
    token: fila.token,
    empresa: (pro as { empresa: string }).empresa,
    etapa: (pro as { etapa: string }).etapa,
    motivo: fila.motivo,
    quien: (perfil as { nombre: string } | null)?.nombre ?? '',
    ultimaFecha: ultimo?.fecha ?? null,
    ultimoTipo: ultimo?.tipo ?? null,
    dias: ultimo?.fecha ? diasEntre(ultimo.fecha, hoy) : null,
    plantonesPrevios: lista.filter(t => (t.resumen ?? '').startsWith(PLANTON)).length,
    estado: fila.respuesta ? 'respondida' : new Date(fila.expires_at) < new Date() ? 'vencida' : 'abierta',
    respuesta: fila.respuesta,
  }
}

export interface InputRespuesta {
  respuesta: RespuestaPregunta
  detalle?: string | null
  /** Solo 'postergo': hasta cuándo sale de la lista. */
  hasta?: string | null
  /** Solo 'hablamos': por dónde. */
  canal?: 'mensaje' | 'llamada' | 'reunion' | null
}

/**
 * Aplica la respuesta al CRM. El token ES la autorización (como en el portal de
 * rendiciones): se valida que exista, que no haya vencido y que no esté usada.
 * Todo se valida antes de la primera escritura.
 */
export async function aplicarRespuesta(
  admin: SupabaseClient,
  token: string,
  input: InputRespuesta,
): Promise<{ ok: true; empresa: string } | { ok: false; error: string }> {
  if (!UUID.test(token)) return { ok: false, error: 'Link inválido' }
  const { data: p } = await admin
    .from('crm_preguntas').select('id, prospecto_id, perfil_id, respuesta, expires_at').eq('token', token).maybeSingle()
  if (!p) return { ok: false, error: 'Link inválido' }
  const preg = p as { id: string; prospecto_id: string; perfil_id: string; respuesta: string | null; expires_at: string }
  if (preg.respuesta) return { ok: false, error: 'Esta pregunta ya fue contestada' }
  if (new Date(preg.expires_at) < new Date()) return { ok: false, error: 'El link venció. Llega uno nuevo en el próximo correo.' }

  const detalle = (input.detalle ?? '').trim().slice(0, 1000) || null
  const hoy = hoyChile()
  let hasta: string | null = null
  if (input.respuesta === 'postergo') {
    hasta = input.hasta && FECHA.test(input.hasta) ? input.hasta : sumarDias(hoy, DIAS_POSTERGACION_DEFECTO)
    if (hasta <= hoy) return { ok: false, error: 'La fecha tiene que ser futura' }
  }
  const canal = input.canal === 'llamada' || input.canal === 'reunion' ? input.canal : 'mensaje'

  const { data: pro } = await admin
    .from('prospectos').select('empresa, etapa, snooze_hasta').eq('id', preg.prospecto_id).maybeSingle()
  if (!pro) return { ok: false, error: 'El prospecto ya no existe' }
  const prospecto = pro as { empresa: string; etapa: string; snooze_hasta: string | null }
  const { data: perfil } = await admin.from('profiles').select('nombre').eq('id', preg.perfil_id).maybeSingle()
  const quien = (perfil as { nombre: string } | null)?.nombre ?? 'el equipo'
  const firma = ` — reportado por ${quien}`

  const efecto: Record<string, unknown> = {}

  // Se reserva la pregunta ANTES de escribir en el CRM: dos clics seguidos (o el
  // mismo link abierto en dos pestañas) no pueden registrar dos veces.
  const { data: reservada, error: eR } = await admin
    .from('crm_preguntas')
    .update({ respuesta: input.respuesta, detalle, respondida_at: new Date().toISOString() })
    .eq('id', preg.id).is('respuesta', null).select('id')
  if (eR) return { ok: false, error: eR.message }
  if (!reservada || reservada.length === 0) return { ok: false, error: 'Esta pregunta ya fue contestada' }

  const soltar = async (mensaje: string) => {
    await admin.from('crm_preguntas').update({ respuesta: null, detalle: null, respondida_at: null }).eq('id', preg.id)
    return { ok: false as const, error: mensaje }
  }

  if (input.respuesta === 'hablamos' || input.respuesta === 'planto') {
    const esPlanton = input.respuesta === 'planto'
    const resumen = esPlanton
      ? `${PLANTON}${detalle ? `. ${detalle}` : ''}${firma}`
      : `${detalle ?? 'Hablamos por otro canal (sin detalle)'}${firma}`
    const hiloId = await hiloVigente(admin, preg.prospecto_id)
    const { data: i, error } = await admin.from('crm_interacciones').insert({
      prospecto_id: preg.prospecto_id, fecha: hoy, tipo: esPlanton ? 'reunion' : canal,
      direccion: 'enviado', resumen, hilo_id: hiloId, respondido: false, enviado_por_id: preg.perfil_id,
    }).select('id').single()
    if (error || !i) return soltar(error?.message ?? 'No se pudo registrar')
    efecto.interaccion_id = (i as { id: string }).id
    await admin.from('prospectos').update({ snooze_hasta: null }).eq('id', preg.prospecto_id)
  }

  if (input.respuesta === 'postergo' || input.respuesta === 'no') {
    const base = input.respuesta === 'postergo' ? `Postergó hasta el ${hasta}` : 'Dijo que no'
    const r = await insertarRespuesta(admin, preg.prospecto_id, {
      fecha: hoy, tipo: 'mensaje', resumen: `${base}${detalle ? `. ${detalle}` : ''}${firma}`,
    }, preg.perfil_id)
    if (r.error || !r.id) return soltar(r.error ?? 'No se pudo registrar')
    efecto.interaccion_id = r.id
    efecto.marco_respondido = r.responde_a ?? null

    const cambio = input.respuesta === 'postergo' ? { snooze_hasta: hasta } : { etapa: 'descartado' }
    efecto.previo = input.respuesta === 'postergo' ? { snooze_hasta: prospecto.snooze_hasta } : { etapa: prospecto.etapa }
    const { error } = await admin.from('prospectos').update(cambio).eq('id', preg.prospecto_id)
    if (error) {
      await admin.from('crm_interacciones').delete().eq('id', r.id)
      return soltar(error.message)
    }
  }

  await admin.from('crm_preguntas').update({ efecto: { ...efecto, etiqueta: ETIQUETA_RESPUESTA[input.respuesta] } }).eq('id', preg.id)
  return { ok: true, empresa: prospecto.empresa }
}
