import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { personaSegunReglas, OPERADOR_EMAIL } from '@/lib/crm-asignacion'

export const runtime = 'nodejs'

// POST /api/agent/crm/clasificar { prospecto_id, tamano?, rubro?, tipo_cliente? }
// Fija los ejes de asignación (tamaño + rubro + tipo de cliente). Si el prospecto NO
// tiene responsable, lo asigna EN EL ACTO según las reglas deterministas
// (ver lib/crm-asignacion.ts). NO reasigna si ya tiene dueño. Solo interno,
// no envía nada.
const TAMANOS = ['chica', 'mediana', 'grande']
import { RUBROS_PROSPECTO, TIPOS_CLIENTE } from '@/types'
const strA = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const prospectoId = strA(body?.prospecto_id)
  if (!prospectoId) return NextResponse.json({ error: 'Falta prospecto_id' }, { status: 400 })

  const tamanoIn = strA(body?.tamano)
  const rubroIn = strA(body?.rubro)
  const clienteIn = strA(body?.tipo_cliente)
  const tamano = tamanoIn && TAMANOS.includes(tamanoIn) ? tamanoIn : null
  const rubro = rubroIn && (RUBROS_PROSPECTO as readonly string[]).includes(rubroIn) ? rubroIn : null
  const tipo_cliente = clienteIn && (TIPOS_CLIENTE as readonly string[]).includes(clienteIn) ? clienteIn : null
  if (tamanoIn && !tamano) return NextResponse.json({ error: `tamano inválido (${TAMANOS.join('|')})` }, { status: 400 })
  if (rubroIn && !rubro) return NextResponse.json({ error: `rubro inválido (${RUBROS_PROSPECTO.join('|')})` }, { status: 400 })
  if (clienteIn && !tipo_cliente) return NextResponse.json({ error: `tipo_cliente inválido (${TIPOS_CLIENTE.join('|')})` }, { status: 400 })

  const admin = createAdminClient()
  const { data: p } = await admin
    .from('prospectos')
    .select('responsable_id, producto_objetivo')
    .eq('id', prospectoId)
    .maybeSingle<{ responsable_id: string | null; producto_objetivo: string | null }>()
  if (!p) return NextResponse.json({ error: 'prospecto_id no encontrado' }, { status: 404 })

  const patch: Record<string, unknown> = { tamano, rubro, tipo_cliente }
  let asignado: string | null = null

  if (!p.responsable_id) {
    const persona = personaSegunReglas({ producto: p.producto_objetivo, tamano, rubro, tipo_cliente })
    if (persona) {
      const { data: perfiles } = await admin.from('profiles').select('id, email').in('rol', ['admin', 'productor'])
      const map = new Map<string, string>()
      for (const perfil of (perfiles ?? []) as { id: string; email: string | null }[]) {
        if (perfil.email) map.set(perfil.email.trim().toLowerCase(), perfil.id)
      }
      const rid = map.get(OPERADOR_EMAIL[persona])
      if (rid) { patch.responsable_id = rid; asignado = persona }
    }
  }

  const { error } = await admin.from('prospectos').update(patch).eq('id', prospectoId)
  if (error) {
    await registrarAccion({ herramienta: 'crm-clasificar', payload: body, ok: false, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await registrarAccion({ herramienta: 'crm-clasificar', payload: body, resultado_tabla: 'prospectos', resultado_id: prospectoId, ok: true })
  return NextResponse.json({ prospecto_id: prospectoId, tamano, rubro, tipo_cliente, responsable_asignado: asignado })
}
