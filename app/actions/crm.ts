'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { revalidatePath } from 'next/cache'
import type {
  Prospecto,
  CrmInteraccion,
  CrmContacto,
  CrmBorrador,
  CrmLectura,
  CrmInsight,
  CrmAprobacion,
  EtapaProspecto,
  Profile,
} from '@/types'
import { ETAPA_PROSPECTO_LABELS, CHECKLIST_PROSPECTO, TIPOS_INTERACCION } from '@/types'
import { aplicarEfectoAprobacion, AplicarError, CAMPOS_CORREGIBLES, type AprobacionRow } from '@/lib/crm-aprobaciones'
import { agregarBiblioteca, type BibliotecaContactos } from '@/lib/crm-biblioteca'
import { personaSegunReglas, OPERADOR_EMAIL } from '@/lib/crm-asignacion'
import { calcularCadencia, snoozeMaximo, prioridadCadencia, sumarDias, fueraDeAgenda, type Cadencia } from '@/lib/crm-cadencia'
import { HERRAMIENTA_DIGEST } from '@/lib/agent-crm'
import { evaluarCotejo, HERRAMIENTAS_COTEJO, type EstadoCotejo } from '@/lib/crm-reconciliacion'

// ── Acceso ───────────────────────────────────────────────────────────────────
// El CRM es admin + productor (oculto para contabilidad). Toda mutación verifica
// sesión y rol antes de escribir, siguiendo el patrón de app/actions/usuarios.ts.

const ROLES_CRM = ['admin', 'productor']

async function verificarAccesoCrm(): Promise<
  { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; user: { id: string } } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { data: self } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<Pick<Profile, 'rol'>>()

  if (!self || !ROLES_CRM.includes(self.rol)) return { ok: false, error: 'Sin permisos' }
  return { ok: true, supabase, user: { id: user.id } }
}

// Limpia un string opcional: '' / undefined → null
function limpiar(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null
  const t = v.trim()
  return t === '' ? null : t
}

// ── Lecturas (la sesión ya está garantizada por el layout de (dashboard)) ─────

const PROSPECTO_SELECT =
  '*, responsable:profiles!prospectos_responsable_id_fkey(id, nombre), cliente:clientes(id, nombre)'

// El pipeline agrega el contador de contactos y sus fechas: el contador pinta
// el mapa de calor y la fecha más reciente da los días sin tocar (C4).
// `toques` trae fecha + respondido de cada interacción: con eso el motor de
// cadencia (lib/crm-cadencia.ts) resuelve cuándo toca el próximo contacto.
const PIPELINE_SELECT = `${PROSPECTO_SELECT}, crm_interacciones(count), toques:crm_interacciones(fecha, respondido)`

export async function getPipeline(): Promise<Prospecto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('prospectos')
    .select(PIPELINE_SELECT)
    .order('updated_at', { ascending: false })

  if (error) return []
  const hoy = hoyChileISO()
  return (data ?? []).map((r: any) => {
    const toques: { fecha: string | null; respondido?: boolean | null }[] = Array.isArray(r.toques) ? r.toques : []
    const fechas: string[] = toques.map(t => t?.fecha).filter(Boolean) as string[]
    // Fecha plana YYYY-MM-DD: comparar como string es correcto y evita UTC.
    const ultima = fechas.length ? fechas.sort().at(-1) ?? null : null
    return {
      ...r,
      n_interacciones: Array.isArray(r.crm_interacciones) ? (r.crm_interacciones[0]?.count ?? 0) : 0,
      ultima_interaccion: ultima,
      cadencia: calcularCadencia(toques, hoy, r.snooze_hasta),
    }
  }) as unknown as Prospecto[]
}

export async function getProspecto(id: string): Promise<{
  prospecto: Prospecto | null
  interacciones: CrmInteraccion[]
  contactos: CrmContacto[]
  borradores: CrmBorrador[]
  lecturas: CrmLectura[]
  insights: CrmInsight[]
}> {
  const supabase = await createClient()

  const { data: prospecto } = await supabase
    .from('prospectos')
    .select(PROSPECTO_SELECT)
    .eq('id', id)
    .maybeSingle()

  const { data: interacciones } = await supabase
    .from('crm_interacciones')
    .select('*')
    .eq('prospecto_id', id)
    .order('fecha', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  const { data: contactos } = await supabase
    .from('crm_contactos')
    .select('*')
    .eq('prospecto_id', id)
    .order('es_decisor', { ascending: false })
    .order('created_at', { ascending: true })

  const { data: borradores } = await supabase
    .from('crm_borradores')
    .select('*')
    .eq('prospecto_id', id)
    .order('updated_at', { ascending: false })

  const { data: lecturas } = await supabase
    .from('crm_lecturas')
    .select('*')
    .eq('prospecto_id', id)
    .order('fecha', { ascending: false, nullsFirst: false })

  // El porqué del abordaje: lo que el operador averiguó investigando.
  const { data: insights } = await supabase
    .from('crm_insights')
    .select('*')
    .eq('prospecto_id', id)
    .order('created_at', { ascending: false })

  return {
    prospecto: (prospecto as unknown as Prospecto) ?? null,
    interacciones: (interacciones ?? []) as CrmInteraccion[],
    contactos: (contactos ?? []) as CrmContacto[],
    borradores: (borradores ?? []) as CrmBorrador[],
    lecturas: (lecturas ?? []) as CrmLectura[],
    insights: (insights ?? []) as CrmInsight[],
  }
}

export async function getResponsablesCrm(): Promise<Pick<Profile, 'id' | 'nombre'>[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombre, rol')
    .in('rol', ROLES_CRM)
    .order('nombre')
  if (error) return []
  return (data ?? []).map(p => ({ id: p.id, nombre: p.nombre }))
}

// Operadores ACTIVOS del CRM (equipo de captación). No todos los productores
// captan: Diego/Ignacio/FOCH son productores por otras razones. Curado por email
// real (ver /usuarios), confirmado por Tomás — NO inferido. Es el pool que ve el
// reparto y la ficha, y el objetivo de las reglas de asignación.
const OPERADORES_CRM_EMAILS = new Set([
  'tomasmontealegrem@gmail.com',    // Tomás
  'nataliaalejandra.r@gmail.com',   // Natalia
  'simonpedrofernandezsilva@gmail.com', // Simón
  'josuedelafuenteruiz@gmail.com',  // Josué (rental)
])

export async function getOperadoresCrm(): Promise<Pick<Profile, 'id' | 'nombre'>[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombre, email, rol')
    .in('rol', ROLES_CRM)
    .order('nombre')
  if (error) return []
  return (data ?? [])
    .filter(p => p.email && OPERADORES_CRM_EMAILS.has(p.email.trim().toLowerCase()))
    .map(p => ({ id: p.id, nombre: p.nombre }))
}

// Mapa email→profile_id de los operadores, para resolver las reglas a un id real.
async function mapaOperadorId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const { data } = await supabase.from('profiles').select('id, email').in('rol', ROLES_CRM)
  const m = new Map<string, string>()
  for (const p of (data ?? []) as { id: string; email: string | null }[]) {
    if (p.email) m.set(p.email.trim().toLowerCase(), p.id)
  }
  return m
}

