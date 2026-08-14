// lib/lead-inbound.ts
// Núcleo COMPARTIDO de captación de leads entrantes → prospecto en el Kanban.
// Un solo camino para todos los canales:
//   - /api/lectura-lead   (con token, lo llama el SITIO: La Lectura y landings)
//   - /api/arriendo/lead  (público, lo llama nuestro pop-up de Rental desde el navegador)
// Así ningún canal abre su propia vía ni expone el token en el cliente.
//
// Desde ago-2026 NO pasan por la Bandeja de Aprobación. Ésa quedó para lo que
// el agente PROPONE al descubrir marcas (Firecrawl + Brave), donde sí hay un
// juicio que revisar. Quien llena un formulario ya levantó la mano.

import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA } from '@/lib/agent-crm'
import { aplicarEfectoAprobacion } from '@/lib/crm-aprobaciones'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Los slugs que usa el SITIO en sus landings, traducidos a los productos de
// Hilván. Sin este mapa, `banco-audiovisual` y `produccion-estudiantes` no
// calzaban con nada y el producto se descartaba en silencio: 8 leads de landing
// quedaron sin producto, y con eso sin la regla de reparto que dependía de él.
const PRODUCTO_DESDE_SITIO: Record<string, string> = {
  'lookbook': 'lookbook',
  'banco': 'banco',
  'banco-audiovisual': 'banco',
  'spot': 'spot',
  'videoclip': 'videoclip',
  'produccion-estudiantes': 'estudiantes',
  'estudiantes': 'estudiantes',
}
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
  // ── Cómo llegó (ago-2026). Tres preguntas distintas, tres campos. ──
  /** Qué hizo: dejo_correo | descargo_precios | pidio_brief | hizo_lectura… */
  accion?: unknown
  /** En qué página NUESTRA. No confundir con `url`, que es el sitio del prospecto. */
  pagina?: unknown
  /** De dónde venía: campaña, fuente o medio. */
  campana?: unknown
  /** Crudo: utm_*, referrer, lo que el sitio quiera adjuntar. */
  datos?: unknown
}

export type ResultadoLead =
  | { ok: true; duplicado: true; mensaje: string }
  | { ok: true; duplicado?: false; prospecto_id: string; estado: 'prospecto' }
  | { ok: false; status: number; error: string }

