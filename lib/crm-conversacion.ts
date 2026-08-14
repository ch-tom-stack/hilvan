// lib/crm-conversacion.ts
// Hilos y respuestas de la bitácora, en un solo lugar.
//
// La UI escribe con el cliente de sesión y el operador con el admin, pero las
// reglas son las mismas: qué hilo recibe el mensaje, a qué se contesta, qué
// pasa con `respondido`, qué deja de contar cuando una línea se cierra.
// Duplicar eso en la action y en el endpoint es exactamente cómo se llega a que
// la misma pregunta tenga dos respuestas — que es el bug que arreglamos hoy.

import type { SupabaseClient } from '@supabase/supabase-js'

type Cliente = SupabaseClient<any, any, any>

function hoyChileISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

function limpio(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

/**
 * El hilo abierto más reciente del prospecto; si no hay ninguno, abre uno.
 *
 * Que registrar un toque no exija elegir hilo es deliberado: la fricción de
 * pedir contexto antes de anotar "le escribí" es lo que dejó la bitácora vacía
 * la primera vez.
 */
export async function hiloVigente(
  client: Cliente,
  prospectoId: string,
  responsableId?: string | null,
): Promise<string | null> {
  const { data: abierto } = await client
    .from('crm_hilos')
    .select('id')
    .eq('prospecto_id', prospectoId)
    .is('cerrado_at', null)
    .order('abierto_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (abierto) return (abierto as { id: string }).id

  const [{ data: p }, { data: contactos }] = await Promise.all([
    client.from('prospectos').select('responsable_id').eq('id', prospectoId).maybeSingle(),
    client.from('crm_contactos').select('id').eq('prospecto_id', prospectoId),
  ])

  // Si la marca tiene UNA sola persona, la línea nace con ella. Con dos o más
  // sería adivinar con quién se está hablando, que es justo lo que el hilo
  // responde. Sin esto se acumulan líneas sin nadie asignado: llegaron a ser 29.
  const solos = (contactos ?? []) as { id: string }[]

  const { data: nuevo } = await client
    .from('crm_hilos')
    .insert({
      prospecto_id: prospectoId,
      responsable_id: (p as any)?.responsable_id ?? responsableId ?? null,
      contacto_id: solos.length === 1 ? solos[0].id : null,
    })
    .select('id')
    .maybeSingle()
  return (nuevo as { id: string } | null)?.id ?? null
}

export interface RespuestaInput {
  fecha?: string
  tipo?: string
  resumen?: string
  cuerpo?: string
  contacto_id?: string
  responde_a?: string
  hilo_id?: string
  gmail_thread?: string
}

/**
 * Registra un mensaje RECIBIDO y marca como respondido aquel al que contesta.
 *
 * Ese segundo paso es el que importa: el motor de cadencia saca el estado
 * 'respondio' —el más urgente, porque le debemos respuesta a alguien que
 * habló— del flag del mensaje enviado, no de la existencia del recibido.
 */
export async function insertarRespuesta(
  client: Cliente,
  prospectoId: string,
  input: RespuestaInput,
  registradoPor?: string | null,
): Promise<{ id?: string; hilo_id?: string | null; responde_a?: string | null; error?: string }> {
  const hiloId = input.hilo_id || (await hiloVigente(client, prospectoId))

  let respondeA = input.responde_a || null
  if (!respondeA) {
    // El último mensaje NUESTRO: es al que, por defecto, están contestando.
    const { data: ultimo } = await client
      .from('crm_interacciones')
      .select('id')
      .eq('prospecto_id', prospectoId)
      .eq('direccion', 'enviado')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()
    respondeA = (ultimo as { id: string } | null)?.id ?? null
  }

  const { data, error } = await client
    .from('crm_interacciones')
    .insert({
      prospecto_id: prospectoId,
      fecha: input.fecha || hoyChileISO(),
      tipo: limpio(input.tipo) ?? 'correo',
      resumen: limpio(input.resumen),
      cuerpo: limpio(input.cuerpo),
      gmail_thread: limpio(input.gmail_thread),
      hilo_id: hiloId,
      direccion: 'recibido',
      contacto_id: input.contacto_id || null,
      responde_a: respondeA,
      registrado_por: registradoPor ?? null,
      // Un recibido no es un toque nuestro: el motor lo ignora por `direccion`.
      respondido: false,
    })
    .select('id')
    .maybeSingle()
  if (error) return { error: error.message }

  if (respondeA) {
    const { error: e2 } = await client
      .from('crm_interacciones').update({ respondido: true }).eq('id', respondeA)
    if (e2) return { error: e2.message }
  }

  return { id: (data as { id: string } | null)?.id, hilo_id: hiloId, responde_a: respondeA }
}

/**
 * Cierra una línea y saca sus toques del reloj.
 *
 * El segundo update es la denormalización descrita en sql/crm-hilos.sql: la
 * verdad es `cerrado_at`, pero el motor de cadencia se lee en el digest diario
 * y en cada herramienta del operador, y no vale la pena colgarle un embed
 * anidado a la consulta más usada del CRM por algo que cambia cada tantos meses.
 */
export async function cerrarHiloEn(
  client: Cliente,
  hiloId: string,
  motivo: string,
): Promise<string | null> {
  const { error } = await client
    .from('crm_hilos')
    .update({ cerrado_at: hoyChileISO(), motivo_cierre: motivo })
    .eq('id', hiloId)
  if (error) return error.message

  const { error: e2 } = await client
    .from('crm_interacciones').update({ cuenta_cadencia: false }).eq('hilo_id', hiloId)
  return e2?.message ?? null
}

export async function reabrirHiloEn(client: Cliente, hiloId: string): Promise<string | null> {
  const { error } = await client
    .from('crm_hilos').update({ cerrado_at: null, motivo_cierre: null }).eq('id', hiloId)
  if (error) return error.message

  const { error: e2 } = await client
    .from('crm_interacciones').update({ cuenta_cadencia: true }).eq('hilo_id', hiloId)
  return e2?.message ?? null
}

/** Abre una línea nueva; por defecto cierra las vigentes. */
export async function abrirHiloEn(
  client: Cliente,
  prospectoId: string,
  opts: { contacto_id?: string | null; titulo?: string | null; motivo_cierre?: string; cerrar_actual?: boolean } = {},
): Promise<{ hilo_id?: string; error?: string }> {
  if (opts.cerrar_actual !== false) {
    const { data: abiertos } = await client
      .from('crm_hilos').select('id').eq('prospecto_id', prospectoId).is('cerrado_at', null)
    for (const h of (abiertos ?? []) as { id: string }[]) {
      const err = await cerrarHiloEn(client, h.id, opts.motivo_cierre || 'cambio_contacto')
      if (err) return { error: err }
    }
  }

  const { data: p } = await client
    .from('prospectos').select('responsable_id').eq('id', prospectoId).maybeSingle()

  const { data, error } = await client
    .from('crm_hilos')
    .insert({
      prospecto_id: prospectoId,
      contacto_id: opts.contacto_id || null,
      responsable_id: (p as any)?.responsable_id ?? null,
      titulo: limpio(opts.titulo),
    })
    .select('id')
    .maybeSingle()
  if (error) return { error: error.message }
  return { hilo_id: (data as { id: string } | null)?.id }
}
