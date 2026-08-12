import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { leerReglas, CLAVES_REGLA, type ClaveRegla } from '@/lib/crm-reglas'

export const runtime = 'nodejs'

// GET /api/agent/crm/reglas?doc=correos|cadencia|reparto|misiones
//
// Las reglas del CRM, servidas desde el repo. Solo LECTURA.
//
// El agente de Cowork no tiene el repo montado, así que sin esto habría que
// pegarle las reglas en el prompt — una copia que envejece en cuanto se edita
// un archivo. Mismo patrón que el Repertorio: la fuente de verdad es una sola y
// el agente lee la vigente en cada corrida.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const doc = new URL(req.url).searchParams.get('doc')?.trim().toLowerCase()
  if (doc && !CLAVES_REGLA.includes(doc as ClaveRegla)) {
    return NextResponse.json(
      { error: `doc inválido — usa uno de: ${CLAVES_REGLA.join(', ')}` },
      { status: 400 },
    )
  }

  const { reglas, faltantes } = leerReglas(doc ? [doc as ClaveRegla] : CLAVES_REGLA)

  // Un hueco se declara, no se disimula: si falta un archivo el agente tiene
  // que saberlo para no operar creyendo que esa regla no existe.
  if (reglas.length === 0) {
    return NextResponse.json(
      { error: 'No se pudieron leer las reglas', faltantes },
      { status: 500 },
    )
  }

  return NextResponse.json({
    reglas: reglas.map(r => ({ clave: r.clave, archivo: r.archivo, contenido: r.contenido })),
    ...(faltantes.length > 0 ? { faltantes } : {}),
  })
}
