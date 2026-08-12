import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { strA } from '@/lib/agent-crm'
import { TIPOS_NOTA } from '@/types'

export const runtime = 'nodejs'

// GET  /api/agent/crm/notas?prospecto_id=...   → las notas del prospecto
// POST /api/agent/crm/notas { prospecto_id, cuerpo, tipo?, titulo?, bloqueada? }
//
// Reemplaza al campo único `prospectos.notas`, que ya se usaba como si fueran
// varias: 21 de 34 tenían varios párrafos y 19 llevaban un prefijo puesto a
// mano. Ese campo quedó vacío y sin uso.
//
// `bloqueada: true` guarda la nota como registro: no se puede editar después.
// Úsalo para lo que llegó de afuera o lo que se pactó, no para apuntes.

export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const prospectoId = new URL(req.url).searchParams.get('prospecto_id')?.trim()
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const admin = createAdminClient()
  const [{ data: notas }, { data: lectura }] = await Promise.all([
    admin.from('crm_notas').select('*').eq('prospecto_id', prospectoId).order('created_at', { ascending: false }),
    // El dossier de La Lectura NO es una nota: se sirve aparte para que quede
    // claro que su fuente es otra y que no se edita por acá.
    admin.from('crm_lecturas').select('url, dossier, fecha').eq('prospecto_id', prospectoId)
      .order('fecha', { ascending: false }).limit(1).maybeSingle(),
  ])

  return NextResponse.json({
    prospecto_id: prospectoId,
    total: (notas ?? []).length,
    notas: notas ?? [],
    lectura: lectura ?? null,
  })
}

export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const prospectoId = strA(body?.prospecto_id)
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const cuerpo = strA(body?.cuerpo)
  if (!cuerpo) return NextResponse.json({ error: 'Falta "cuerpo": la nota está vacía' }, { status: 400 })

  const tipo = strA(body?.tipo) ?? 'nota'
  if (!(TIPOS_NOTA as readonly string[]).includes(tipo)) {
    return NextResponse.json({ error: `tipo inválido — usa uno de: ${TIPOS_NOTA.join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existe } = await admin.from('prospectos').select('id').eq('id', prospectoId).maybeSingle()
  if (!existe) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  const { data, error } = await admin
    .from('crm_notas')
    .insert({
      prospecto_id: prospectoId,
      tipo,
      titulo: strA(body?.titulo),
      cuerpo,
      bloqueada: body?.bloqueada === true,
    })
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) {
    await registrarAccion({ herramienta: 'crm-nota', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'crm-nota', payload: body,
    resultado_tabla: 'crm_notas', resultado_id: data?.id ?? null, ok: true,
  })

  return NextResponse.json({ id: data?.id, prospecto_id: prospectoId, tipo, bloqueada: body?.bloqueada === true })
}
