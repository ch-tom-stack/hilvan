'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendEmail } from '@/lib/email'
import {
  Rodaje,
  RodajeDepartamento,
  RodajeEquipoTecnico,
  RodajeEscena,
  RodajeCitacion,
  Colaborador,
  generarMensajeCitacion,
  resolverHoraLlamado,
  formatHora,
} from '@/types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// ─── RODAJES ─────────────────────────────────────────────────────────────────

export async function getRodajes() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rodajes')
    .select(`*`)
    .order('fecha', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}

export async function getRodaje(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rodajes')
    .select(`
      *,
      proyecto:proyectos(id, nombre),
      cotizacion:cotizaciones(id, version),
      departamentos:rodaje_departamentos(*, miembros:rodaje_equipo_tecnico(*)),
      equipo_tecnico:rodaje_equipo_tecnico(
        *,
        departamento:rodaje_departamentos(id, nombre, hora_llamado),
        citacion:rodaje_citaciones(*)
      ),
      escenas:rodaje_escenas(* )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  // ordenar
  if (data.departamentos) data.departamentos.sort((a: any, b: any) => a.orden - b.orden)
  if (data.escenas) data.escenas.sort((a: any, b: any) => a.orden - b.orden)
  return data
}

export async function crearRodaje(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const payload = {
    nombre: formData.get('nombre') as string,
    fecha: (formData.get('fecha') as string) || null,
    fecha_confirmada: formData.get('fecha_confirmada') === 'true',
    proyecto_id: (formData.get('proyecto_id') as string) || null,
    cotizacion_id: (formData.get('cotizacion_id') as string) || null,
    locacion_nombre: (formData.get('locacion_nombre') as string) || null,
    locacion_direccion: (formData.get('locacion_direccion') as string) || null,
    locacion_lat: formData.get('locacion_lat') ? parseFloat(formData.get('locacion_lat') as string) : null,
    locacion_lng: formData.get('locacion_lng') ? parseFloat(formData.get('locacion_lng') as string) : null,
    hora_llamado_general: (formData.get('hora_llamado_general') as string) || null,
    notas_generales: (formData.get('notas_generales') as string) || null,
    visibilidad_plan: (formData.get('visibilidad_plan') as string) || 'completo',
    chiste_texto: (formData.get('chiste_texto') as string) || null,
    estado: 'borrador' as const,
    created_by: user?.id || null,
  }

  const { data, error } = await supabase.from('rodajes').insert(payload).select().single()
  if (error) throw error
  redirect(`/rodaje/${data.id}`)
}

export async function actualizarRodaje(id: string, formData: FormData) {
  const supabase = await createClient()

  const payload: any = {
    nombre: formData.get('nombre') as string,
    fecha: (formData.get('fecha') as string) || null,
    fecha_confirmada: formData.get('fecha_confirmada') === 'true',
    proyecto_id: (formData.get('proyecto_id') as string) || null,
    cotizacion_id: (formData.get('cotizacion_id') as string) || null,
    locacion_nombre: (formData.get('locacion_nombre') as string) || null,
    locacion_direccion: (formData.get('locacion_direccion') as string) || null,
    locacion_lat: formData.get('locacion_lat') ? parseFloat(formData.get('locacion_lat') as string) : null,
    locacion_lng: formData.get('locacion_lng') ? parseFloat(formData.get('locacion_lng') as string) : null,
    hora_llamado_general: (formData.get('hora_llamado_general') as string) || null,
    notas_generales: (formData.get('notas_generales') as string) || null,
    visibilidad_plan: (formData.get('visibilidad_plan') as string) || 'completo',
    chiste_texto: (formData.get('chiste_texto') as string) || null,
    estado: formData.get('estado') as string,
  }

  const { error } = await supabase.from('rodajes').update(payload).eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${id}`)
}

