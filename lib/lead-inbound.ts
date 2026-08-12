// lib/lead-inbound.ts
// Núcleo COMPARTIDO de captación de leads entrantes → propuesta `prospecto_nuevo`
// en la Bandeja de Aprobación del CRM. Un solo camino para todos los canales:
//   - /api/lectura-lead   (con token, lo llama el SITIO: La Lectura y landings)
//   - /api/arriendo/lead  (público, lo llama nuestro pop-up de Rental desde el navegador)
// Así ningún canal abre su propia vía ni expone el token en el cliente.

import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA } from '@/lib/agent-crm'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PRODUCTOS = new Set(['banco', 'lookbook', 'spot'])
const ARQUETIPO_POR_PRODUCTO: Record<string, string> = { banco: 'feed', lookbook: 'temporadas' }

export interface LeadEntrante {
  email?: unknown
  nombre?: unknown
  empresa?: unknown
  producto?: unknown
  origen?: unknown
  nota?: unknown
  lectura?: unknown
  url?: unknown
  angulo?: unknown
  /** Dossier completo de La Lectura, tal como lo produjo el sitio. */
  dossier?: unknown
}

export type ResultadoLead =
  | { ok: true; duplicado: true; mensaje: string }
  | { ok: true; duplicado?: false; propuesta_id: string; estado: 'pendiente' }
  | { ok: false; status: number; error: string }

export async function crearPropuestaLead(body: LeadEntrante, notaAgente: string): Promise<ResultadoLead> {
  const email = strA(body?.email)
  if (!email || !EMAIL_RE.test(email)) return { ok: false, status: 400, error: 'Falta "email" válido' }

  // `nombre` es opcional: los pop-ups piden solo el correo para bajar la fricción.
  // Sin nombre usamos el email como etiqueta — el humano lo completa al aprobar.
  // NO se inventa un nombre a partir del correo.
  const nombre = strA(body?.nombre) || email
  const origen = (strA(body?.origen) || 'lectura').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'lectura'
  const nota = strA(body?.nota)
  const empresa = strA(body?.empresa) || nombre
  const prodRaw = strA(body?.producto)?.toLowerCase() ?? null
  const producto = prodRaw && PRODUCTOS.has(prodRaw) ? prodRaw : null
  const arquetipo = producto ? (ARQUETIPO_POR_PRODUCTO[producto] ?? 'sin_definir') : null
  const lectura = strA(body?.lectura)
  const url = strA(body?.url)
  const angulo = strA(body?.angulo)
  // El dossier viaja como objeto y se archiva al aprobar (ver crm-aprobaciones).
  // Tope de tamaño: la propuesta no puede convertirse en un vertedero.
  const dossier =
    body?.dossier && typeof body.dossier === 'object' && !Array.isArray(body.dossier)
      ? (JSON.stringify(body.dossier).length <= 400_000 ? body.dossier : null)
      : null

  const admin = createAdminClient()

  // ── Dedup por email (propuesta pendiente o prospecto ya existente) ──────────
  const [{ data: propPend }, { data: prospExist }] = await Promise.all([
    admin.from('crm_aprobaciones').select('payload').eq('tipo', 'prospecto_nuevo').eq('estado', 'pendiente'),
    admin.from('prospectos').select('id').eq('email', email).limit(1),
  ])
  const yaEnBandeja = (propPend ?? []).some(
    (a: any) => String(a.payload?.email ?? '').toLowerCase() === email.toLowerCase(),
  )
  if (yaEnBandeja || (prospExist && prospExist.length > 0)) {
    await registrarAccion({ herramienta: 'lectura-lead', payload: { email, origen }, ok: true, error: 'duplicado' })
    return { ok: true, duplicado: true, mensaje: 'Ya hay un lead con ese email (propuesta o prospecto).' }
  }

  // La procedencia va en una nota corta; el texto de La Lectura va aparte y
  // se guarda como nota bloqueada al aprobar. Antes se concatenaba todo en un
  // solo campo con un prefijo "[La Lectura]" puesto a mano, y así terminaron 19
  // prospectos con el dossier enterrado dentro de sus notas.
  const etiqueta = origen === 'lectura' ? 'La Lectura' : origen.charAt(0).toUpperCase() + origen.slice(1)
  const notas = [
    `[${etiqueta}] Lead entrante desde el sitio.`,
    nota || '',
    producto ? `Producto sugerido: ${producto}.` : '',
    url ? `Sitio/IG: ${url}` : '',
  ].filter(Boolean).join(' ').trim()

  const payload: Record<string, unknown> = { empresa, nombre_contacto: nombre, email, origen, notas }
  if (lectura) payload.lectura = lectura
  if (producto) payload.producto_objetivo = producto
  if (arquetipo) payload.arquetipo = arquetipo
  if (angulo) payload.angulo = angulo
  if (url) payload.url = url
  if (dossier) payload.dossier = dossier

  const { data, error } = await admin
    .from('crm_aprobaciones')
    .insert({
      tipo: 'prospecto_nuevo',
      prospecto_id: null,
      estado: 'pendiente',
      origen: 'agente',
      nota_agente: notaAgente,
      payload,
    })
    .select('id')
    .single<{ id: string }>()

  if (error || !data) {
    await registrarAccion({ herramienta: 'lectura-lead', payload: { email, origen }, ok: false, error: error?.message })
    return { ok: false, status: 500, error: error?.message ?? 'No se pudo crear la propuesta' }
  }

  await registrarAccion({
    herramienta: 'lectura-lead',
    payload: { nombre, email, producto, origen },
    resultado_tabla: 'crm_aprobaciones',
    resultado_id: data.id,
    ok: true,
  })
  return { ok: true, propuesta_id: data.id, estado: 'pendiente' }
}