export interface ResultadoReparto {
  asignados: number
  porClasificar: number
  detalle: { persona: string; n: number }[]
}

// Reparte los prospectos SIN responsable según las reglas deterministas. Los que
// aún no tienen segmento quedan "por clasificar" (no se asignan a ciegas).
export async function repartirPorReglas(): Promise<{ ok?: true; resultado?: ResultadoReparto; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  const emailId = await mapaOperadorId(acceso.supabase)
  const { data: huerfanos } = await acceso.supabase
    .from('prospectos')
    .select('id, producto_objetivo, tamano, segmento')
    .is('responsable_id', null)

  let asignados = 0
  let porClasificar = 0
  const conteo = new Map<string, number>()
  for (const h of (huerfanos ?? []) as { id: string; producto_objetivo: string | null; tamano: string | null; segmento: string | null }[]) {
    const persona = personaSegunReglas({ producto: h.producto_objetivo, tamano: h.tamano, segmento: h.segmento })
    if (!persona) { porClasificar++; continue }
    const rid = emailId.get(OPERADOR_EMAIL[persona])
    if (!rid) { porClasificar++; continue }
    const { error } = await acceso.supabase.from('prospectos').update({ responsable_id: rid }).eq('id', h.id)
    if (error) continue
    asignados++
    conteo.set(persona, (conteo.get(persona) ?? 0) + 1)
  }
  revalidatePath('/crm')
  return { ok: true, resultado: { asignados, porClasificar, detalle: [...conteo].map(([persona, n]) => ({ persona, n })) } }
}

// Fija tamaño/segmento (clasificación). Si el prospecto no tiene responsable, lo
// asigna EN EL ACTO según las reglas — ese es el "automático".
export async function clasificarProspecto(
  id: string,
  input: { tamano?: string | null; segmento?: string | null },
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  const tamano = input.tamano && ['chica', 'mediana', 'grande'].includes(input.tamano) ? input.tamano : null
  const segmento = input.segmento && ['general', 'estudiante', 'ropa_intima_fem', 'masculino_estereotipo', 'rental'].includes(input.segmento) ? input.segmento : null

  const patch: Record<string, unknown> = { tamano, segmento }

  const { data: p } = await acceso.supabase
    .from('prospectos')
    .select('responsable_id, producto_objetivo')
    .eq('id', id)
    .maybeSingle<{ responsable_id: string | null; producto_objetivo: string | null }>()

  if (p && !p.responsable_id) {
    const persona = personaSegunReglas({ producto: p.producto_objetivo, tamano, segmento })
    if (persona) {
      const emailId = await mapaOperadorId(acceso.supabase)
      const rid = emailId.get(OPERADOR_EMAIL[persona])
      if (rid) patch.responsable_id = rid
    }
  }

  const { error } = await acceso.supabase.from('prospectos').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { ok: true }
}

// ── Digest matinal por operador (CH-10) ──────────────────────────────────────
// "Al inicio de la jornada, a cada uno cuántos prospectos y borradores listos
// tiene". Se invoca desde el cron /api/cron/crm-digest (CRON_SECRET) o el
// endpoint de agente (para probar). Usa createAdminClient + emailDigest (aplica
// EMAIL_DIGEST_OVERRIDE → tomas@/natalia@casahiedra.com). dryRun no envía;
// soloEmail limita el envío a un destinatario (prueba).

/** Una línea de la lista del día: a quién contactar y desde cuándo está esperando. */
export interface ItemAgenda {
  empresa: string
  estado: string          // respondio | nunca | atrasado | hoy
  ultimoToque: string | null
  diasAtraso: number
}

export interface FilaDigestMatinal {
  nombre: string
  email: string | null
  prospectos: number
  porContactar: number
  borradoresListos: number
  agenda: ItemAgenda[]
  enviado: boolean
}

export interface ResultadoDigestMatinal {
  hoy: string
  filas: FilaDigestMatinal[]
  enviados: number
  /** Estado del cotejo de correos: si está vencido, la agenda puede mentir. */
  cotejo?: EstadoCotejo
}

function listaAgendaHtml(agenda: ItemAgenda[]): string {
  if (agenda.length === 0) {
    return '<p style="color:#777;font-size:13px;margin:6px 0 0;">Nada que contactar hoy.</p>'
  }
  return `<ul style="padding-left:18px;margin:6px 0 0;font-size:13px;">
    ${agenda.map(a => {
      const marca =
        a.estado === 'respondio' ? '<span style="color:#c9a84c;font-weight:600;">te respondió</span> · '
        : a.diasAtraso > 0 ? `<span style="color:#c9a84c;">${a.diasAtraso} día${a.diasAtraso === 1 ? '' : 's'} atrasado</span> · `
        : ''
      const ultimo = a.ultimoToque ? `último contacto ${a.ultimoToque}` : 'sin contactar aún'
      return `<li style="margin-bottom:4px;"><strong>${a.empresa}</strong> — ${marca}${ultimo}</li>`
    }).join('')}
  </ul>`
}

