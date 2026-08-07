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
import { aplicarEfectoAprobacion, AplicarError, type AprobacionRow } from '@/lib/crm-aprobaciones'
import { agregarBiblioteca, type BibliotecaContactos } from '@/lib/crm-biblioteca'

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
const PIPELINE_SELECT = `${PROSPECTO_SELECT}, crm_interacciones(count), fechas:crm_interacciones(fecha)`

export async function getPipeline(): Promise<Prospecto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('prospectos')
    .select(PIPELINE_SELECT)
    .order('updated_at', { ascending: false })

  if (error) return []
  return (data ?? []).map((r: any) => {
    const fechas: string[] = Array.isArray(r.fechas)
      ? r.fechas.map((f: { fecha?: string | null }) => f?.fecha).filter(Boolean)
      : []
    // Fecha plana YYYY-MM-DD: comparar como string es correcto y evita UTC.
    const ultima = fechas.length ? fechas.sort().at(-1) ?? null : null
    return {
      ...r,
      n_interacciones: Array.isArray(r.crm_interacciones) ? (r.crm_interacciones[0]?.count ?? 0) : 0,
      ultima_interaccion: ultima,
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
    supabase.from('prospectos').select('id, etapa'),
    supabase.from('crm_interacciones').select('prospecto_id, respondido'),
  ])
  return agregarBiblioteca(
    (prospectos ?? []) as { id: string; etapa: string }[],
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
  })

  if (error) return { error: error.message }
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

  if (accion === 'aprobado') {
    try {
      await aplicarEfectoAprobacion(acceso.supabase, ap)
    } catch (e) {
      return { error: e instanceof AplicarError ? e.message : 'Error al aplicar la propuesta' }
    }
  }

  const { error } = await acceso.supabase
    .from('crm_aprobaciones')
    .update({ estado: accion, resuelto_por: acceso.user.id, resuelto_at: new Date().toISOString() })
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
