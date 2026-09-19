// lib/whatsapp.ts
// WhatsApp → CRM. Lógica pura: nada de acá toca la base ni la red, para que
// los formatos de Meta —que son lo frágil— queden cubiertos por tests.
//
// El número de empresa está en modo COEXISTENCIA (app del celular + Cloud API).
// Llegan tres webhooks que interesan:
//   · messages            → lo que nos escriben
//   · smb_message_echoes  → lo que mandamos DESDE EL CELULAR
//   · history             → los 180 días previos al alta, una sola vez
// Hilván solo LEE: nunca envía por la API.

import { createHmac, timingSafeEqual } from 'node:crypto'

export type DireccionWA = 'recibido' | 'enviado'

export interface MensajeWA {
  wa_id: string
  /** La contraparte (nunca nuestro número), solo dígitos con código de país. */
  telefono: string
  direccion: DireccionWA
  tipo: string
  texto: string | null
  /** ISO 8601 */
  enviado_at: string
  origen: 'webhook' | 'historial'
}

export interface LecturaWebhook {
  mensajes: MensajeWA[]
  /** teléfono normalizado → nombre de perfil de WhatsApp (solo viene en `messages`). */
  nombres: Record<string, string>
  /** El negocio no autorizó compartir el historial, u otro error de Meta. */
  errores: string[]
}

// Tipos que no son conversación: reacciones, avisos del sistema, etc.
const TIPOS_IGNORADOS = new Set(['reaction', 'system', 'unsupported', 'ephemeral', 'request_welcome'])

/**
 * Deja un teléfono en dígitos con código de país, que es como Meta los manda.
 *
 * En el CRM están escritos a mano ("+56 9 1234 5678", "912345678", "(569)…"),
 * así que sin esto nada calza. La única inferencia que se hace es la chilena
 * obvia: 9 dígitos que parten con 9 es un celular sin el 56. Cualquier otra
 * cosa que no alcance un largo internacional razonable devuelve null — mejor
 * no calzar que calzar con el prospecto equivocado.
 */
export function normalizarTelefono(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 9 && d.startsWith('9')) d = '56' + d
  if (d.length < 10 || d.length > 15) return null
  return d
}

function aISO(timestamp: unknown): string | null {
  const n = Number(timestamp)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n * 1000).toISOString()
}

function textoDe(m: any): string | null {
  const t =
    m?.text?.body ??
    m?.image?.caption ??
    m?.video?.caption ??
    m?.document?.caption ??
    m?.button?.text ??
    m?.interactive?.button_reply?.title ??
    m?.interactive?.list_reply?.title ??
    null
  const limpio = typeof t === 'string' ? t.trim() : ''
  return limpio || null
}

function armar(
  m: any,
  telefonoRaw: unknown,
  direccion: DireccionWA,
  origen: MensajeWA['origen'],
): MensajeWA | null {
  const telefono = normalizarTelefono(typeof telefonoRaw === 'string' ? telefonoRaw : null)
  const enviado_at = aISO(m?.timestamp)
  const wa_id = typeof m?.id === 'string' ? m.id : null
  const tipo = typeof m?.type === 'string' ? m.type : 'text'
  if (!telefono || !enviado_at || !wa_id) return null
  if (TIPOS_IGNORADOS.has(tipo)) return null
  // Los grupos no se sincronizan en coexistencia, pero por si acaso: un id de
  // grupo no es un teléfono y no debe calzar con nadie.
  if (m?.group_id) return null
  return { wa_id, telefono, direccion, tipo, texto: textoDe(m), enviado_at, origen }
}

