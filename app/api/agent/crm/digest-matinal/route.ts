import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { procesarDigestMatinal } from '@/app/actions/crm'

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

  const resultado = await procesarDigestMatinal({ dryRun, soloEmail })
  return NextResponse.json({ dryRun, ...resultado })
}