export async function actualizarEstadoRodaje(id: string, estado: 'borrador' | 'confirmado' | 'completado') {
  const supabase = await createClient()
  const { error } = await supabase.from('rodajes').update({ estado }).eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${id}`)
  revalidatePath('/rodaje')
}

export async function eliminarRodaje(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('rodajes').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/rodaje')
  redirect('/rodaje')
}

// ─── DEPARTAMENTOS ────────────────────────────────────────────────────────────

export async function crearDepartamento(rodajeId: string, formData: FormData) {
  const supabase = await createClient()

  // obtener el último orden
  const { data: existentes } = await supabase
    .from('rodaje_departamentos')
    .select('orden')
    .eq('rodaje_id', rodajeId)
    .order('orden', { ascending: false })
    .limit(1)

  const orden = existentes && existentes.length > 0 ? existentes[0].orden + 1 : 0

  const { error } = await supabase.from('rodaje_departamentos').insert({
    rodaje_id: rodajeId,
    nombre: formData.get('nombre') as string,
    hora_llamado: (formData.get('hora_llamado') as string) || null,
    orden,
  })
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}/equipo`)
}

export async function actualizarDepartamento(id: string, rodajeId: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from('rodaje_departamentos').update({
    nombre: formData.get('nombre') as string,
    hora_llamado: (formData.get('hora_llamado') as string) || null,
  }).eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}/equipo`)
}

export async function eliminarDepartamento(id: string, rodajeId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('rodaje_departamentos').delete().eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}/equipo`)
}

// ─── EQUIPO TÉCNICO ───────────────────────────────────────────────────────────

export async function getColaboradores(query?: string) {
  const supabase = await createClient()
  let q = supabase.from('colaboradores').select('*').order('nombre')
  if (query) q = q.ilike('nombre', `%${query}%`)
  const { data, error } = await q.limit(10)
  if (error) throw error
  return data as Colaborador[]
}

export async function crearColaborador(formData: FormData) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('colaboradores').insert({
    nombre: formData.get('nombre') as string,
    email: (formData.get('email') as string) || null,
    telefono: (formData.get('telefono') as string) || null,
    rol_habitual: (formData.get('rol_habitual') as string) || null,
    notas: (formData.get('notas') as string) || null,
  }).select().single()
  if (error) throw error
  return data as Colaborador
}

export async function actualizarColaborador(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from('colaboradores').update({
    nombre: formData.get('nombre') as string,
    email: (formData.get('email') as string) || null,
    telefono: (formData.get('telefono') as string) || null,
    rol_habitual: (formData.get('rol_habitual') as string) || null,
    notas: (formData.get('notas') as string) || null,
  }).eq('id', id)
  if (error) throw error
  revalidatePath('/rodaje')
}

export async function agregarPersonaEquipo(rodajeId: string, formData: FormData) {
  const supabase = await createClient()

  const colaboradorId = (formData.get('colaborador_id') as string) || null
  const guardarEnDirectorio = formData.get('guardar_en_directorio') === 'true'

  // si hay que guardar en directorio
  let colaboradorIdFinal = colaboradorId
  if (!colaboradorId && guardarEnDirectorio) {
    const { data: nuevoColab } = await supabase.from('colaboradores').insert({
      nombre: formData.get('nombre') as string,
      email: (formData.get('email') as string) || null,
      telefono: (formData.get('telefono') as string) || null,
      rol_habitual: (formData.get('rol') as string) || null,
    }).select().single()
    if (nuevoColab) colaboradorIdFinal = nuevoColab.id
  }

  const { error } = await supabase.from('rodaje_equipo_tecnico').insert({
    rodaje_id: rodajeId,
    departamento_id: (formData.get('departamento_id') as string) || null,
    colaborador_id: colaboradorIdFinal,
    nombre: formData.get('nombre') as string,
    rol: (formData.get('rol') as string) || null,
    email: (formData.get('email') as string) || null,
    telefono: (formData.get('telefono') as string) || null,
    es_jefe_departamento: formData.get('es_jefe_departamento') === 'true',
    hora_llamado_individual: (formData.get('hora_llamado_individual') as string) || null,
  })
  if (error) throw error

  revalidatePath(`/rodaje/${rodajeId}/equipo`)
  revalidatePath(`/rodaje/${rodajeId}/citaciones`)
}

