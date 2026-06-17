import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { resolverPerfilAgente } from '@/lib/agent-perfil'
import { aplicarEfectoAprobacion, AplicarError } from '@/lib/crm-aprobaciones'

export const runtime = 'nodejs'

// POST /api/agent/crm/resolver-aprobacion { aprobacion_id, accion: 'aprobado'|'descartado' }
// Resuelve un ítem de la Bandeja. Al aprobar, APLICA el cambio según su tipo:
//   prospecto_nuevo → crea el prospecto
//   cambio_etapa    → mueve la etapa
//   interaccion     → registra la interacción
//   brief_cotizacion / correo_borrador → se marca aprobado; la ejecución externa
//     (derivar a cotización / crear borrador en Gmail) es de fases posteriores.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const id = typeof body?.aprobacion_id === 'string' ? body.aprobacion_id.trim() : ''
  const accion = body?.accion
  if (!id) return NextResponse.json({ error: 'Falta "aprobacion_id"' }, { status: 400 })
  if (accion !== 'aprobado' && accion !== 'descartado') {
    return NextResponse.json({ error: "accion debe ser 'aprobado' o 'descartado'" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: ap } = await admin
    .from('crm_aprobaciones')
    .select('id, tipo, prospecto_id, payload, estado')
    .eq('id', id)
    .maybeSingle()
  if (!ap) return NextResponse.json({ error: 'aprobacion_id no encontrado' }, { status: 404 })
  if (ap.estado !== 'pendiente') return NextResponse.json({ error: `La propuesta ya está ${ap.estado}` }, { status: 409 })

  const perfil = await resolverPerfilAgente(admin)
  const resueltoPor = perfil.ok ? perfil.id : null

  let aplicado: Record<string, unknown> | null = null

  // ── Aplicar el efecto al aprobar (lógica compartida con la UI) ─────────────
  if (accion === 'aprobado') {
    try {
      aplicado = await aplicarEfectoAprobacion(admin, ap)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al aplicar la propuesta'
      return NextResponse.json({ error: msg }, { status: e instanceof AplicarError ? 400 : 500 })
    }
  }

  const { error: upErr } = await admin
    .from('crm_aprobaciones')
    .update({ estado: accion, resuelto_por: resueltoPor, resuelto_at: new Date().toISOString() })
    .eq('id', id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await registrarAccion({ herramienta: 'crm-resolver-aprobacion', payload: body, resultado_tabla: 'crm_aprobaciones', resultado_id: id, ok: true })
  return NextResponse.json({ id, estado: accion, tipo: ap.tipo, aplicado })
}
