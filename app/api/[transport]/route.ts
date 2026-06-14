// app/api/[transport]/route.ts
//
// Endpoint MCP remoto de Hilván — sirve en https://app.casahiedra.com/api/mcp
// (conector personalizado por URL + token en Claude / Cowork).
//
// NO contiene lógica de negocio: cada tool reenvía a /api/agent/* (la "verdad"),
// igual que el MCP local de mcp-hilvan/server.mjs. Replica los mismos 9 tools.
//
// Auth: Authorization: Bearer ${HILVAN_AGENT_TOKEN}. withMcpAuth valida el token
// antes de exponer cualquier tool (required:true → 401 si falta/no calza). Si la
// env var no está, el token nunca calza → no-configurado (401).
//
// El segmento dinámico [transport] solo captura /api/mcp y /api/sse: los
// segmentos estáticos hermanos (/api/agent/*, /api/upload, /api/parse-factura,
// etc.) tienen prioridad de routing en Next.js y NO se ven afectados.

import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 60

// Headers del request MCP entrante, expuestos por el SDK en extra.requestInfo.
type ToolExtra = { requestInfo?: { headers?: Record<string, string | string[] | undefined> } }

function headerStr(h: Record<string, string | string[] | undefined> | undefined, key: string): string {
  const v = h?.[key]
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

// Base de la API. En prod usar NEXT_PUBLIC_APP_URL; si está vacío, derivar del
// host del request entrante (mismo origen donde corre el MCP).
function apiBase(extra: ToolExtra): string {
  const env = process.env.NEXT_PUBLIC_APP_URL
  if (env) return env.replace(/\/$/, '')
  const h = extra?.requestInfo?.headers
  const host = headerStr(h, 'host')
  if (host) {
    const proto = headerStr(h, 'x-forwarded-proto') || 'https'
    return `${proto}://${host}`
  }
  return 'http://localhost:3000'
}

// Reenvía a /api/agent/* con el token de servicio.
async function callAgent(
  extra: ToolExtra,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<unknown> {
  const token = process.env.HILVAN_AGENT_TOKEN ?? ''
  const res = await fetch(`${apiBase(extra)}/api/agent${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
    )
  }
  return data
}

function ok(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
}

const baseHandler = createMcpHandler(
  (server) => {
    // ── Lecturas ─────────────────────────────────────────────────────────────
    server.registerTool(
      'hilvan_por_cobrar',
      {
        title: 'Por cobrar',
        description:
          'Lista las cotizaciones facturadas que aún no han sido pagadas, con días de antigüedad (aging).',
        inputSchema: {},
      },
      async (_args, extra) => ok(await callAgent(extra as ToolExtra, 'GET', '/por-cobrar')),
    )

    server.registerTool(
      'hilvan_buscar_cotizacion',
      {
        title: 'Buscar cotización',
        description: 'Busca cotizaciones por nombre, número (ej. CH-COT-007) o cliente.',
        inputSchema: { q: z.string().describe('texto de búsqueda') },
      },
      async ({ q }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/cotizaciones?q=${encodeURIComponent(q)}`)),
    )

    server.registerTool(
      'hilvan_buscar_colaborador',
      {
        title: 'Buscar colaborador',
        description: 'Busca colaboradores por nombre o RUT.',
        inputSchema: { q: z.string().describe('nombre o RUT') },
      },
      async ({ q }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/colaboradores?q=${encodeURIComponent(q)}`)),
    )

    server.registerTool(
      'hilvan_rendicion_mensual',
      {
        title: 'Rendición mensual',
        description:
          'Obtiene la rendición de costos mensuales de un período (YYYY-MM) con sus gastos.',
        inputSchema: { periodo: z.string().describe('YYYY-MM') },
      },
      async ({ periodo }, extra) =>
        ok(
          await callAgent(
            extra as ToolExtra,
            'GET',
            `/rendicion-mensual?periodo=${encodeURIComponent(periodo)}`,
          ),
        ),
    )

    server.registerTool(
      'hilvan_acciones',
      {
        title: 'Acciones del agente',
        description:
          'Lista las últimas acciones que el agente registró (log de auditoría), para revisar o deshacer.',
        inputSchema: {},
      },
      async (_args, extra) => ok(await callAgent(extra as ToolExtra, 'GET', '/acciones')),
    )

    // ── Escrituras ───────────────────────────────────────────────────────────
    server.registerTool(
      'hilvan_crear_gasto_mensual',
      {
        title: 'Crear gasto mensual',
        description:
          'Registra un gasto/boleta operacional del mes (no asociado a proyecto). Para boletas de honorarios usa tipo_documento="boleta"; el monto puede darse neto o bruto (monto_es) y se persiste el bruto con su retención. CONFIRMA con el usuario antes de llamar esta herramienta.',
        inputSchema: {
          periodo: z.string().describe('YYYY-MM'),
          descripcion: z.string(),
          categoria: z.string().describe('Honorarios, Transporte, etc.'),
          tipo_documento: z
            .string()
            .describe('boleta | factura | boleta_consumo | exenta | sin_documento'),
          monto: z.number(),
          monto_es: z.enum(['neto', 'bruto']),
          rut_emisor: z.string().optional(),
          razon_social_emisor: z.string().optional(),
          factura_casa_hiedra: z.boolean().optional(),
          archivo_url: z.string().optional(),
          fecha_documento: z
            .string()
            .optional()
            .describe('YYYY-MM-DD — fecha real de la boleta/documento (para cuadre por mes y retención por año)'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/gasto-mensual', args)),
    )

    server.registerTool(
      'hilvan_crear_gasto_proyecto',
      {
        title: 'Crear gasto de proyecto',
        description:
          'Registra un gasto/boleta asociado al ítem de una cotización (proyecto). CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          cotizacion_item_id: z.string().optional(),
          rendicion_id: z.string().optional(),
          tipo: z.string().optional(),
          descripcion: z.string(),
          tipo_documento: z.string(),
          monto: z.number(),
          monto_es: z.enum(['neto', 'bruto']),
          rut_emisor: z.string().optional(),
          razon_social_emisor: z.string().optional(),
          archivo_url: z.string().optional(),
          fecha_documento: z
            .string()
            .optional()
            .describe('YYYY-MM-DD — fecha real de la boleta/documento (para cuadre por mes y retención por año)'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/gasto-proyecto', args)),
    )

    server.registerTool(
      'hilvan_registrar_pago',
      {
        title: 'Registrar pago',
        description:
          'Marca una cotización como pagada (fecha_pago_recibido). Opcionalmente registra la factura emitida. CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          cotizacion_id: z.string(),
          fecha_pago_recibido: z.string().describe('YYYY-MM-DD'),
          fecha_factura_emitida: z.string().describe('YYYY-MM-DD').optional(),
          numero_factura: z.string().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/pago-recibido', args)),
    )

    server.registerTool(
      'hilvan_buscar_gastos',
      {
        title: 'Buscar gastos',
        description:
          'Busca/lista gastos y boletas (de proyecto y mensuales, en CUALQUIER estado) por texto/RUT, tipo de documento o período. Útil para cruzar qué boletas ya están cargadas.',
        inputSchema: {
          q: z.string().optional().describe('texto libre sobre RUT, razón social o descripción'),
          tipo_documento: z
            .string()
            .optional()
            .describe('boleta | factura | boleta_consumo | exenta | sin_documento'),
          periodo: z.string().optional().describe('YYYY-MM'),
          estado: z.string().optional().describe('estado exacto del gasto'),
        },
      },
      async ({ q, tipo_documento, periodo, estado }, extra) => {
        const params = new URLSearchParams()
        if (q) params.set('q', q)
        if (tipo_documento) params.set('tipo_documento', tipo_documento)
        if (periodo) params.set('periodo', periodo)
        if (estado) params.set('estado', estado)
        const qs = params.toString()
        return ok(await callAgent(extra as ToolExtra, 'GET', `/gastos${qs ? `?${qs}` : ''}`))
      },
    )

    server.registerTool(
      'hilvan_deshacer',
      {
        title: 'Deshacer acción',
        description:
          'Revierte una escritura previa del agente, usando el accion_id del log de auditoría.',
        inputSchema: { accion_id: z.string() },
      },
      async ({ accion_id }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'POST', '/deshacer', { accion_id })),
    )

    server.registerTool(
      'hilvan_items_cotizacion',
      {
        title: 'Ítems de cotización',
        description:
          'Lista los ítems (con sus IDs) de una cotización por número (ej. CH-COT-005) o id. Necesario para cargar un gasto de proyecto, que requiere cotizacion_item_id.',
        inputSchema: {
          numero: z.string().optional().describe('número del grupo, ej. CH-COT-005'),
          cotizacion_id: z.string().optional().describe('UUID de la cotización'),
        },
      },
      async ({ numero, cotizacion_id }, extra) => {
        const params = new URLSearchParams()
        if (numero) params.set('numero', numero)
        if (cotizacion_id) params.set('cotizacion_id', cotizacion_id)
        const qs = params.toString()
        return ok(await callAgent(extra as ToolExtra, 'GET', `/cotizacion-items${qs ? `?${qs}` : ''}`))
      },
    )
  },
  {},
  {
    basePath: '/api', // debe coincidir con la ubicación de [transport]
    maxDuration: 60,
  },
)

// Verificación del token estático del agente (mismo HILVAN_AGENT_TOKEN que
// usa /api/agent/*). Se acepta por header `Authorization: Bearer <token>` O por
// query string `?key=<token>` (o `?token=`). El query permite usarlo como
// "URL con llave" en conectores que no tienen campo para un header (ej. el
// conector personalizado de Claude/Cowork, que solo pide URL y OAuth opcional).
function tokenOk(req: Request): boolean {
  const expected = process.env.HILVAN_AGENT_TOKEN
  if (!expected) return false
  const header = req.headers.get('authorization') ?? ''
  const fromHeader = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const url = new URL(req.url)
  const fromQuery = (url.searchParams.get('key') ?? url.searchParams.get('token') ?? '').trim()
  const provided = fromHeader || fromQuery
  return provided.length > 0 && provided === expected
}

async function handler(req: Request): Promise<Response> {
  if (!tokenOk(req)) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }
  return baseHandler(req)
}

export { handler as GET, handler as POST }