export async function actualizarPersonaEquipo(id: string, rodajeId: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from('rodaje_equipo_tecnico').update({
    departamento_id: (formData.get('departamento_id') as string) || null,
    nombre: formData.get('nombre') as string,
    rol: (formData.get('rol') as string) || null,
    email: (formData.get('email') as string) || null,
    telefono: (formData.get('telefono') as string) || null,
    es_jefe_departamento: formData.get('es_jefe_departamento') === 'true',
    hora_llamado_individual: (formData.get('hora_llamado_individual') as string) || null,
  }).eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}/equipo`)
}

export async function eliminarPersonaEquipo(id: string, rodajeId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('rodaje_equipo_tecnico').delete().eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}/equipo`)
  revalidatePath(`/rodaje/${rodajeId}/citaciones`)
}

// ─── ESCENAS ──────────────────────────────────────────────────────────────────

export async function crearEscena(rodajeId: string, formData: FormData) {
  const supabase = await createClient()

  const { data: existentes } = await supabase
    .from('rodaje_escenas')
    .select('orden')
    .eq('rodaje_id', rodajeId)
    .order('orden', { ascending: false })
    .limit(1)

  const orden = existentes && existentes.length > 0 ? existentes[0].orden + 1 : 0

  const { error } = await supabase.from('rodaje_escenas').insert({
    rodaje_id: rodajeId,
    orden,
    titulo: formData.get('titulo') as string,
    descripcion: (formData.get('descripcion') as string) || null,
    hora_estimada: (formData.get('hora_estimada') as string) || null,
    duracion_min: formData.get('duracion_min') ? parseInt(formData.get('duracion_min') as string) : null,
    locacion_especifica: (formData.get('locacion_especifica') as string) || null,
    notas: (formData.get('notas') as string) || null,
    visible_en_citacion: formData.get('visible_en_citacion') !== 'false',
  })
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}/plan`)
}

export async function actualizarEscena(id: string, rodajeId: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from('rodaje_escenas').update({
    titulo: formData.get('titulo') as string,
    descripcion: (formData.get('descripcion') as string) || null,
    hora_estimada: (formData.get('hora_estimada') as string) || null,
    duracion_min: formData.get('duracion_min') ? parseInt(formData.get('duracion_min') as string) : null,
    locacion_especifica: (formData.get('locacion_especifica') as string) || null,
    notas: (formData.get('notas') as string) || null,
    visible_en_citacion: formData.get('visible_en_citacion') !== 'false',
  }).eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}/plan`)
}

export async function reordenarEscenas(rodajeId: string, ordenIds: string[]) {
  const supabase = await createClient()
  const resultados = await Promise.allSettled(
    ordenIds.map((id, index) =>
      supabase
        .from('rodaje_escenas')
        .update({ orden: index })
        .eq('id', id)
        .then(({ error }) => {
          if (error) throw new Error(error.message)
        })
    )
  )
  revalidatePath(`/rodaje/${rodajeId}/plan`)
  const fallidos = resultados.filter((r) => r.status === 'rejected')
  if (fallidos.length > 0) {
    throw new Error(`No se pudo reordenar ${fallidos.length} de ${ordenIds.length} escenas. Recarga e intenta de nuevo.`)
  }
}