function htmlDigestMatinal(
  nombre: string, total: number, porContactar: number, borradores: number, hoy: string,
  agenda: ItemAgenda[],
  equipo?: FilaDigestMatinal[],
  avisoCotejo?: string | null,
): string {
  // Va ARRIBA de la lista, no al pie: si las respuestas no están registradas,
  // la lista de abajo puede estar equivocada y hay que leerla sabiéndolo.
  const cotejoHtml = avisoCotejo
    ? `<div style="border-left:3px solid #c9a84c;background:#faf6ec;padding:10px 12px;margin:0 0 16px;font-size:13px;color:#111;">
         <strong>Ojo:</strong> ${avisoCotejo}
       </div>`
    : ''
  // Quien gestiona ve la lista completa de cada uno, no solo el conteo: el
  // número dice que hay trabajo, la lista dice cuál.
  const equipoHtml = equipo && equipo.length
    ? `
      <h3 style="font-size:14px;margin:26px 0 8px;border-top:1px solid #ddd;padding-top:14px;">El equipo hoy</h3>
      ${equipo.map(e => `
        <p style="margin:12px 0 0;font-size:13px;">
          <strong>${e.nombre}</strong>
          <span style="color:#777;"> · ${e.agenda.length} por contactar · ${e.prospectos} en cartera${e.borradoresListos ? ` · ${e.borradoresListos} borrador(es) listo(s)` : ''}</span>
        </p>
        ${listaAgendaHtml(e.agenda)}
      `).join('')}`
    : ''
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <h2 style="font-size:18px;">Buenos días, ${nombre}</h2>
      ${cotejoHtml}
      <p style="color:#444;">Tu jornada de hoy (${hoy}):</p>
      <ul style="padding-left:18px;margin:0;">
        <li style="margin-bottom:6px;"><strong>${total}</strong> prospecto${total === 1 ? '' : 's'} activo${total === 1 ? '' : 's'}${porContactar ? ` — <strong>${porContactar}</strong> por contactar` : ''}</li>
        <li><strong>${borradores}</strong> borrador${borradores === 1 ? '' : 'es'} listo${borradores === 1 ? '' : 's'} para enviar</li>
      </ul>

      <h3 style="font-size:14px;margin:22px 0 0;">Contactar hoy (${agenda.length})</h3>
      ${listaAgendaHtml(agenda)}
      ${equipoHtml}
      <p style="margin-top:22px;"><a href="https://app.casahiedra.com/crm" style="color:#7a9e7e;">Abrir el CRM →</a></p>
    </div>`
}

export async function procesarDigestMatinal(
  opts: { dryRun?: boolean; soloEmail?: string } = {},
): Promise<ResultadoDigestMatinal> {
  const dryRun = opts.dryRun ?? false
  const solo = opts.soloEmail?.trim().toLowerCase()
  const admin = createAdminClient()
  const hoy = hoyChileISO()

  const { data: perfiles } = await admin
    .from('profiles').select('id, nombre, email, rol').in('rol', ROLES_CRM)
  const operadores = (perfiles ?? []).filter(
    (p: any) => p.email && OPERADORES_CRM_EMAILS.has(p.email.trim().toLowerCase()),
  ) as { id: string; nombre: string; email: string | null }[]

  const [{ data: prospectos }, { data: borradores }, cotejo] = await Promise.all([
    admin.from('prospectos').select('id, empresa, etapa, responsable_id, snooze_hasta, crm_interacciones(fecha, respondido)'),
    admin.from('crm_borradores').select('prospecto_id').eq('estado', 'listo'),
    getEstadoCotejo(),
  ])

  const respDe = new Map<string, string | null>()
  const activos = new Map<string, { total: number; porContactar: number }>()
  const agendaDe = new Map<string, (ItemAgenda & { _prio: number })[]>()

  for (const p of (prospectos ?? []) as any[]) {
    respDe.set(p.id, p.responsable_id)
    if (!p.responsable_id || fueraDeAgenda(p.etapa)) continue

    const a = activos.get(p.responsable_id) ?? { total: 0, porContactar: 0 }
    a.total++
    if (p.etapa === 'prospecto') a.porContactar++
    activos.set(p.responsable_id, a)

    // La lista del día sale del mismo motor que la agenda de la app: una sola
    // fuente de verdad, para que el correo y la pantalla nunca se contradigan.
    const cad = calcularCadencia(p.crm_interacciones ?? [], hoy, p.snooze_hasta)
    if (!cad.pendiente) continue
    const arr = agendaDe.get(p.responsable_id) ?? []
    arr.push({
      empresa: p.empresa,
      estado: cad.estado,
      ultimoToque: cad.ultimoToque,
      diasAtraso: cad.diasAtraso,
      _prio: prioridadCadencia(cad),
    })
    agendaDe.set(p.responsable_id, arr)
  }

  const borradoresPorResp = new Map<string, number>()
  for (const b of (borradores ?? []) as { prospecto_id: string }[]) {
    const rid = respDe.get(b.prospecto_id)
    if (rid) borradoresPorResp.set(rid, (borradoresPorResp.get(rid) ?? 0) + 1)
  }

  // Números y agenda de cada operador: sirven para su propio correo y para el
  // detalle que recibe Tomás, que gestiona al equipo.
  const numeros = operadores.map(op => {
    const a = activos.get(op.id) ?? { total: 0, porContactar: 0 }
    const agenda = (agendaDe.get(op.id) ?? [])
      .sort((x, y) => y._prio - x._prio)
      .map(({ _prio, ...item }) => item)
    return { op, total: a.total, porContactar: a.porContactar, borr: borradoresPorResp.get(op.id) ?? 0, agenda }
  })

  const equipo: FilaDigestMatinal[] = numeros.map(n => ({
    nombre: n.op.nombre, email: emailDigest(n.op.email), prospectos: n.total,
    porContactar: n.porContactar, borradoresListos: n.borr, agenda: n.agenda, enviado: false,
  }))

  const filas: FilaDigestMatinal[] = []
  let enviados = 0
  for (const n of numeros) {
    const op = n.op
    const destino = emailDigest(op.email)
    if (solo && op.email?.trim().toLowerCase() !== solo && destino?.toLowerCase() !== solo) continue
    // Tomás gestiona al equipo → su correo lleva además la agenda de todos.
    const esManager = op.email?.trim().toLowerCase() === OPERADOR_EMAIL.tomas
    let enviado = false
    if (!dryRun && destino) {
      try {
        await sendEmail({
          to: destino,
          subject: `CRM · ${n.agenda.length} por contactar hoy${n.borr ? ` · ${n.borr} borrador${n.borr === 1 ? '' : 'es'} listo${n.borr === 1 ? '' : 's'}` : ''}`,
          html: htmlDigestMatinal(
            op.nombre, n.total, n.porContactar, n.borr, hoy, n.agenda,
            esManager ? equipo.filter(e => e.nombre !== op.nombre) : undefined,
            cotejo.mensaje,
          ),
          contexto: 'crm:digest-matinal',
        })
        enviado = true
        enviados++
      } catch (e) {
        console.error('[crm-digest] envío falló para', destino, e)
      }
    }
    filas.push({
      nombre: op.nombre, email: destino, prospectos: n.total, porContactar: n.porContactar,
      borradoresListos: n.borr, agenda: n.agenda, enviado,
    })
  }
  return { hoy, filas, enviados, cotejo }
}

/**
 * ¿Ya salió el digest esta mañana?
 *
 * El agente del CRM lo dispara al terminar su rutina (así nunca sale antes del
 * reparto) y el cron queda de respaldo por si el agente no corrió. Sin esta
 * marca, los días buenos el equipo recibiría el correo dos veces.
 *
 * Ventana de 12 horas en vez de "día calendario": evita hacer aritmética de
 * zona horaria con DST y cubre de sobra el hueco entre el agente (~09:00) y el
 * cron (10:30).
 */
export async function digestYaEnviado(): Promise<boolean> {
  const admin = createAdminClient()
  const desde = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
  const { data } = await admin
    .from('agente_acciones')
    .select('id')
    .eq('herramienta', HERRAMIENTA_DIGEST)
    .eq('ok', true)
    .gte('created_at', desde)
    .limit(1)
  return (data ?? []).length > 0
}

/**
 * ¿Hace cuánto que no se cotejan los correos?
 *
 * El cotejo es lo único que llena `respondido`, y de ese campo cuelga toda la
 * cadencia. Si el proceso se detiene no falla nada: el CRM sigue operando y
 * mintiendo en silencio. Esto lo hace visible.
 *
 * Se mide contra la auditoría de agente porque es donde queda registro de que
 * la rutina efectivamente corrió.
 */
export async function getEstadoCotejo(): Promise<EstadoCotejo> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('agente_acciones')
    .select('created_at')
    .in('herramienta', HERRAMIENTAS_COTEJO as unknown as string[])
    .eq('ok', true)
    .order('created_at', { ascending: false })
    .limit(1)

  const iso = (data ?? [])[0]?.created_at as string | undefined
  // created_at es timestamptz; se lleva a fecha de Chile para comparar con hoy.
  const ultimo = iso
    ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
    : null

  return evaluarCotejo(ultimo, hoyChileISO())
}

/**
 * Prospectos agotados (16 sin respuesta) → propuesta de pasarlos a En frío.
 *
 * No los mueve: deja la propuesta en la Bandeja para que un humano decida. Un
 * prospecto que no contesta 16 veces probablemente esté muerto, pero "probable"
 * no alcanza para sacarlo del tablero sin que nadie lo mire.
 */
export async function proponerEnFrioAgotados(
  opts: { dryRun?: boolean } = {},
): Promise<{ propuestos: number; empresas: string[] }> {
  const admin = createAdminClient()
  const hoy = hoyChileISO()

  const { data: prospectos } = await admin
    .from('prospectos')
    .select('id, empresa, etapa, snooze_hasta, crm_interacciones(fecha, respondido)')
    .not('etapa', 'in', '("en_frio","descartado","confirmado","nurture")')

  // Los que ya tienen una propuesta pendiente no se vuelven a proponer.
  const { data: yaPropuestos } = await admin
    .from('crm_aprobaciones')
    .select('prospecto_id')
    .eq('tipo', 'cambio_etapa')
    .eq('estado', 'pendiente')
  const pendientes = new Set((yaPropuestos ?? []).map((r: any) => r.prospecto_id).filter(Boolean))

  const empresas: string[] = []
  for (const p of (prospectos ?? []) as any[]) {
    if (pendientes.has(p.id)) continue
    const cad = calcularCadencia(p.crm_interacciones ?? [], hoy, p.snooze_hasta)
    if (cad.estado !== 'agotado') continue
    empresas.push(p.empresa)
    if (opts.dryRun) continue
    await admin.from('crm_aprobaciones').insert({
      tipo: 'cambio_etapa',
      prospecto_id: p.id,
      payload: { etapa: 'en_frio' },
      estado: 'pendiente',
      origen: 'cron_correos',
      nota_agente: `${cad.sinRespuesta} contactos sin respuesta — la cadencia se agotó. ¿Pasar a En frío?`,
    })
  }
  return { propuestos: empresas.length, empresas }
}

export interface ResumenSemana {
  /** Lunes de la semana en curso, YYYY-MM-DD. */
  desde: string
  contactos: number
  /** Marcas distintas tocadas: 12 contactos a una sola marca no es lo mismo. */
  marcas: number
  respondieron: number
}

/**
 * Lo que lleva el equipo esta semana. Se cuenta de LUNES a hoy, no los últimos
 * 7 días: una semana que se reinicia el lunes se puede cerrar, y los últimos 7
 * días son una ventana que nunca termina.
 *
 * A propósito NO es una racha. Una racha castiga la ausencia y con un equipo de
 * cuatro y fines de semana se rompe sola — se convierte en fuente de culpa, que
 * es justo por lo que el cron de seguimientos sigue apagado.
 */
export async function getResumenSemana(): Promise<ResumenSemana> {
  const supabase = await createClient()
  const hoy = hoyChileISO()

  // Lunes de esta semana, en fechas planas para no cruzarse con UTC.
  const d = new Date(hoy + 'T12:00:00')
  const diaSemana = (d.getDay() + 6) % 7          // 0 = lunes
  d.setDate(d.getDate() - diaSemana)
  const desde = d.toLocaleDateString('en-CA')

  const { data, error } = await supabase
    .from('crm_interacciones')
    .select('prospecto_id, respondido, fecha')
    .gte('fecha', desde)
    .lte('fecha', hoy)

  if (error) {
    console.error('[crm] resumen semanal:', error.message)
    return { desde, contactos: 0, marcas: 0, respondieron: 0 }
  }

  const filas = data ?? []
  return {
    desde,
    contactos: filas.length,
    marcas: new Set(filas.map(r => r.prospecto_id)).size,
    respondieron: filas.filter(r => r.respondido).length,
  }
}

export interface MetricasCrm {
  totalPipeline: number
  totalGanados: number
  porContactar: number
  enConversacion: number
  porEtapa: Record<string, number>
  porResponsable: { nombre: string; total: number }[]
}

// Conteos de un vistazo del pipeline (versión simple F1; se enriquece en F2).
export async function getMetricasCrm(): Promise<MetricasCrm> {
  const prospectos = await getPipeline()

  // Pipeline = activos (excluye descartado y en frío)
  const pipeline = prospectos.filter(p => p.etapa !== 'descartado' && p.etapa !== 'en_frio')
  const ganados = prospectos.filter(p => p.etapa === 'confirmado')

  const porEtapa: Record<string, number> = {}
  for (const p of prospectos) {
    porEtapa[p.etapa] = (porEtapa[p.etapa] ?? 0) + 1
  }

  const responsablesMap = new Map<string, number>()
  for (const p of pipeline) {
    const nombre = p.responsable?.nombre ?? 'Sin asignar'
    responsablesMap.set(nombre, (responsablesMap.get(nombre) ?? 0) + 1)
  }

  return {
    totalPipeline: pipeline.length,
    totalGanados: ganados.length,
    porContactar: porEtapa['prospecto'] ?? 0,
    enConversacion: porEtapa['conversacion'] ?? 0,
    porEtapa,
    porResponsable: Array.from(responsablesMap.entries())
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total),
  }
}

// Biblioteca de contactos: insights por etapa (empíricos) para mejorar
// recomendaciones. Se computa en vivo desde prospectos + crm_interacciones.
export async function getBibliotecaContactos(): Promise<BibliotecaContactos> {
  const supabase = await createClient()
  const [{ data: prospectos }, { data: interacciones }] = await Promise.all([
    supabase.from('prospectos').select('id, etapa, origen'),
    supabase.from('crm_interacciones').select('prospecto_id, respondido'),
  ])
  return agregarBiblioteca(
    (prospectos ?? []) as { id: string; etapa: string; origen: string | null }[],
    (interacciones ?? []) as { prospecto_id: string; respondido: boolean | null }[],
  )
}

// ── Mutaciones ───────────────────────────────────────────────────────────────

export interface ProspectoInput {
  empresa: string
  nombre_contacto?: string
  email?: string
  telefono?: string
  origen?: string
  arquetipo?: string
  etapa?: EtapaProspecto
  responsable_id?: string
  score?: string
  decisor?: string
  angulo?: string
  producto_objetivo?: string
  notas?: string
}

function normalizarProspecto(input: ProspectoInput) {
  return {
    empresa: input.empresa.trim(),
    nombre_contacto: limpiar(input.nombre_contacto),
    email: limpiar(input.email),
    telefono: limpiar(input.telefono),
    origen: limpiar(input.origen),
    arquetipo: limpiar(input.arquetipo),
    responsable_id: input.responsable_id || null,
    score: limpiar(input.score),
    decisor: limpiar(input.decisor),
    angulo: limpiar(input.angulo),
    producto_objetivo: limpiar(input.producto_objetivo),
    notas: limpiar(input.notas),
  }
}

export async function crearProspecto(
  input: ProspectoInput,
): Promise<{ ok?: true; id?: string; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  if (!input.empresa?.trim()) return { error: 'La empresa es obligatoria' }

  const { error, data } = await acceso.supabase
    .from('prospectos')
    .insert({
      ...normalizarProspecto(input),
      etapa: input.etapa ?? 'prospecto',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/crm')
  return { ok: true, id: data.id }
}

export async function actualizarProspecto(
  id: string,
  input: ProspectoInput,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  if (!input.empresa?.trim()) return { error: 'La empresa es obligatoria' }

  const { error } = await acceso.supabase
    .from('prospectos')
    .update(normalizarProspecto(input))
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { ok: true }
}

export async function moverEtapa(
  id: string,
  nuevaEtapa: EtapaProspecto,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  if (!(nuevaEtapa in ETAPA_PROSPECTO_LABELS)) return { error: 'Etapa inválida' }

  // F1: mover a 'confirmado' solo cambia la etapa. El handoff (brief a
  // cotización) se construye en F5.
  const { error } = await acceso.supabase
    .from('prospectos')
    .update({ etapa: nuevaEtapa })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { ok: true }
}

export interface InteraccionInput {
  fecha?: string          // YYYY-MM-DD (plano, no convertir con new Date)
  tipo?: string
  resumen?: string
  cuerpo?: string         // correo enviado adjunto
  respondido?: boolean    // el contacto tuvo respuesta
  proximo_paso?: string
  fecha_proximo?: string  // YYYY-MM-DD
  gmail_thread?: string
}

/**
 * Toque de un click: registra que se contactó al prospecto hoy, por tal canal,
 * y nada más.
 *
 * Registrar y detallar son dos momentos distintos. Exigir un resumen para
 * anotar "le escribí" es la razón por la que había 1 contacto en 30 prospectos;
 * el detalle se agrega después desde la ficha, si vale la pena.
 */
export async function registrarToque(
  prospectoId: string,
  tipo: string,
): Promise<{ ok?: true; error?: string }> {
  if (!(TIPOS_INTERACCION as readonly string[]).includes(tipo)) {
    return { error: 'Tipo de contacto no válido' }
  }
  // Fecha de hoy en Chile, plana YYYY-MM-DD (nunca new Date() sobre el string).
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  return registrarInteraccion(prospectoId, { fecha: hoy, tipo })
}

export async function registrarInteraccion(
  prospectoId: string,
  input: InteraccionInput,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  const { error } = await acceso.supabase.from('crm_interacciones').insert({
    prospecto_id: prospectoId,
    fecha: input.fecha || null,
    tipo: limpiar(input.tipo),
    resumen: limpiar(input.resumen),
    cuerpo: limpiar(input.cuerpo),
    respondido: input.respondido ?? false,
    proximo_paso: limpiar(input.proximo_paso),
    fecha_proximo: input.fecha_proximo || null,
    gmail_thread: limpiar(input.gmail_thread),
    // Quién lo registró. Sin esto no hay tracking por persona: lo único
    // atribuible era el responsable del prospecto, que es el REPARTO.
    registrado_por: acceso.user.id,
  })

  if (error) return { error: error.message }

  // Un toque nuevo consume el snooze: si no, un aplazamiento viejo seguiría
  // escondiendo al prospecto aunque el reloj ya haya vuelto a partir.
  await acceso.supabase.from('prospectos').update({ snooze_hasta: null }).eq('id', prospectoId)

  revalidatePath('/crm')
  revalidatePath(`/crm/${prospectoId}`)
  return { ok: true }
}

// Marca/desmarca un hito del checklist del prospecto (no ordinal).
export async function toggleChecklist(
  id: string,
  item: string,
): Promise<{ ok?: true; checklist?: string[]; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }
  if (!(CHECKLIST_PROSPECTO as readonly string[]).includes(item)) return { error: 'Ítem de checklist inválido' }

  const { data: p } = await acceso.supabase
    .from('prospectos')
    .select('checklist')
    .eq('id', id)
    .maybeSingle<{ checklist: string[] | null }>()
  if (!p) return { error: 'Prospecto no encontrado' }

  const actual = p.checklist ?? []
  const nuevo = actual.includes(item) ? actual.filter(x => x !== item) : [...actual, item]

  const { error } = await acceso.supabase.from('prospectos').update({ checklist: nuevo }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { ok: true, checklist: nuevo }
}

// Borra un contacto/interacción de la bitácora (reversible: la gente se equivoca).
export async function eliminarInteraccion(
  id: string,
  prospectoId: string,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  const { error } = await acceso.supabase.from('crm_interacciones').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm')
  revalidatePath(`/crm/${prospectoId}`)
  return { ok: true }
}

// Guarda las notas del prospecto (sin pasar por el formulario completo).
export async function actualizarNotas(
  id: string,
  notas: string,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  const { error } = await acceso.supabase.from('prospectos').update({ notas: limpiar(notas) }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/crm/${id}`)
  return { ok: true }
}

