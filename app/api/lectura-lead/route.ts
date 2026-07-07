import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA } from '@/lib/agent-crm'

export const runtime = 'nodejs'

// POST /api/lectura-lead
// Webhook PÚBLICO de "La Lectura" (sitio Casa Hiedra). El sitio recibe nombre+email,
// corre Brave + un agente que compila la lectura y deriva un producto, y nos manda
// el lead ya enriquecido. Acá lo dejamos como PROPUESTA (tipo prospecto_nuevo) en la
// Bandeja de Aprobación de Hilván; al aprobarla en /crm/aprobaciones se crea el prospecto.
//
// Auth por token DEDICADO y ACOTADO (LECTURA_WEBHOOK_TOKEN): este endpoint SOLO puede
// dejar propuestas de La Lectura. NO usa HILVAN_AGENT_TOKEN (que abre toda la API de
// agentes) — así el sitio guarda una llave chica, no la maestra.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PRODUCTOS = new Set(['banco', 'lookbook', 'spot'])
const ARQUETIPO_POR_PRODUCTO: Record<string, string> = { banco: 'feed', lookbook: 'temporadas' }

export async function POST(req: Request) {
  // ── Auth dedicada ───────────────────────────────────────────────────────────
  const expected = process.env.LECTURA_WEBHOOK_TOKEN
  if (!expected) return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 })
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token || token !== expected) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const nombre = strA(body?.nombre)
  const email = strA(body?.email)
  if (!nombre || !email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Faltan "nombre" y/o "email" válido' }, { status: 400 })
  }

  // empresa es obligatorio para crear el prospecto; si La Lectura no la trae
  // (solo pide nombre+email), usamos la marca descubierta o el nombre como fallback.
  const empresa = strA(body?.empresa) || nombre
  const prodRaw = strA(body?.producto)?.toLowerCase() ?? null
  const producto = prodRaw && PRODUCTOS.has(prodRaw) ? prodRaw : null
  const arquetipo = producto ? (ARQUETIPO_POR_PRODUCTO[producto] ?? 'sin_definir') : null
  const lectura = strA(body?.lectura)
  const url = strA(body?.url)
  const angulo = strA(body?.angulo)

  const admin = createAdminClient()

  // ── Dedup por email (propuesta pendiente o prospecto ya existente) ───────────
  const [{ data: propPend }, { data: prospExist }] = await Promise.all([
    admin.from('crm_aprobaciones').select('payload').eq('tipo', 'prospecto_nuevo').eq('estado', 'pendiente'),
    admin.from('prospectos').select('id').eq('email', email).limit(1),
  ])
  const yaEnBandeja = (propPend ?? []).some(
    (a: any) => String(a.payload?.email ?? '').toLowerCase() === email.toLowerCase(),
  )
  if (yaEnBandeja || (prospExist && prospExist.length > 0)) {
    await registrarAccion({ herramienta: 'lectura-lead', payload: { email }, ok: true, error: 'duplicado' })
    return NextResponse.json({ ok: true, duplicado: true, mensaje: 'Ya hay un lead con ese email (propuesta o prospecto).' })
  }

  const notas = [
    '[La Lectura] Lead entrante desde el sitio.',
    producto ? `Producto sugerido: ${producto}.` : '',
    url ? `Sitio/IG: ${url}` : '',
    lectura ? `\n\n${lectura}` : '',
  ].filter(Boolean).join(' ').trim()

  const payload: Record<string, unknown> = {
    empresa,
    nombre_contacto: nombre,
    email,
    origen: 'lectura',
    notas,
  }
  if (producto) payload.producto_objetivo = producto
  if (arquetipo) payload.arquetipo = arquetipo
  if (angulo) payload.angulo = angulo

  const { data, error } = await admin
    .from('crm_aprobaciones')
    .insert({
      tipo: 'prospecto_nuevo',
      prospecto_id: null,
      estado: 'pendiente',
      origen: 'agente',
      nota_agente: 'Lead entrante de La Lectura (web). El sitio corrió Brave + agente y derivó el producto.',
      payload,
    })
    .select('id')
    .single<{ id: string }>()

  if (error || !data) {
    await registrarAccion({ herramienta: 'lectura-lead', payload: body, ok: false, error: error?.message })
    return NextResponse.json({ error: error?.message ?? 'No se pudo crear la propuesta' }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'lectura-lead',
    payload: { nombre, email, producto },
    resultado_tabla: 'crm_aprobaciones',
    resultado_id: data.id,
    ok: true,
  })
  return NextResponse.json({ ok: true, propuesta_id: data.id, estado: 'pendiente' })
}
