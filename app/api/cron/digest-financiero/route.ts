/**
 * digest.route.draft.ts
 * GET /api/cron/digest-financiero  (propuesta — NO incorporado a producción)
 *
 * Cron job: llama a /api/agent/estado-financiero y envía el resumen por email
 * al destinatario configurado. Protegido por CRON_SECRET (igual que sync-gcal).
 *
 * Para activarlo en Vercel (ver INCORPORACION.md):
 *   vercel.json → { "crons": [{ "path": "/api/cron/digest-financiero", "schedule": "0 9 1 * *" }] }
 *
 * Dependencias reutilizadas (sin modificar):
 *   - lib/email.ts          → sendEmail (nodemailer SMTP)
 *   - lib/agent-auth.ts     → HILVAN_AGENT_TOKEN (para llamar a /api/agent/estado-financiero)
 *   - ./logica.ts           → construirHtmlDigest, construirAsuntoDigest
 *
 * Variables de entorno requeridas:
 *   CRON_SECRET              → Bearer token del cron (Vercel lo envía automáticamente)
 *   HILVAN_AGENT_TOKEN       → para autenticar la llamada interna a /api/agent/
 *   NEXT_PUBLIC_APP_URL      → base URL de la app (para construir la URL interna)
 *   GMAIL_USER               → emisor del correo (natalia@casahiedra.com)
 *   GMAIL_APP_PASSWORD       → contraseña de aplicación Gmail
 *   DIGEST_DESTINATARIO      → email destino (ej. tomas@casahiedra.com). Nuevo env var.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { construirHtmlDigest, construirAsuntoDigest, type ResumenDigest } from '@/lib/agent-correo-ingesta'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  // ── Autenticación CRON_SECRET (mismo patrón que sync-gcal) ────────────────
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // ── Validar env vars necesarias ───────────────────────────────────────────
  const agentToken = process.env.HILVAN_AGENT_TOKEN
  if (!agentToken) {
    return NextResponse.json({ ok: false, error: 'HILVAN_AGENT_TOKEN no configurado' }, { status: 500 })
  }
  const destinatario = process.env.DIGEST_DESTINATARIO
  if (!destinatario) {
    return NextResponse.json({ ok: false, error: 'DIGEST_DESTINATARIO no configurado' }, { status: 500 })
  }
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

  // ── Determinar período: mes anterior (el digest va el día 1 del mes nuevo) ─
  const ahora = new Date()
  const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
  const periodo = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`

  // ── Llamar a /api/agent/estado-financiero ─────────────────────────────────
  let estadoData: ResumenDigest
  try {
    const res = await fetch(`${appUrl}/api/agent/estado-financiero?periodo=${periodo}`, {
      headers: {
        Authorization: `Bearer ${agentToken}`,
      },
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { ok: false, error: `estado-financiero devolvió ${res.status}: ${text}` },
        { status: 500 },
      )
    }
    estadoData = await res.json() as ResumenDigest
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: `fetch estado-financiero: ${msg}` }, { status: 500 })
  }

  // ── Construir email ────────────────────────────────────────────────────────
  const asunto = construirAsuntoDigest(periodo, estadoData.alertas ?? [])
  const html   = construirHtmlDigest(estadoData)

  // ── Enviar email (fallo no aborta el cron, pero se registra y responde) ───
  try {
    await sendEmail({
      to: destinatario,
      subject: asunto,
      html,
      contexto: `digest-financiero:${periodo}`,
    })
  } catch (err: unknown) {
    // El fallo de email queda en email_log (sendEmail ya lo registra).
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[digest-financiero] Error al enviar email:', msg)
    return NextResponse.json({
      ok: false,
      error: `Email no enviado: ${msg}`,
      periodo,
      alertas: estadoData.alertas?.length ?? 0,
      recomendaciones: estadoData.recomendaciones?.length ?? 0,
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    periodo,
    destinatario,
    asunto,
    alertas: estadoData.alertas?.length ?? 0,
    recomendaciones: estadoData.recomendaciones?.length ?? 0,
    resumen: estadoData.resumen,
  })
}