/** Lee un payload de webhook de Meta y devuelve los mensajes, ya normalizados. */
export function leerWebhook(payload: any): LecturaWebhook {
  const out: LecturaWebhook = { mensajes: [], nombres: {}, errores: [] }
  const entries = Array.isArray(payload?.entry) ? payload.entry : []

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    for (const change of changes) {
      const v = change?.value ?? {}
      const campo = change?.field

      if (campo === 'messages') {
        for (const c of Array.isArray(v.contacts) ? v.contacts : []) {
          const tel = normalizarTelefono(c?.wa_id)
          const nombre = typeof c?.profile?.name === 'string' ? c.profile.name.trim() : ''
          if (tel && nombre) out.nombres[tel] = nombre
        }
        for (const m of Array.isArray(v.messages) ? v.messages : []) {
          const msg = armar(m, m?.from, 'recibido', 'webhook')
          if (msg) out.mensajes.push(msg)
        }
      } else if (campo === 'smb_message_echoes') {
        for (const m of Array.isArray(v.message_echoes) ? v.message_echoes : []) {
          const msg = armar(m, m?.to, 'enviado', 'webhook')
          if (msg) out.mensajes.push(msg)
        }
      } else if (campo === 'history') {
        for (const h of Array.isArray(v.history) ? v.history : []) {
          for (const e of Array.isArray(h?.errors) ? h.errors : []) {
            out.errores.push(`history ${e?.code ?? '?'}: ${e?.title ?? e?.message ?? 'error'}`)
          }
          for (const hilo of Array.isArray(h?.threads) ? h.threads : []) {
            // El id del hilo ES el teléfono de la contraparte; `from` dice quién habló.
            const contraparte = normalizarTelefono(hilo?.id)
            if (!contraparte) continue
            for (const m of Array.isArray(hilo?.messages) ? hilo.messages : []) {
              const direccion: DireccionWA =
                normalizarTelefono(m?.from) === contraparte ? 'recibido' : 'enviado'
              const msg = armar(m, hilo.id, direccion, 'historial')
              if (msg) out.mensajes.push(msg)
            }
          }
        }
      }
    }
  }
  return out
}

/** Valida `X-Hub-Signature-256` de Meta contra el cuerpo CRUDO del request. */
export function firmaValida(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith('sha256=') || !appSecret) return false
  const esperado = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const recibido = header.slice('sha256='.length)
  const a = Buffer.from(esperado, 'hex')
  const b = Buffer.from(recibido, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

const FMT_DIA_CHILE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
})
const FMT_HORA_CHILE = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false,
})

/** YYYY-MM-DD en hora de Chile: una conversación de las 23:50 es de ESE día. */
export function diaChile(iso: string): string {
  return FMT_DIA_CHILE.format(new Date(iso))
}

export function horaChile(iso: string): string {
  return FMT_HORA_CHILE.format(new Date(iso))
}

export interface FilaMensaje {
  id: string
  prospecto_id: string
  direccion: DireccionWA
  tipo: string
  texto: string | null
  enviado_at: string
}

export interface ConversacionDia {
  prospecto_id: string
  fecha: string
  enviados: number
  recibidos: number
  /** Quién habló último ese día: decide si nos deben respuesta o la debemos. */
  ultimo: DireccionWA
  /** Audios, fotos o documentos sin texto: el resumen no los puede cubrir. */
  sin_texto: number
  mensajes: { id: string; hora: string; direccion: DireccionWA; tipo: string; texto: string | null }[]
}

/**
 * Agrupa por prospecto y día. La unidad que se registra en el CRM es "la
 * conversación del martes con Paola", no cada globo de chat: treinta filas por
 * charla harían ilegible la ficha y dispararían la cuenta de toques.
 */
export function agruparPorDia(filas: FilaMensaje[]): ConversacionDia[] {
  const grupos = new Map<string, ConversacionDia>()
  const orden = [...filas].sort((a, b) => a.enviado_at.localeCompare(b.enviado_at))
  for (const f of orden) {
    const fecha = diaChile(f.enviado_at)
    const clave = `${f.prospecto_id}|${fecha}`
    let g = grupos.get(clave)
    if (!g) {
      g = { prospecto_id: f.prospecto_id, fecha, enviados: 0, recibidos: 0, ultimo: f.direccion, sin_texto: 0, mensajes: [] }
      grupos.set(clave, g)
    }
    if (f.direccion === 'enviado') g.enviados++
    else g.recibidos++
    if (!f.texto) g.sin_texto++
    g.ultimo = f.direccion
    g.mensajes.push({ id: f.id, hora: horaChile(f.enviado_at), direccion: f.direccion, tipo: f.tipo, texto: f.texto })
  }
  return [...grupos.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
}
