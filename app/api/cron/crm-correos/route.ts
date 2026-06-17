import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Cron de ingesta de correos (CH-10 F4) — ESTRUCTURA, sin lectura de Gmail.
//
// Decisión §9.1 del brief: leer las 3 casillas requiere acceso de lectura Gmail
// (OAuth/service account) que Hilván HOY no tiene (solo envía vía SMTP).
//   - Camino (a): dar acceso de lectura al cron y detectar leads aquí.
//   - Camino (b) [RECOMENDADO]: la lectura la hace la capa agente (Cowork) y
//     escribe propuestas en la Bandeja vía POST /api/agent/crm/crear?como_propuesta.
//
// Mientras no se defina (a), este endpoint NO lee correos: responde "no
// configurado" y NO está registrado en vercel.json. Si se elige (a), se
// implementa la lectura aquí (gateada por la credencial Gmail).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    skipped: true,
    reason:
      'Ingesta de correos por capa agente (camino b). Cron sin lectura Gmail hasta definir el acceso (decisión §9.1).',
  })
}
