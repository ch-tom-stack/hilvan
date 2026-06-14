import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { resolverPerfilAgente } from '@/lib/agent-perfil'

export const runtime = 'nodejs'

// POST /api/agent/cliente (JSON)
// Crea un cliente con los campos reales de la tabla `clientes` (igual que la UI).
// created_by se atribuye a un perfil real (admin preferido) para paridad.
// Reversible con hilvan_deshacer (herramienta 'crear-cliente' → borra la fila).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre) {
    return NextResponse.json({ error: 'Falta "nombre" del cliente' }, { status: 400 })
  }

  // Normalizar el resto (string vacío → null), como en la UI.
  const str = (v: unknown): string | null => {
    if (v === undefined || v === null) return null
    const s = String(v).trim()
    return s === '' ? null : s
  }

  const admin = createAdminClient()

  const perfil = await resolverPerfilAgente(admin)
  if (!perfil.ok) {
    return NextResponse.json({ error: perfil.error }, { status: 400 })
  }

  const { data, error } = await admin
    .from('clientes')
    .insert({
      nombre,
      empresa: str(body.empresa),
      email: str(body.email),
      telefono: str(body.telefono),
      rut: str(body.rut),
      direccion: str(body.direccion),
      ciudad: str(body.ciudad),
      pais: str(body.pais),
      notas: str(body.notas),
      created_by: perfil.id,
    })
    .select('id, nombre')
    .single()

  if (error || !data) {
    await registrarAccion({
      herramienta: 'crear-cliente',
      payload: body,
      ok: false,
      error: error?.message ?? 'No se pudo crear el cliente',
    })
    return NextResponse.json(
      { error: error?.message ?? 'No se pudo crear el cliente' },
      { status: 500 },
    )
  }

  await registrarAccion({
    herramienta: 'crear-cliente',
    payload: { nombre },
    resultado_tabla: 'clientes',
    resultado_id: data.id,
    ok: true,
  })

  return NextResponse.json({ id: data.id, nombre: data.nombre })
}
