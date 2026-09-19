// lib/whatsapp-io.ts
// WhatsApp → CRM, la parte que toca la base. La lectura de los formatos de Meta
// vive en lib/whatsapp.ts (pura y con tests).

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizarTelefono, type LecturaWebhook, type MensajeWA } from '@/lib/whatsapp'

export const DIAS_CUARENTENA = 30
export const DIAS_TEXTO_PROCESADO = 90

interface Dueno { prospecto_id: string; contacto_id: string | null }

/**
 * Teléfono → de quién es. Los contactos mandan sobre el teléfono general del
 * prospecto: si el número es de una persona con nombre, la interacción queda
 * atribuida a ella.
 */
export async function mapaTelefonos(admin: SupabaseClient): Promise<{
  duenos: Map<string, Dueno>
  internos: Set<string>
  error?: string
}> {
  const duenos = new Map<string, Dueno>()
  const internos = new Set<string>()

  const [pros, contactos, colaboradores] = await Promise.all([
    admin.from('prospectos').select('id, telefono').not('telefono', 'is', null),
    admin.from('crm_contactos').select('id, prospecto_id, telefono').not('telefono', 'is', null),
    admin.from('colaboradores').select('telefono').not('telefono', 'is', null),
  ])
  if (pros.error) return { duenos, internos, error: pros.error.message }
  if (contactos.error) return { duenos, internos, error: contactos.error.message }
  // El equipo y los colaboradores le escriben a este número todo el día: no son
  // venta ni "desconocidos", y no deben llenar la cuarentena. Si esta consulta
  // falla no se aborta — a lo más caen en cuarentena y alguien los ignora.
  for (const c of colaboradores.data ?? []) {
    const t = normalizarTelefono((c as { telefono: string | null }).telefono)
    if (t) internos.add(t)
  }

  for (const p of pros.data ?? []) {
    const t = normalizarTelefono((p as { telefono: string | null }).telefono)
    if (t) duenos.set(t, { prospecto_id: (p as { id: string }).id, contacto_id: null })
  }
  for (const c of contactos.data ?? []) {
    const fila = c as { id: string; prospecto_id: string; telefono: string | null }
    const t = normalizarTelefono(fila.telefono)
    if (t) duenos.set(t, { prospecto_id: fila.prospecto_id, contacto_id: fila.id })
  }
  return { duenos, internos }
}

export interface ResultadoIngesta {
  recibidos: number
  guardados: number
  a_cuarentena: number
  internos: number
  errores: string[]
}

/**
 * Guarda lo que calza con el CRM y manda el resto a cuarentena SIN contenido.
 * Idempotente: Meta reintenta los webhooks y el `wa_id` único absorbe el repetido.
 */
export async function ingerir(admin: SupabaseClient, lectura: LecturaWebhook): Promise<ResultadoIngesta> {
  const res: ResultadoIngesta = {
    recibidos: lectura.mensajes.length, guardados: 0, a_cuarentena: 0, internos: 0,
    errores: [...lectura.errores],
  }
  if (lectura.mensajes.length === 0) return res

  const { duenos, internos, error } = await mapaTelefonos(admin)
  if (error) { res.errores.push(`mapa de teléfonos: ${error}`); return res }

  const filas: Record<string, unknown>[] = []
  const desconocidos = new Map<string, MensajeWA[]>()
  for (const m of lectura.mensajes) {
    const dueno = duenos.get(m.telefono)
    if (dueno) {
      filas.push({
        wa_id: m.wa_id, telefono: m.telefono, direccion: m.direccion, tipo: m.tipo,
        texto: m.texto, enviado_at: m.enviado_at, origen: m.origen,
        prospecto_id: dueno.prospecto_id, contacto_id: dueno.contacto_id,
      })
    } else if (internos.has(m.telefono)) {
      res.internos++
    } else {
      const lista = desconocidos.get(m.telefono) ?? []
      lista.push(m)
      desconocidos.set(m.telefono, lista)
    }
  }

  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500)
    const { error: e, count } = await admin
      .from('whatsapp_mensajes')
      .upsert(lote, { onConflict: 'wa_id', ignoreDuplicates: true, count: 'exact' })
    if (e) res.errores.push(`guardar mensajes: ${e.message}`)
    else res.guardados += count ?? 0
  }

  if (desconocidos.size > 0) {
    const corte = new Date(Date.now() - DIAS_CUARENTENA * 86_400_000).toISOString()
    const telefonos = [...desconocidos.keys()]
    const { data: previos, error: eP } = await admin
      .from('whatsapp_desconocidos').select('telefono, primer_mensaje, ultimo_mensaje, mensajes, estado, nombre_perfil')
      .in('telefono', telefonos)
    if (eP) { res.errores.push(`leer cuarentena: ${eP.message}`); return res }
    const previoPor = new Map((previos ?? []).map(p => [(p as { telefono: string }).telefono, p as any]))

    const upserts: Record<string, unknown>[] = []
    for (const [tel, msgs] of desconocidos) {
      const previo = previoPor.get(tel)
      if (previo?.estado === 'ignorar') continue
      const fechas = msgs.map(m => m.enviado_at).sort()
      const ultimo = fechas[fechas.length - 1]
      // El historial trae 180 días de números ajenos: solo entra a cuarentena
      // lo que todavía estaría vivo en ella.
      if (ultimo < corte) continue
      upserts.push({
        telefono: tel,
        nombre_perfil: lectura.nombres[tel] ?? previo?.nombre_perfil ?? null,
        primer_mensaje: previo && previo.primer_mensaje < fechas[0] ? previo.primer_mensaje : fechas[0],
        ultimo_mensaje: previo && previo.ultimo_mensaje > ultimo ? previo.ultimo_mensaje : ultimo,
        mensajes: (previo?.mensajes ?? 0) + msgs.length,
        estado: 'pendiente',
      })
    }
    if (upserts.length > 0) {
      const { error: eU } = await admin.from('whatsapp_desconocidos').upsert(upserts, { onConflict: 'telefono' })
      if (eU) res.errores.push(`guardar cuarentena: ${eU.message}`)
      else res.a_cuarentena = upserts.length
    }
  }
  return res
}

