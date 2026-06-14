#!/usr/bin/env node
// Servidor MCP local de Hilván.
// Expone las operaciones de /api/agent/* como herramientas que un agente
// (Cowork / Claude) puede llamar. NO contiene lógica de negocio: solo reenvía
// a la API HTTP autenticada (que es "la verdad"). Corre localmente.
//
// Config por variables de entorno:
//   HILVAN_API_URL    base de la API (ej: https://app.casahiedra.com  o  http://localhost:3000)
//   HILVAN_AGENT_TOKEN token Bearer del agente (el mismo que HILVAN_AGENT_TOKEN en el server)

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const API = (process.env.HILVAN_API_URL || 'http://localhost:3000').replace(/\/$/, '')
const TOKEN = process.env.HILVAN_AGENT_TOKEN || ''

async function api(method, path, body) {
  const res = await fetch(`${API}/api/agent${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`)
  return data
}

// ── Definición de herramientas (1:1 con la API) ──────────────────────────────
const TOOLS = [
  {
    name: 'hilvan_por_cobrar',
    description: 'Lista las cotizaciones facturadas que aún no han sido pagadas, con días de antigüedad (aging).',
    inputSchema: { type: 'object', properties: {} },
    run: () => api('GET', '/por-cobrar'),
  },
  {
    name: 'hilvan_buscar_cotizacion',
    description: 'Busca cotizaciones por nombre, número (ej. CH-COT-007) o cliente.',
    inputSchema: { type: 'object', properties: { q: { type: 'string', description: 'texto de búsqueda' } }, required: ['q'] },
    run: (a) => api('GET', `/cotizaciones?q=${encodeURIComponent(a.q)}`),
  },
  {
    name: 'hilvan_buscar_colaborador',
    description: 'Busca colaboradores por nombre o RUT.',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    run: (a) => api('GET', `/colaboradores?q=${encodeURIComponent(a.q)}`),
  },
  {
    name: 'hilvan_rendicion_mensual',
    description: 'Obtiene la rendición de costos mensuales de un período (YYYY-MM) con sus gastos.',
    inputSchema: { type: 'object', properties: { periodo: { type: 'string', description: 'YYYY-MM' } }, required: ['periodo'] },
    run: (a) => api('GET', `/rendicion-mensual?periodo=${encodeURIComponent(a.periodo)}`),
  },
  {
    name: 'hilvan_crear_gasto_mensual',
    description: 'Registra un gasto/boleta operacional del mes (no asociado a proyecto). Para boletas de honorarios usa tipo_documento="boleta"; el monto puede darse neto o bruto (monto_es) y se persiste el bruto con su retención. CONFIRMA con el usuario antes de llamar esta herramienta.',
    inputSchema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', description: 'YYYY-MM' },
        descripcion: { type: 'string' },
        categoria: { type: 'string', description: 'Honorarios, Transporte, etc.' },
        tipo_documento: { type: 'string', description: 'boleta | factura | boleta_consumo | exenta | sin_documento' },
        monto: { type: 'number' },
        monto_es: { type: 'string', description: 'neto | bruto' },
        rut_emisor: { type: 'string' },
        razon_social_emisor: { type: 'string' },
        factura_casa_hiedra: { type: 'boolean' },
        archivo_url: { type: 'string' },
        fecha_documento: { type: 'string', description: 'YYYY-MM-DD — fecha real de la boleta/documento (cuadre por mes y retención por año)' },
        folio: { type: 'string', description: 'folio del documento SII (para deduplicar por RUT+folio)' },
      },
      required: ['periodo', 'descripcion', 'categoria', 'tipo_documento', 'monto', 'monto_es'],
    },
    run: (a) => api('POST', '/gasto-mensual', a),
  },
  {
    name: 'hilvan_crear_gasto_proyecto',
    description: 'Registra un gasto/boleta asociado al ítem de una cotización (proyecto). CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        cotizacion_item_id: { type: 'string' },
        rendicion_id: { type: 'string' },
        tipo: { type: 'string' },
        descripcion: { type: 'string' },
        tipo_documento: { type: 'string' },
        monto: { type: 'number' },
        monto_es: { type: 'string', description: 'neto | bruto' },
        rut_emisor: { type: 'string' },
        razon_social_emisor: { type: 'string' },
        archivo_url: { type: 'string' },
        fecha_documento: { type: 'string', description: 'YYYY-MM-DD — fecha real de la boleta/documento (cuadre por mes y retención por año)' },
        folio: { type: 'string', description: 'folio del documento SII (para deduplicar por RUT+folio)' },
      },
      required: ['descripcion', 'tipo_documento', 'monto', 'monto_es'],
    },
    run: (a) => api('POST', '/gasto-proyecto', a),
  },
  {
    name: 'hilvan_registrar_pago',
    description: 'Marca una cotización como pagada (fecha_pago_recibido). Opcionalmente registra la factura emitida. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        cotizacion_id: { type: 'string' },
        fecha_pago_recibido: { type: 'string', description: 'YYYY-MM-DD' },
        fecha_factura_emitida: { type: 'string', description: 'YYYY-MM-DD' },
        numero_factura: { type: 'string' },
      },
      required: ['cotizacion_id', 'fecha_pago_recibido'],
    },
    run: (a) => api('POST', '/pago-recibido', a),
  },
  {
    name: 'hilvan_registrar_factura_emitida',
    description: 'Marca la factura EMITIDA de una cotización (fecha_factura_emitida + número opcional), separado del pago. NO toca la fecha de pago. Útil para registrar las ventas del RCV. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        cotizacion_id: { type: 'string' },
        fecha_factura_emitida: { type: 'string', description: 'YYYY-MM-DD' },
        numero_factura: { type: 'string' },
      },
      required: ['cotizacion_id', 'fecha_factura_emitida'],
    },
    run: (a) => api('POST', '/registrar-factura-emitida', a),
  },
  {
    name: 'hilvan_crear_gastos_bulk',
    description: 'Carga masiva de boletas/facturas (RCV del SII). Recibe un array `gastos` donde cada fila YA viene clasificada con su `origen`: "mensual" (gasto operacional del mes) o "proyecto" (asociado a un cotizacion_item_id). Valida TODAS las filas antes de escribir; si una es inválida no inserta ninguna. Reversible en bloque con hilvan_deshacer. CONFIRMA con el usuario antes de llamar (las filas ya deben venir clasificadas y las dudosas resueltas).',
    inputSchema: {
      type: 'object',
      properties: {
        gastos: {
          type: 'array',
          description: 'filas de gastos ya clasificadas',
          items: {
            type: 'object',
            properties: {
              origen: { type: 'string', description: 'mensual | proyecto' },
              tipo_documento: { type: 'string', description: 'boleta | factura | boleta_consumo | exenta | sin_documento' },
              monto: { type: 'number' },
              monto_es: { type: 'string', description: 'neto | bruto' },
              descripcion: { type: 'string' },
              periodo: { type: 'string', description: 'YYYY-MM (requerido si origen=mensual)' },
              categoria: { type: 'string', description: 'requerido si origen=mensual' },
              cotizacion_item_id: { type: 'string', description: 'UUID del ítem (requerido si origen=proyecto)' },
              tipo: { type: 'string', description: 'tipo de gasto de proyecto' },
              rut_emisor: { type: 'string' },
              razon_social_emisor: { type: 'string' },
              folio: { type: 'string', description: 'folio del documento SII' },
              fecha_documento: { type: 'string', description: 'YYYY-MM-DD' },
              factura_casa_hiedra: { type: 'boolean' },
            },
            required: ['origen', 'tipo_documento', 'monto', 'monto_es', 'descripcion'],
          },
        },
      },
      required: ['gastos'],
    },
    run: (a) => api('POST', '/crear-gastos-bulk', a),
  },
  {
    name: 'hilvan_deshacer',
    description: 'Revierte una escritura previa del agente, usando el accion_id del log de auditoría.',
    inputSchema: { type: 'object', properties: { accion_id: { type: 'string' } }, required: ['accion_id'] },
    run: (a) => api('POST', '/deshacer', a),
  },
  {
    name: 'hilvan_acciones',
    description: 'Lista las últimas acciones que el agente registró (log de auditoría), para revisar o deshacer.',
    inputSchema: { type: 'object', properties: {} },
    run: () => api('GET', '/acciones'),
  },
  {
    name: 'hilvan_buscar_gastos',
    description: 'Busca/lista gastos y boletas (de proyecto y mensuales, en CUALQUIER estado) por texto/RUT, tipo de documento o período. Útil para cruzar qué boletas ya están cargadas.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'texto libre sobre RUT, razón social o descripción' },
        tipo_documento: { type: 'string', description: 'boleta | factura | boleta_consumo | exenta | sin_documento' },
        periodo: { type: 'string', description: 'YYYY-MM' },
        estado: { type: 'string', description: 'estado exacto del gasto' },
      },
    },
    run: (a) => {
      const params = new URLSearchParams()
      if (a.q) params.set('q', a.q)
      if (a.tipo_documento) params.set('tipo_documento', a.tipo_documento)
      if (a.periodo) params.set('periodo', a.periodo)
      if (a.estado) params.set('estado', a.estado)
      const qs = params.toString()
      return api('GET', `/gastos${qs ? `?${qs}` : ''}`)
    },
  },
  {
    name: 'hilvan_items_cotizacion',
    description: 'Lista los ítems (con sus IDs) de una cotización por número (ej. CH-COT-005) o id. Necesario para cargar un gasto de proyecto, que requiere cotizacion_item_id.',
    inputSchema: {
      type: 'object',
      properties: {
        numero: { type: 'string', description: 'número del grupo, ej. CH-COT-005' },
        cotizacion_id: { type: 'string', description: 'UUID de la cotización' },
      },
    },
    run: (a) => {
      const params = new URLSearchParams()
      if (a.numero) params.set('numero', a.numero)
      if (a.cotizacion_id) params.set('cotizacion_id', a.cotizacion_id)
      const qs = params.toString()
      return api('GET', `/cotizacion-items${qs ? `?${qs}` : ''}`)
    },
  },
  {
    name: 'hilvan_listar_rodajes',
    description: 'Lista/busca rodajes por nombre, estado o número de cotización. Devuelve id, nombre, fecha, estado y número de la cotización asociada.',
    inputSchema: { type: 'object', properties: { q: { type: 'string', description: 'texto de búsqueda' } } },
    run: (a) => api('GET', `/rodajes${a.q ? `?q=${encodeURIComponent(a.q)}` : ''}`),
  },
  {
    name: 'hilvan_rodaje',
    description: 'Detalle de un rodaje: metadata, departamentos, equipo, bloques (con hora calculada) y nº de citaciones. Útil para inspeccionar un borrador sembrado.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'UUID del rodaje' } }, required: ['id'] },
    run: (a) => api('GET', `/rodaje?id=${encodeURIComponent(a.id)}`),
  },
  {
    name: 'hilvan_sembrar_rodaje',
    description: 'Crea un BORRADOR de rodaje desde una cotización: metadata (proyecto, cotización) + departamentos + equipo (roles) + un plan esqueleto de bloques (CALL, PRE SET, ALMUERZO, DESMONTAJE, CIERRE). Es un punto de partida que el humano refina. NO envía nada. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        cotizacion_id: { type: 'string', description: 'UUID de la cotización aprobada' },
        nombre: { type: 'string', description: 'nombre del rodaje; por defecto el de la cotización' },
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['cotizacion_id'],
    },
    run: (a) => api('POST', '/sembrar-rodaje', a),
  },
  {
    name: 'hilvan_generar_citaciones',
    description: 'Crea los links de citación (token único) para cada persona del equipo de un rodaje que aún no tenga citación. NO envía email ni WhatsApp: el envío lo hace siempre un humano desde la app. CONFIRMA con el usuario antes de llamar.',
    inputSchema: { type: 'object', properties: { rodaje_id: { type: 'string', description: 'UUID del rodaje' } }, required: ['rodaje_id'] },
    run: (a) => api('POST', '/generar-citaciones', a),
  },
  {
    name: 'hilvan_set_fecha_documento',
    description: 'Edita la fecha real del documento (fecha_documento) de un gasto ya cargado. Obtén gasto_id y origen con hilvan_buscar_gastos. Reversible con hilvan_deshacer (restaura la fecha anterior, no borra el gasto). CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        gasto_id: { type: 'string' },
        origen: { type: 'string', description: 'proyecto | mensual' },
        fecha_documento: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['gasto_id', 'origen', 'fecha_documento'],
    },
    run: (a) => api('POST', '/gasto-fecha', a),
  },
]

const server = new Server({ name: 'hilvan-mcp', version: '0.1.0' }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name)
  if (!tool) throw new Error(`Herramienta desconocida: ${req.params.name}`)
  try {
    const result = await tool.run(req.params.arguments ?? {})
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('hilvan-mcp listo (stdio). API:', API)
