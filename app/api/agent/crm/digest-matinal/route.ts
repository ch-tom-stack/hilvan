import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { registrarAccion } from '@/lib/agent-audit'
import { procesarDigestMatinal, proponerEnFrioAgotados, HERRAMIENTA_DIGEST } from '@/app/actions/crm'

export const runtime = 'nodejs'

// GET /api/agent/crm/digest-matinal?dry=true&solo=<email>
// Dispara (o simula) el digest matinal. Sirve para PROBAR: con solo=<email> se
// envía a un único destinatario; con dry=true no envía y devuelve el cálculo.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dry') === 'true'
  const soloEmail = url.searchParams.get('solo') ?? undefined

  // Los agotados se proponen antes, para que no aparezcan en la agenda de nadie.
  const enFrio = await proponerEnFrioAgotados({ dryRun })
  const resultado = await procesarDigestMatinal({ dryRun, soloEmail })

  // Solo un envío COMPLETO deja la marca que apaga el cron de respaldo: una
  // prueba a un solo destinatario no puede dejar al equipo sin su correo.
  if (!dryRun && !soloEmail && resultado.enviados > 0) {
    await registrarAccion({
      herramienta: HERRAMIENTA_DIGEST,
      payload: { enviados: resultado.enviados, hoy: resultado.hoy },
      ok: true,
    })
  }

  return NextResponse.json({ dryRun, enFrio, ...resultado })
}
