import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/cliente-editar (JSON)  { cliente_id, rut?, nombre?, empresa?, email?, telefono?, direccion?, ciudad?, pais?, notas? }
// Edita los datos de un cliente existente (típico: cargarle el RUT). Solo se
// tocan los campos presentes en el body. Reversible con hilvan_deshacer
// (herramienta 'editar-cliente' → restaura los valores previos, no borra la fila).
const EDITABLES = ['nombre', 'empresa', 'email', 'telefono', 'rut', 'direccion', 'ciudad', 'pais', 'notas'] as const

export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const clienteId = typeof body?.cliente_id === 'string' ? body.cliente_id.trim() : ''
  if (!clienteId) return NextResponse.json({ error: 'Falta "cliente_id"' }, { status: 400 })

  const str = (v: unknown): string | null => {
    if (v === undefined || v === null) return null
    const s = String(v).trim()
    return s === '' ? null : s
  }

  const admin = createAdminClient()
  const { data: actual, error: e0 } = await admin
    .from('clientes')
    .select('id, nombre, empresa, email, telefono, rut, direccion, ciudad, pais, notas')
    .eq('id', clienteId)
    .maybeSingle()
  if (e0) return NextResponse.json({ error: e0.message }, { status: 500 })
  if (!actual) return NextResponse.json({ error: 'cliente_id no encontrado' }, { status: 404 })

  // Solo los campos presentes en el body cambian; guardamos su valor previo.
  const cambios: Record<string, string | null> = {}
  const previo: Record<string, string | null> = {}
  for (const k of EDITABLES) {
    if (!(k in body)) continue
    const nuevo = str(body[k])
    if (k === 'nombre' && !nuevo) continue // no dejar al cliente sin nombre
    if (nuevo === ((actual as any)[k] ?? null)) continue // sin cambio real
    cambios[k] = nuevo
    previo[k] = (actual as any)[k] ?? null
  }
  if (!Object.keys(cambios).length) {
    return NextResponse.json({ ok: true, sin_cambios: true, cliente: actual })
  }

  const { data, error } = await admin
    .from('clientes')
    .update(cambios)
    .eq('id', clienteId)
    .select('id, nombre, rut, empresa, email')
    .single()
  if (error || !data) {
    await registrarAccion({ herramienta: 'editar-cliente', payload: body, ok: false, error: error?.message })
    return NextResponse.json({ error: error?.message ?? 'No se pudo editar el cliente' }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'editar-cliente',
    payload: { previo, cambios },
    resultado_tabla: 'clientes',
    resultado_id: clienteId,
    ok: true,
  })
  return NextResponse.json({ ok: true, cliente: data, cambiados: Object.keys(cambios) })
}