export async function eliminarEscena(id: string, rodajeId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('rodaje_escenas').delete().eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}/plan`)
}

// ─── CITACIONES ───────────────────────────────────────────────────────────────

export async function generarCitaciones(rodajeId: string) {
  const supabase = await createClient()

  // obtener todo el equipo sin citación
  const { data: equipo } = await supabase
    .from('rodaje_equipo_tecnico')
    .select('id')
    .eq('rodaje_id', rodajeId)

  if (!equipo || equipo.length === 0) return

  // verificar cuáles ya tienen citación
  const { data: existentes } = await supabase
    .from('rodaje_citaciones')
    .select('persona_id')
    .eq('rodaje_id', rodajeId)

  const existentesIds = new Set((existentes || []).map((c: any) => c.persona_id))
  const sinCitacion = equipo.filter((p: any) => !existentesIds.has(p.id))

  if (sinCitacion.length === 0) return

  await supabase.from('rodaje_citaciones').insert(
    sinCitacion.map((p: any) => ({
      rodaje_id: rodajeId,
      persona_id: p.id,
    }))
  )

  revalidatePath(`/rodaje/${rodajeId}/citaciones`)
}

export async function actualizarMensajeCitacion(id: string, rodajeId: string, mensaje: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rodaje_citaciones')
    .update({ mensaje_personalizado: mensaje })
    .eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}/citaciones`)
}