/** La purga diaria: cuarentena vencida y texto de conversaciones ya resumidas. */
export async function purgar(admin: SupabaseClient): Promise<{ cuarentena: number; textos: number; error?: string }> {
  const corteCuarentena = new Date(Date.now() - DIAS_CUARENTENA * 86_400_000).toISOString()
  const corteTexto = new Date(Date.now() - DIAS_TEXTO_PROCESADO * 86_400_000).toISOString()

  // 'ignorar' no se purga: es la lista de "no volver a preguntar por este número".
  const c = await admin.from('whatsapp_desconocidos')
    .delete({ count: 'exact' }).eq('estado', 'pendiente').lt('ultimo_mensaje', corteCuarentena)
  if (c.error) return { cuarentena: 0, textos: 0, error: c.error.message }

  // Lo que queda en el CRM es el resumen; el texto crudo solo vive lo necesario
  // para poder deshacer y re-resumir.
  const t = await admin.from('whatsapp_mensajes')
    .update({ texto: null }, { count: 'exact' })
    .not('texto', 'is', null).not('procesado_at', 'is', null).lt('procesado_at', corteTexto)
  if (t.error) return { cuarentena: c.count ?? 0, textos: 0, error: t.error.message }

  return { cuarentena: c.count ?? 0, textos: t.count ?? 0 }
}

// ── Cuarentena: decidir de quién es un número ───────────────────────────────
// Compartido por el agente (/api/agent/whatsapp/desconocidos) y por la pantalla
// del CRM (app/actions/whatsapp.ts): la regla es la misma, la decida quien la decida.

export interface DecisionDesconocido {
  telefono: string
  accion: 'vincular' | 'ignorar'
  prospecto_id?: string | null
  nombre?: string | null
}

export type ResultadoDecision =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      respuesta: Record<string, unknown>
      /** Lo que el deshacer necesita para volver atrás. */
      auditoria: Record<string, unknown>
      prospecto_id: string | null
    }

export async function resolverDesconocido(admin: SupabaseClient, d: DecisionDesconocido): Promise<ResultadoDecision> {
  const telefono = normalizarTelefono(d.telefono)
  if (!telefono) return { ok: false, status: 400, error: 'telefono inválido' }

  const { data: fila } = await admin.from('whatsapp_desconocidos').select('*').eq('telefono', telefono).maybeSingle()
  if (!fila) return { ok: false, status: 404, error: 'Ese número no está en la cuarentena' }

  if (d.accion === 'ignorar') {
    // El nombre se borra: de alguien que no es venta solo hace falta recordar el número.
    const { error } = await admin.from('whatsapp_desconocidos')
      .update({ estado: 'ignorar', nombre_perfil: null }).eq('telefono', telefono)
    if (error) return { ok: false, status: 500, error: error.message }
    return { ok: true, respuesta: { telefono, estado: 'ignorar' }, auditoria: { previo: fila }, prospecto_id: null }
  }

  // vincular — todo se valida antes de la primera escritura.
  if (!d.prospecto_id) return { ok: false, status: 400, error: 'vincular exige prospecto_id' }
  const { data: pro } = await admin.from('prospectos').select('id, empresa, telefono').eq('id', d.prospecto_id).maybeSingle()
  if (!pro) return { ok: false, status: 404, error: 'prospecto_id no encontrado' }
  const prospecto = pro as { id: string; empresa: string; telefono: string | null }

  const yaTieneTelefono = !!normalizarTelefono(prospecto.telefono)
  const nombre = d.nombre?.trim() || (fila as { nombre_perfil: string | null }).nombre_perfil
  let contactoCreado: string | null = null

  if (!yaTieneTelefono) {
    const { error } = await admin.from('prospectos').update({ telefono: `+${telefono}` }).eq('id', prospecto.id)
    if (error) return { ok: false, status: 500, error: error.message }
  } else {
    // El prospecto ya tiene otro teléfono: este es de una persona más de la marca.
    if (!nombre) {
      return {
        ok: false, status: 400,
        error: 'El prospecto ya tiene teléfono y este número no trae nombre de perfil: indica el nombre para crearlo como contacto',
      }
    }
    const { data: c, error } = await admin.from('crm_contactos')
      .insert({ prospecto_id: prospecto.id, nombre, telefono: `+${telefono}`, fuente: 'whatsapp' })
      .select('id').single()
    if (error || !c) return { ok: false, status: 500, error: error?.message ?? 'No se pudo crear el contacto' }
    contactoCreado = (c as { id: string }).id
  }

  const { error: eD } = await admin.from('whatsapp_desconocidos').delete().eq('telefono', telefono)
  if (eD) console.error('[whatsapp] no se pudo sacar de cuarentena:', eD.message)

  return {
    ok: true,
    respuesta: {
      telefono, prospecto_id: prospecto.id, empresa: prospecto.empresa,
      contacto_creado: contactoCreado, puso_telefono_al_prospecto: !yaTieneTelefono,
    },
    auditoria: {
      previo: fila, contacto_creado: contactoCreado,
      puso_telefono: !yaTieneTelefono, telefono_anterior: prospecto.telefono ?? null,
    },
    prospecto_id: prospecto.id,
  }
}