// Cambia el responsable asignado (cambio rápido desde la ficha).
export async function asignarResponsable(
  id: string,
  responsableId: string | null,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  const { error } = await acceso.supabase
    .from('prospectos')
    .update({ responsable_id: responsableId || null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { ok: true }
}

/**
 * Reparte varios prospectos de una vez.
 *
 * Existe porque 18 de 30 prospectos estaban sin responsable: sin dueño no hay
 * lista, sin lista no hay acción, y la capa de recompensa no tiene qué premiar.
 * Asignar de a uno desde cada ficha hacía el reparto lo bastante caro como para
 * no hacerlo nunca.
 */
export async function asignarResponsableMasivo(
  ids: string[],
  responsableId: string | null,
): Promise<{ ok?: true; n?: number; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  const limpios = [...new Set(ids.filter(Boolean))]
  if (limpios.length === 0) return { error: 'No hay prospectos seleccionados' }

  const { error } = await acceso.supabase
    .from('prospectos')
    .update({ responsable_id: responsableId || null })
    .in('id', limpios)
  if (error) return { error: error.message }

  revalidatePath('/crm')
  for (const id of limpios) revalidatePath(`/crm/${id}`)
  return { ok: true, n: limpios.length }
}

// Cambia la "Prioridad" (columna DB: score) — manual: alta | media | baja | ''.
export async function asignarPrioridad(
  id: string,
  valor: string,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }
  if (valor && !['alta', 'media', 'baja'].includes(valor)) return { error: 'Prioridad inválida' }

  const { error } = await acceso.supabase.from('prospectos').update({ score: valor || null }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { ok: true }
}

// ── Árbol de contactos (varias personas por marca) ───────────────────────────

export interface ContactoInput {
  nombre?: string
  cargo?: string
  email?: string
  telefono?: string
  es_decisor?: boolean
  notas?: string
  links?: string[]
}

function normalizarContacto(input: ContactoInput) {
  return {
    nombre: limpiar(input.nombre),
    cargo: limpiar(input.cargo),
    email: limpiar(input.email),
    telefono: limpiar(input.telefono),
    es_decisor: input.es_decisor ?? false,
    notas: limpiar(input.notas),
    links: (input.links ?? []).map(s => s.trim()).filter(Boolean),
  }
}

export async function crearContacto(
  prospectoId: string,
  input: ContactoInput,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }
  const norm = normalizarContacto(input)
  if (!norm.nombre && !norm.email) return { error: 'El contacto necesita al menos nombre o correo' }

  const { error } = await acceso.supabase
    .from('crm_contactos')
    .insert({ prospecto_id: prospectoId, ...norm })
  if (error) return { error: error.message }
  revalidatePath(`/crm/${prospectoId}`)
  return { ok: true }
}

export async function actualizarContacto(
  id: string,
  prospectoId: string,
  input: ContactoInput,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }
  const norm = normalizarContacto(input)
  if (!norm.nombre && !norm.email) return { error: 'El contacto necesita al menos nombre o correo' }

  const { error } = await acceso.supabase.from('crm_contactos').update(norm).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/crm/${prospectoId}`)
  return { ok: true }
}

export async function eliminarContacto(
  id: string,
  prospectoId: string,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }
  const { error } = await acceso.supabase.from('crm_contactos').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/crm/${prospectoId}`)
  return { ok: true }
}