export async function marcarWhatsappEnviado(id: string, rodajeId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rodaje_citaciones')
    .update({
      whatsapp_enviado: true,
      whatsapp_enviado_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
  revalidatePath(`/rodaje/${rodajeId}/citaciones`)
}

export async function enviarEmailCitacion(id: string, rodajeId: string) {
  const supabase = await createClient()

  const { data: citacion } = await supabase
    .from('rodaje_citaciones')
    .select(`
      *,
      persona:rodaje_equipo_tecnico(
        *,
        departamento:rodaje_departamentos(*)
      ),
      rodaje:rodajes(*)
    `)
    .eq('id', id)
    .single()

  if (!citacion || !citacion.persona?.email) throw new Error('Sin email')

  const rodaje = citacion.rodaje as Rodaje
  const persona = citacion.persona as RodajeEquipoTecnico
  const linkCitacion = `${APP_URL}/citacion/${citacion.token}`

  const hora = formatHora(resolverHoraLlamado(persona, rodaje))
  const fecha = rodaje.fecha
    ? new Date(rodaje.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
    : 'Fecha por confirmar'

  const uberLink = rodaje.locacion_lat && rodaje.locacion_lng
    ? `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${rodaje.locacion_lat}&dropoff[longitude]=${rodaje.locacion_lng}&dropoff[nickname]=${encodeURIComponent(rodaje.locacion_nombre || 'Locación')}`
    : null

  await sendEmail({
    to: persona.email!,
    subject: `Citación — ${rodaje.nombre}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #111;">
        <h2 style="margin-bottom: 4px;">Hola ${persona.nombre} 👋</h2>
        <p style="color: #555;">Te citamos para el siguiente rodaje.</p>

        <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 8px;"><strong>Producción:</strong> ${rodaje.nombre}</p>
          <p style="margin: 0 0 8px;"><strong>Fecha:</strong> ${fecha}</p>
          <p style="margin: 0 0 8px;"><strong>Hora de llegada:</strong> ${hora}</p>
          <p style="margin: 0;"><strong>Locación:</strong> ${rodaje.locacion_nombre || 'Por confirmar'}${rodaje.locacion_direccion ? `<br><span style="color:#555">${rodaje.locacion_direccion}</span>` : ''}</p>
        </div>

        ${uberLink ? `<p><a href="${uberLink}" style="background:#000;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Abrir en Uber →</a></p>` : ''}

        <p>Por favor confirma tu asistencia e ingresa tus restricciones alimentarias si las tienes:</p>
        <p><a href="${linkCitacion}" style="background:#C11700;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">Confirmar asistencia →</a></p>

        <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
        <p style="color:#999;font-size:12px;">Casa Hiedra — casahiedra.com</p>
      </div>
    `,
  })

  await supabase
    .from('rodaje_citaciones')
    .update({ email_enviado_at: new Date().toISOString() })
    .eq('id', id)

  revalidatePath(`/rodaje/${rodajeId}/citaciones`)
}

// ─── PORTAL PÚBLICO ───────────────────────────────────────────────────────────

export async function getCitacionPublica(token: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('rodaje_citaciones')
    .select(`
      *,
      persona:rodaje_equipo_tecnico(*, departamento:rodaje_departamentos(*)),
      rodaje:rodajes(*, escenas:rodaje_escenas(*))
    `)
    .eq('token', token)
    .single()
  if (error) throw error

  const persona = data?.persona as any
  if (persona?.es_jefe_departamento && persona?.departamento_id) {
    const { data: miembros } = await admin
      .from('rodaje_equipo_tecnico')
      .select('id, nombre, rol, hora_llamado_individual')
      .eq('rodaje_id', persona.rodaje_id)
      .eq('departamento_id', persona.departamento_id)
    persona.miembros_departamento = miembros ?? []
  }

  return data
}

export async function responderCitacion(token: string, formData: FormData) {
  const admin = createAdminClient()
  const confirmada = formData.get('confirmada') === 'true'
  const restricciones = (formData.get('restricciones_alimentarias') as string) || null

  const { error } = await admin
    .from('rodaje_citaciones')
    .update({
      confirmada,
      restricciones_alimentarias: restricciones,
      respondida_at: new Date().toISOString(),
    })
    .eq('token', token)
  if (error) throw error
  revalidatePath(`/citacion/${token}`)
}

// ─── CRON: RECORDATORIOS ──────────────────────────────────────────────────────

export async function enviarRecordatorios() {
  const supabase = await createClient()

  // rodajes confirmados para mañana
  const mañana = new Date()
  mañana.setDate(mañana.getDate() + 1)
  const fechaMañana = mañana.toISOString().split('T')[0]

  const { data: rodajes } = await supabase
    .from('rodajes')
    .select('id, nombre')
    .eq('fecha', fechaMañana)
    .eq('estado', 'confirmado')

  if (!rodajes || rodajes.length === 0) return { enviados: 0 }

  let enviados = 0

  for (const rodaje of rodajes) {
    // citaciones sin respuesta y sin recordatorio enviado
    const { data: citaciones } = await supabase
      .from('rodaje_citaciones')
      .select(`
        *,
        persona:rodaje_equipo_tecnico(*,departamento:rodaje_departamentos(*)),
        rodaje:rodajes(*)
      `)
      .eq('rodaje_id', rodaje.id)
      .is('respondida_at', null)
      .is('recordatorio_enviado_at', null)

    if (!citaciones) continue

    for (const citacion of citaciones) {
      const persona = citacion.persona as RodajeEquipoTecnico
      const rodajeData = citacion.rodaje as Rodaje

      if (!persona?.email) continue

      const linkCitacion = `${APP_URL}/citacion/${citacion.token}`
      const hora = formatHora(resolverHoraLlamado(persona, rodajeData))
      try {
        await sendEmail({
          to: persona.email,
          subject: `Recordatorio — ${rodaje.nombre} es mañana`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111;">
              <h2>Recordatorio 🎬</h2>
              <p>Hola ${persona.nombre}, el rodaje <strong>${rodaje.nombre}</strong> es mañana.</p>
              <p><strong>Hora de llegada: ${hora}</strong></p>
              <p>Aún no has confirmado tu asistencia. Por favor hazlo aquí:</p>
              <p><a href="${linkCitacion}" style="background:#C11700;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Confirmar asistencia →</a></p>
              <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
              <p style="color:#999;font-size:12px;">Casa Hiedra — casahiedra.com</p>
            </div>
          `,
        })

        await supabase
          .from('rodaje_citaciones')
          .update({ recordatorio_enviado_at: new Date().toISOString() })
          .eq('id', citacion.id)

        enviados++
      } catch (e) {
        console.error('Error enviando recordatorio:', e)
      }
    }
  }

  return { enviados }
}
