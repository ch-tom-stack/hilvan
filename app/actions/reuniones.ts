'use server'

import { revalidatePath } from 'next/cache'
import { requireRol } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { freeBusyGCal, crearReunionConMeet, eliminarReunionGCal } from '@/lib/google-calendar'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES_REUNIONES = ['admin', 'productor']

export interface DatosReunionManual {
  nombre: string
  email: string
  motivo?: string
  inicio: string // ISO
  duracionMin: number
}

// Crea una reunión directamente desde Hilván (sin pasar por la grilla pública de
// /reunion, que existe para dar sensación de escasez a un visitante externo). Solo
// re-valida que el horario esté libre en el calendario real — el staff puede elegir
// cualquier fecha/hora dentro de lo permitido por Google Calendar.
export async function crearReunionManual(datos: DatosReunionManual): Promise<{ error?: string }> {
  await requireRol(ROLES_REUNIONES)

  const nombre = datos.nombre?.trim()
  const email = datos.email?.trim()
  const motivo = datos.motivo?.trim() || null
  const inicioISO = datos.inicio?.trim()
  const duracionMin = Number.isFinite(datos.duracionMin) && datos.duracionMin > 0 ? Math.round(datos.duracionMin) : 30

  if (!nombre) return { error: 'Falta el nombre' }
  if (!email || !EMAIL_RE.test(email)) return { error: 'Email inválido' }
  if (!inicioISO) return { error: 'Falta la fecha/hora' }
  const inicio = new Date(inicioISO)
  if (Number.isNaN(inicio.getTime())) return { error: 'Fecha/hora inválida' }
  if (inicio.getTime() < Date.now() - 5 * 60000) return { error: 'La fecha/hora ya pasó' }
  const fin = new Date(inicio.getTime() + duracionMin * 60000)

  // Re-validar contra el calendario real (evita doble agendamiento).
  let ocupados: { start: string; end: string }[] = []
  try {
    ocupados = await freeBusyGCal(new Date(inicio.getTime() - 3600000), new Date(fin.getTime() + 3600000))
  } catch {
    return { error: 'No pudimos verificar el calendario. Intenta de nuevo.' }
  }
  const choca = ocupados.some((b) => inicio.getTime() < new Date(b.end).getTime() && fin.getTime() > new Date(b.start).getTime())
  if (choca) return { error: 'Ese horario ya está ocupado en el calendario.' }

  let gcalId: string | null = null
  let meetLink: string | null = null
  try {
    const descripcion = ['Reunión creada desde Hilván.', `Nombre: ${nombre}`, `Email: ${email}`, motivo ? `Motivo: ${motivo}` : null]
      .filter(Boolean).join('\n')
    const ev = await crearReunionConMeet(`Reunión · ${nombre}`, inicio, fin, descripcion)
    gcalId = ev.id
    meetLink = ev.meetLink
  } catch {
    return { error: 'No pudimos crear el evento en Google Calendar.' }
  }

  const admin = createAdminClient()
  const token = crypto.randomUUID()
  const { error } = await admin.from('reuniones_web').insert({
    nombre, email, motivo,
    inicio: inicio.toISOString(), fin: fin.toISOString(),
    modalidad: 'videollamada', estado: 'agendada',
    // Creada por el staff: ya está "atendida" (no hay lead externo pendiente de contacto).
    confirmada: true, confirmada_at: new Date().toISOString(),
    gcal_event_id: gcalId, meet_link: meetLink, token,
  })
  if (error) return { error: `Se creó en el calendario pero no se pudo guardar en Hilván: ${error.message}` }

  revalidatePath('/reuniones')
  return {}
}

// Cambia el estado de una reunión (realizada / cancelada). Si se cancela, intenta
// borrar el evento del calendario (best-effort: si falla, igual queda cancelada acá).
export async function actualizarEstadoReunion(id: string, estado: 'realizada' | 'cancelada'): Promise<{ error?: string }> {
  await requireRol(ROLES_REUNIONES)
  if (!id) return { error: 'Falta el id' }

  const admin = createAdminClient()
  const { data: r, error: eSel } = await admin
    .from('reuniones_web')
    .select('id, gcal_event_id, estado')
    .eq('id', id)
    .maybeSingle()
  if (eSel || !r) return { error: 'No se encontró la reunión' }

  if (estado === 'cancelada' && r.gcal_event_id) {
    try { await eliminarReunionGCal(r.gcal_event_id) } catch (e) { console.error('[reuniones] no se pudo borrar el evento GCal', e) }
  }

  const { error } = await admin.from('reuniones_web').update({ estado }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/reuniones')
  return {}
}