export async function crearPropuestaLead(body: LeadEntrante, notaAgente: string): Promise<ResultadoLead> {
  const email = strA(body?.email)
  if (!email || !EMAIL_RE.test(email)) return { ok: false, status: 400, error: 'Falta "email" válido' }

  // `nombre` es opcional: los pop-ups piden solo el correo para bajar la fricción.
  // Sin nombre usamos el email como etiqueta — el humano lo completa al aprobar.
  // NO se inventa un nombre a partir del correo.
  const nombre = strA(body?.nombre) || email
  // Default 'web', no 'lectura'. El endpoint se llama /api/lectura-lead y de
  // ahí venía la suposición, pero lo sirve todo el sitio: landings, briefs y La
  // Lectura. Asumir 'lectura' etiquetó como investigación a 25 leads de
  // formulario. Desde ago-2026 el sitio manda `origen` explícito en los tres
  // flujos; si llega vacío es un emisor sin actualizar, y 'web' lo dice sin
  // afirmar de más.
  const origen = (strA(body?.origen) || 'web').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'web'
  const nota = strA(body?.nota)
  const empresa = strA(body?.empresa) || nombre
  const prodRaw = strA(body?.producto)?.toLowerCase() ?? null
  const producto = prodRaw ? (PRODUCTO_DESDE_SITIO[prodRaw] ?? null) : null
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

  // Qué llegó de verdad, no qué dice `origen`.
  //
  // El sitio ya manda `origen` explícito (landing | brief | lectura), pero la
  // etiqueta se decide igual por el DOSSIER, que es un hecho y no una
  // declaración. Regla del emisor: una Lectura fallida no produce lead —el
  // sitio avisa por correo y no llama a Hilván—, así que la ausencia de dossier
  // significa "esto no fue una Lectura", nunca "la Lectura falló".
  //
  // Se mantiene la comprobación porque el costo de equivocarse es asimétrico:
  // rotular "La Lectura" un formulario de tres líneas hizo que el equipo
  // abriera fichas esperando investigación y encontrara "Plazo: Explorando
  // opciones". Al revés no pasa nada.
  const hayLectura = Boolean(dossier)
  const etiqueta = hayLectura
    ? 'La Lectura'
    : origen === 'lectura' ? 'Sitio' : origen.charAt(0).toUpperCase() + origen.slice(1)

  // La procedencia es UNA LÍNEA. El contenido va aparte.
  //
  // Desde ago-2026 el sitio manda en `nota` el documento completo —una Lectura
  // ronda los 5.000 caracteres y el tope es 14.000—. Concatenarlo acá dejaba el
  // documento incrustado entre "Lead entrante desde el sitio" y "Producto
  // sugerido: lookbook", ilegible y sin poder marcarlo como registro.
  const notas = [
    `[${etiqueta}] Lead entrante desde el sitio.`,
    producto ? `Producto sugerido: ${producto}.` : '',
    url ? `Sitio/IG: ${url}` : '',
  ].filter(Boolean).join(' ').trim()

  // `nota` es el campo del contrato nuevo; `lectura` sobrevive como fallback
  // para emisores no actualizados. Se guarda tal cual: qué es —documento o
  // formulario— lo decide el dossier al aprobar, no el campo por el que llegó.
  const contenido = nota || lectura

  // Cómo llegó. Sin esto nadie puede responder si el lead descargó el paquete
  // de precios o sólo dejó el correo, ni si vino del video de Instagram — que
  // es exactamente lo que el equipo no lograba explicarse.
  const accion  = strA(body?.accion)
  const pagina  = strA(body?.pagina)
  const campana = strA(body?.campana)
  const datosRaw =
    body?.datos && typeof body.datos === 'object' && !Array.isArray(body.datos)
      ? (JSON.stringify(body.datos).length <= 20_000 ? (body.datos as Record<string, unknown>) : null)
      : null

  // El slug original se conserva aunque no calce con ningún producto: es la
  // única pista de en qué landing estaba la persona, y descartarlo es cómo se
  // perdió el dato la primera vez.
  const datos = prodRaw && prodRaw !== producto
    ? { ...(datosRaw ?? {}), producto_slug: prodRaw }
    : datosRaw

  const payload: Record<string, unknown> = { empresa, nombre_contacto: nombre, email, origen, notas }
  if (accion) payload.lead_accion = accion
  if (pagina) payload.lead_pagina = pagina
  if (campana) payload.lead_campana = campana
  if (datos) payload.lead_datos = datos
  if (contenido) payload.contenido = contenido
  if (producto) payload.producto_objetivo = producto
  if (arquetipo) payload.arquetipo = arquetipo
  if (angulo) payload.angulo = angulo
  if (url) payload.url = url
  if (dossier) payload.dossier = dossier

  // Directo al Kanban, no a la Bandeja.
  //
  // La Bandeja es para lo que PROPONE el agente cuando sale a descubrir marcas
  // (Firecrawl + Brave): ahí hay un juicio que revisar —¿esta marca nos sirve?—.
  // Un lead del sitio no tiene nada que juzgar: la persona levantó la mano
  // sola. Hacerlo esperar aprobación agrega un paso que sólo retrasa el
  // contacto, y el reloj de cadencia no empieza a correr hasta que alguien
  // apruebe.
  //
  // Entra sin responsable a propósito: sin `rubro` las reglas de reparto no
  // asignan, y adivinar es peor. Queda marcado en el tablero como sin asignar.
  //
  // Se reutiliza `aplicarEfectoAprobacion` en vez de repetir el alta acá: es la
  // misma operación —crear el prospecto, sus notas y archivar la Lectura— y dos
  // copias divergirían.
  let prospectoId: string
  try {
    const efecto = await aplicarEfectoAprobacion(admin, {
      id: '', tipo: 'prospecto_nuevo', prospecto_id: null, payload, estado: 'pendiente',
    })
    prospectoId = String(efecto?.prospecto_id ?? '')
    if (!prospectoId) throw new Error('No se obtuvo el id del prospecto')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo crear el prospecto'
    await registrarAccion({ herramienta: 'lectura-lead', payload: { email, origen }, ok: false, error: msg })
    return { ok: false, status: 500, error: msg }
  }

  await registrarAccion({
    herramienta: 'lectura-lead',
    payload: { nombre, email, producto, origen, nota_contexto: notaAgente },
    resultado_tabla: 'prospectos',
    resultado_id: prospectoId,
    ok: true,
  })
  return { ok: true, prospecto_id: prospectoId, estado: 'prospecto' }
}