// Posponer el próximo contacto. El tope (un tercio del tramo, mínimo un día) se
// valida ACÁ: el cliente propone, el servidor decide — si no, el snooze se
// vuelve una forma silenciosa de nunca contactar a nadie.
export async function snoozeProspecto(
  id: string,
  dias: number,
): Promise<{ ok?: true; hasta?: string; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }
  if (!Number.isFinite(dias) || dias < 1) return { error: 'Días de snooze inválidos' }

  const { data: p } = await acceso.supabase
    .from('prospectos')
    .select('snooze_hasta, crm_interacciones(fecha, respondido)')
    .eq('id', id)
    .maybeSingle<{ snooze_hasta: string | null; crm_interacciones: { fecha: string | null; respondido: boolean | null }[] }>()
  if (!p) return { error: 'Prospecto no encontrado' }

  const hoy = hoyChileISO()
  const cad = calcularCadencia(p.crm_interacciones ?? [], hoy, p.snooze_hasta)
  const tope = snoozeMaximo(cad.intervalo)
  if (dias > tope) return { error: `El máximo para este tramo son ${tope} día${tope === 1 ? '' : 's'}` }

  // Se cuenta desde el vencimiento (o desde hoy si ya está atrasado).
  const base = cad.vence && cad.vence > hoy ? cad.vence : hoy
  const hasta = sumarDias(base, Math.floor(dias))

  const { error } = await acceso.supabase.from('prospectos').update({ snooze_hasta: hasta }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { ok: true, hasta }
}

