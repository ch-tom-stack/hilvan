// lib/agent-auth.ts
// Autenticación de la API de agentes (/api/agent/*).
//
// El acceso es por token de servicio (no por sesión de usuario): el agente
// manda `Authorization: Bearer ${HILVAN_AGENT_TOKEN}`. Cada route handler
// llama requireAgentToken() al inicio; si devuelve un Response, debe retornarlo.

import { NextResponse } from 'next/server'

/**
 * Valida el header Authorization contra HILVAN_AGENT_TOKEN.
 *
 * - Si la env var no está configurada → Response 503 (agente no habilitado).
 * - Si el token falta o no calza → Response 401.
 * - Si calza → undefined (el handler continúa).
 */
export function requireAgentToken(req: Request): NextResponse | undefined {
  const expected = process.env.HILVAN_AGENT_TOKEN
  if (!expected) {
    return NextResponse.json({ error: 'Agente no configurado' }, { status: 503 })
  }

  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''

  if (!token || token !== expected) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  return undefined
}
