import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { crearCodigoManual, PCT_DEFECTO, DIAS_VIGENCIA } from '@/lib/descuento-codigos'
import { EMAIL_RE } from '@/lib/lead-inbound'
import { emailCodigoDescuento } from '@/lib/descuento-email'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

// POST /api/agent/codigo-crear  { email, nombre?, pct?, dias?, enviar_correo? }
// Emite un código de descuento a mano (trato/persona puntual). Idempotente por
// correo: si ese correo ya tiene uno vigente, devuelve el mismo. enviar_correo=true
// le manda el código por correo (igual que el pop-up). Reversible con hilvan_deshacer.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'Falta "email" válido' }, { status: 400 })
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : null
  const pct = Number.isFinite(body?.pct) && body.pct > 0 && body.pct <= 50 ? Math.round(body.pct) : PCT_DEFECTO
  const dias = Number.isFinite(body?.dias) && body.dias > 0 && body.dias <= 730 ? Math.round(body.dias) : DIAS_VIGENCIA

  const admin = createAdminClient()
  const codigo = await crearCodigoManual(admin, { email, nombre, pct, dias, origen: 'manual' })
  if (!codigo) {
    await registrarAccion({ herramienta: 'crear-codigo', payload: { email }, ok: false, error: 'No se pudo emitir (¿tabla descuento_codigos sin crear?)' })
    return NextResponse.json({ error: 'No se pudo emitir el código. ¿Corriste sql/descuento_codigos.sql?' }, { status: 500 })
  }

  // Correo opcional (no bloqueante).
  if (body?.enviar_correo === true) {
    try {
      const { subject, html } = emailCodigoDescuento({ ...codigo, nombre })
      await sendEmail({ to: email, subject, html, contexto: 'arriendo:codigo_descuento_manual' })
    } catch (e) { console.error('[codigo-crear] correo:', e) }
  }

  // Solo reversible si se creó uno NUEVO (si era idempotente, no borrar el previo).
  await registrarAccion({
    herramienta: 'crear-codigo',
    payload: { codigo: codigo.codigo, nuevo: codigo.nuevo },
    resultado_tabla: 'descuento_codigos',
    ok: true,
  })

  return NextResponse.json({ ok: true, codigo: codigo.codigo, pct: codigo.pct, vence_at: codigo.vence_at, nuevo: codigo.nuevo })
}