// ── Casilla de borradores de respuesta ───────────────────────────────────────

export interface BorradorInput {
  id?: string
  asunto?: string
  cuerpo?: string
  links?: string[]
  adjuntos?: string[]
  estado?: string
  contacto_id?: string
}

const ESTADOS_BORRADOR = ['borrador', 'listo', 'enviado']

export async function guardarBorrador(
  prospectoId: string,
  input: BorradorInput,
): Promise<{ ok?: true; id?: string; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  const payload = {
    asunto: limpiar(input.asunto),
    cuerpo: limpiar(input.cuerpo),
    links: (input.links ?? []).map(s => s.trim()).filter(Boolean),
    adjuntos: (input.adjuntos ?? []).map(s => s.trim()).filter(Boolean),
    estado: input.estado && ESTADOS_BORRADOR.includes(input.estado) ? input.estado : 'borrador',
    contacto_id: input.contacto_id || null,
  }

  if (input.id) {
    const { error } = await acceso.supabase.from('crm_borradores').update(payload).eq('id', input.id)
    if (error) return { error: error.message }
    revalidatePath(`/crm/${prospectoId}`)
    return { ok: true, id: input.id }
  }

  const { data, error } = await acceso.supabase
    .from('crm_borradores')
    .insert({ prospecto_id: prospectoId, autor: 'operador', ...payload })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath(`/crm/${prospectoId}`)
  return { ok: true, id: data.id }
}

export async function eliminarBorrador(
  id: string,
  prospectoId: string,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }
  const { error } = await acceso.supabase.from('crm_borradores').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/crm/${prospectoId}`)
  return { ok: true }
}

export interface LecturaInput {
  url?: string
  dossier_ref?: string
  producto_derivado?: string  // banco | lookbook (heurística E7)
  fecha?: string
}

export async function registrarLectura(
  prospectoId: string,
  input: LecturaInput,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  const { error } = await acceso.supabase.from('crm_lecturas').insert({
    prospecto_id: prospectoId,
    url: limpiar(input.url),
    dossier_ref: limpiar(input.dossier_ref),
    producto_derivado: limpiar(input.producto_derivado),
    fecha: input.fecha || null,
  })
  if (error) return { error: error.message }

  // Heurística E7: si la lectura derivó un producto y el prospecto aún no lo
  // tiene definido, completarlo. Además marca el hito 'lectura' en el checklist
  // (no ordinal) y avanza a 'conversacion' si aún está antes.
  const { data: prospecto } = await acceso.supabase
    .from('prospectos')
    .select('arquetipo, producto_objetivo, etapa, checklist')
    .eq('id', prospectoId)
    .maybeSingle<{ arquetipo: string | null; producto_objetivo: string | null; etapa: string; checklist: string[] | null }>()

  if (prospecto) {
    const patch: Record<string, unknown> = {}
    const prod = limpiar(input.producto_derivado)
    if (prod && (!prospecto.producto_objetivo || prospecto.producto_objetivo === 'sin_definir')) {
      patch.producto_objetivo = prod
    }
    if (!prospecto.arquetipo || prospecto.arquetipo === 'sin_definir') {
      if (prod === 'banco') patch.arquetipo = 'feed'
      else if (prod === 'lookbook') patch.arquetipo = 'temporadas'
    }
    // Marcar el hito 'lectura' en el checklist.
    const checklist = prospecto.checklist ?? []
    if (!checklist.includes('lectura')) patch.checklist = [...checklist, 'lectura']
    // Avanzar a conversación si aún está antes.
    if (prospecto.etapa === 'prospecto' || prospecto.etapa === 'contacto') {
      patch.etapa = 'conversacion'
    }
    if (Object.keys(patch).length) {
      await acceso.supabase.from('prospectos').update(patch).eq('id', prospectoId)
    }
  }

  revalidatePath(`/crm/${prospectoId}`)
  revalidatePath('/crm')
  return { ok: true }
}

export async function eliminarProspecto(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  // Borrado más restrictivo: solo admin (CASCADE arrastra interacciones/lecturas).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: self } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<Pick<Profile, 'rol'>>()

  if (self?.rol !== 'admin') return { error: 'Solo un admin puede eliminar prospectos' }

  const { error } = await supabase.from('prospectos').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm')
  return { ok: true }
}

// ── Handoff: derivar brief a cotización (CH-10 F5) ───────────────────────────
// Genera un brief desde el prospecto y lo deja como PROPUESTA en la Bandeja.
// No deriva solo: al aprobarlo se garantiza el cliente y se entrega al flujo de
// cotizaciones (ver lib/crm-aprobaciones.ts).
export async function derivarBrief(
  prospectoId: string,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }

  const { data: p } = await acceso.supabase
    .from('prospectos')
    .select('id, empresa, nombre_contacto, decisor, angulo, arquetipo, producto_objetivo, cliente_id')
    .eq('id', prospectoId)
    .maybeSingle()
  if (!p) return { error: 'Prospecto no encontrado' }

  // Evitar duplicar un brief ya pendiente para el mismo prospecto.
  const { data: yaHay } = await acceso.supabase
    .from('crm_aprobaciones')
    .select('id')
    .eq('prospecto_id', prospectoId)
    .eq('tipo', 'brief_cotizacion')
    .eq('estado', 'pendiente')
    .maybeSingle()
  if (yaHay) return { error: 'Ya hay un brief pendiente para este prospecto en la Bandeja' }

  const { data: lecturas } = await acceso.supabase
    .from('crm_lecturas')
    .select('url, dossier_ref, producto_derivado, fecha')
    .eq('prospecto_id', prospectoId)
    .order('fecha', { ascending: false })

  const brief = {
    empresa: p.empresa,
    contacto: p.nombre_contacto,
    decisor: p.decisor,
    angulo: p.angulo,
    arquetipo: p.arquetipo,
    producto_objetivo: p.producto_objetivo,
    cliente_id: p.cliente_id,
    lectura: lecturas?.[0] ?? null,
  }

  const { error } = await acceso.supabase.from('crm_aprobaciones').insert({
    tipo: 'brief_cotizacion',
    prospecto_id: prospectoId,
    payload: brief,
    estado: 'pendiente',
    origen: 'chat',
    nota_agente: 'Derivado manualmente desde la ficha',
  })
  if (error) return { error: error.message }

  revalidatePath('/crm')
  revalidatePath('/crm/aprobaciones')
  revalidatePath(`/crm/${prospectoId}`)
  return { ok: true }
}

// ── Bandeja de Aprobación (CH-10 F2) ─────────────────────────────────────────

export interface AprobacionConProspecto extends CrmAprobacion {
  prospecto?: { empresa: string } | null
}

export async function getAprobacionesPendientes(): Promise<AprobacionConProspecto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crm_aprobaciones')
    .select('*, prospecto:prospectos(empresa)')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })
  if (error) return []
  return (data ?? []) as unknown as AprobacionConProspecto[]
}

// IDs de prospectos con al menos una propuesta pendiente → punto ch-gold en el Kanban.
export async function getProspectoIdsConPendiente(): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crm_aprobaciones')
    .select('prospecto_id')
    .eq('estado', 'pendiente')
    .not('prospecto_id', 'is', null)
  if (error) return []
  return Array.from(new Set((data ?? []).map(r => r.prospecto_id as string)))
}

export async function resolverAprobacion(
  id: string,
  accion: 'aprobado' | 'descartado',
  correcciones?: Record<string, string>,
): Promise<{ ok?: true; error?: string }> {
  const acceso = await verificarAccesoCrm()
  if (!acceso.ok) return { error: acceso.error }
  if (accion !== 'aprobado' && accion !== 'descartado') return { error: 'Acción inválida' }

  const { data: ap } = await acceso.supabase
    .from('crm_aprobaciones')
    .select('id, tipo, prospecto_id, payload, estado')
    .eq('id', id)
    .maybeSingle<AprobacionRow>()
  if (!ap) return { error: 'Propuesta no encontrada' }
  if (ap.estado !== 'pendiente') return { error: `La propuesta ya está ${ap.estado}` }

  // Correcciones antes de aplicar. Sin esto, una propuesta con un dato mal
  // tipeado (el caso real: "gmail.con") sólo tenía dos salidas y las dos malas:
  // aprobar y crear el prospecto con el error, o descartar y perder el lead.
  let aplicable = ap
  let corregido: Record<string, string> | null = null
  if (accion === 'aprobado' && correcciones && Object.keys(correcciones).length > 0) {
    const permitidos = CAMPOS_CORREGIBLES[ap.tipo] ?? []
    const limpio: Record<string, string> = {}
    for (const [k, v] of Object.entries(correcciones)) {
      if (!permitidos.includes(k)) continue   // sólo campos de texto del payload
      const valor = typeof v === 'string' ? v.trim() : ''
      if (valor !== ((ap.payload ?? {})[k] ?? '')) limpio[k] = valor
    }
    if (Object.keys(limpio).length > 0) {
      corregido = limpio
      aplicable = { ...ap, payload: { ...(ap.payload ?? {}), ...limpio } }
    }
  }

  if (accion === 'aprobado') {
    try {
      await aplicarEfectoAprobacion(acceso.supabase, aplicable)
    } catch (e) {
      return { error: e instanceof AplicarError ? e.message : 'Error al aplicar la propuesta' }
    }
  }

  const { error } = await acceso.supabase
    .from('crm_aprobaciones')
    .update({
      estado: accion,
      resuelto_por: acceso.user.id,
      resuelto_at: new Date().toISOString(),
      // Se guarda el payload aplicado, no el propuesto: si alguien corrigió, el
      // registro tiene que decir qué se creó de verdad.
      ...(corregido ? { payload: aplicable.payload } : {}),
    })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/crm')
  revalidatePath('/crm/aprobaciones')
  return { ok: true }
}

// ── Cron: seguimientos vencidos + prospectos estancados (CH-10 F4) ────────────
// Se invoca SOLO desde el cron /api/cron/crm-seguimientos (autenticado por
// CRON_SECRET), por eso usa createAdminClient (sin sesión de usuario). Envía un
// digest por responsable. `dryRun` calcula sin enviar (para pruebas).

const DIAS_ESTANCADO_DEFAULT = 21

function hoyChileISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

// Override CONFIRMADO por Tomás (jun 2026): los únicos con correo corporativo
// @casahiedra.com son Tomás y Natalia; el resto del equipo NO tiene casahiedra,
// así que el digest se les manda a su email real del perfil. Clave = email del
// perfil (dato real de la tabla profiles). NO inferir/derivar direcciones.
const EMAIL_DIGEST_OVERRIDE: Record<string, string> = {
  'tomasmontealegrem@gmail.com': 'tomas@casahiedra.com',
  'nataliaalejandra.r@gmail.com': 'natalia@casahiedra.com',
}

// Excluidos del digest por decisión de Tomás (jun 2026): conservan su perfil y
// acceso al CRM, pero NO deben recibir ningún recordatorio. Clave = email real.
const EMAIL_DIGEST_EXCLUIR = new Set<string>([
  'ignaciofigueroas@gmail.com',
  'ornamentastudio@gmail.com', // FOCH
])

// Devuelve la dirección a la que mandar el digest, o null si no se debe enviar
// (sin email o excluido). NO infiere direcciones.
function emailDigest(profileEmail: string | null | undefined): string | null {
  if (!profileEmail) return null
  const e = profileEmail.trim().toLowerCase()
  if (EMAIL_DIGEST_EXCLUIR.has(e)) return null
  return EMAIL_DIGEST_OVERRIDE[e] ?? profileEmail
}

interface DigestResponsable {
  email: string | null
  nombre: string
  vencidos: { empresa: string; proximo_paso: string | null; fecha_proximo: string }[]
  estancados: { empresa: string; dias: number }[]
}

export interface ResultadoSeguimientos {
  hoy: string
  totalVencidos: number
  totalEstancados: number
  enviados: number
  fallidos: number
  sinEmail: number
  digests: { nombre: string; email: string | null; vencidos: number; estancados: number }[]
}

export async function procesarSeguimientosCrm(
  opts: { dryRun?: boolean; diasEstancado?: number } = {},
): Promise<ResultadoSeguimientos> {
  const dryRun = opts.dryRun ?? false
  const diasEstancado = opts.diasEstancado ?? DIAS_ESTANCADO_DEFAULT
  const admin = createAdminClient()
  const hoy = hoyChileISO()
  const INACTIVAS = ['confirmado', 'descartado', 'nurture', 'en_frio']

  // Prospectos activos con responsable e interacciones (para vencidos y estancados).
  const { data: prospectos } = await admin
    .from('prospectos')
    .select('id, empresa, etapa, created_at, responsable:profiles!prospectos_responsable_id_fkey(id, nombre, email), crm_interacciones(proximo_paso, fecha_proximo, fecha, created_at)')

  const porResponsable = new Map<string, DigestResponsable>()
  const keyDe = (r: any) => (r?.id ?? 'sin_responsable')
  const ensure = (r: any): DigestResponsable => {
    const k = keyDe(r)
    if (!porResponsable.has(k)) {
      porResponsable.set(k, { email: emailDigest(r?.email), nombre: r?.nombre ?? 'Sin responsable', vencidos: [], estancados: [] })
    }
    return porResponsable.get(k)!
  }

  let totalVencidos = 0
  let totalEstancados = 0

  for (const p of (prospectos ?? []) as any[]) {
    if (INACTIVAS.includes(p.etapa)) continue
    const r = p.responsable

    // Vencidos: la interacción con fecha_proximo más próxima ya pasada.
    const conProximo = (p.crm_interacciones ?? [])
      .filter((i: any) => i.fecha_proximo && i.fecha_proximo <= hoy)
      .sort((a: any, b: any) => (a.fecha_proximo < b.fecha_proximo ? -1 : 1))
    if (conProximo.length > 0) {
      const i = conProximo[0]
      ensure(r).vencidos.push({ empresa: p.empresa, proximo_paso: i.proximo_paso ?? null, fecha_proximo: i.fecha_proximo })
      totalVencidos++
    }

    // Estancados: última actividad hace >= diasEstancado.
    const fechas: string[] = (p.crm_interacciones ?? [])
      .map((i: any) => (i.fecha ?? i.created_at)?.slice(0, 10))
      .filter(Boolean)
    fechas.push(p.created_at?.slice(0, 10))
    const ultima = fechas.filter(Boolean).sort().at(-1)
    if (ultima) {
      const dias = Math.round((new Date(hoy + 'T12:00:00').getTime() - new Date(ultima + 'T12:00:00').getTime()) / 86_400_000)
      if (dias >= diasEstancado) {
        ensure(r).estancados.push({ empresa: p.empresa, dias })
        totalEstancados++
      }
    }
  }

  let enviados = 0
  let fallidos = 0
  let sinEmail = 0

  for (const d of porResponsable.values()) {
    if (d.vencidos.length === 0 && d.estancados.length === 0) continue
    if (!d.email) { sinEmail++; continue }
    if (dryRun) { enviados++; continue }

    const html = construirDigestHtml(d, hoy)
    try {
      await sendEmail({
        to: d.email,
        subject: `CRM · ${d.vencidos.length} seguimiento(s) vencido(s)${d.estancados.length ? ` · ${d.estancados.length} estancado(s)` : ''}`,
        html,
        contexto: 'crm:seguimientos',
      })
      enviados++
    } catch (e) {
      // No abortar el resto: registrar y seguir.
      console.error('[crm-seguimientos] envío falló para', d.email, e)
      fallidos++
    }
  }

  return {
    hoy,
    totalVencidos,
    totalEstancados,
    enviados,
    fallidos,
    sinEmail,
    digests: Array.from(porResponsable.values())
      .filter(d => d.vencidos.length || d.estancados.length)
      .map(d => ({ nombre: d.nombre, email: d.email, vencidos: d.vencidos.length, estancados: d.estancados.length })),
  }
}

function construirDigestHtml(d: DigestResponsable, hoy: string): string {
  const fila = (txt: string) => `<li style="margin-bottom:6px;">${txt}</li>`
  const vencidos = d.vencidos.length
    ? `<h3 style="font-size:14px;margin:16px 0 6px;">Seguimientos vencidos</h3><ul style="padding-left:18px;margin:0;">${d.vencidos
        .map(v => fila(`<strong>${v.empresa}</strong>${v.proximo_paso ? ` — ${v.proximo_paso}` : ''} <span style="color:#c9a84c;">(vencía ${v.fecha_proximo})</span>`))
        .join('')}</ul>`
    : ''
  const estancados = d.estancados.length
    ? `<h3 style="font-size:14px;margin:16px 0 6px;">Prospectos estancados</h3><ul style="padding-left:18px;margin:0;">${d.estancados
        .map(e => fila(`<strong>${e.empresa}</strong> — sin actividad hace ${e.dias} días`))
        .join('')}</ul>`
    : ''
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <h2 style="font-size:18px;">Hola ${d.nombre} 👋</h2>
      <p style="color:#444;">Resumen de tu pipeline al ${hoy}:</p>
      ${vencidos}
      ${estancados}
      <p style="margin-top:20px;"><a href="https://app.casahiedra.com/crm" style="color:#7a9e7e;">Abrir el CRM →</a></p>
    </div>
  `
}
