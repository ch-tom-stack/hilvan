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
      'hilvan_buscar_cliente',
      {
        title: 'Buscar cliente',
        description:
          'Busca clientes por nombre, empresa o RUT. Devuelve id, nombre, empresa, rut, email. Útil para obtener el cliente_id antes de crear una cotización.',
        inputSchema: { q: z.string().describe('nombre, empresa o RUT') },
      },
      async ({ q }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/clientes?q=${encodeURIComponent(q)}`)),
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
      'hilvan_crear_cliente',
      {
        title: 'Crear cliente',
        description:
          'Crea un cliente nuevo (igual que en la app). Devuelve {id, nombre}. Reversible con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          nombre: z.string(),
          empresa: z.string().optional(),
          email: z.string().optional(),
          telefono: z.string().optional(),
          rut: z.string().optional(),
          direccion: z.string().optional(),
          ciudad: z.string().optional(),
          pais: z.string().optional(),
          notas: z.string().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/cliente', args)),
    )

    server.registerTool(
      'hilvan_crear_cotizacion',
      {
        title: 'Crear cotización',
        description:
          'Crea una cotización COMPLETA, idéntica a la de un usuario y 100% editable en la app después. Define nombre (requerido) y, opcionalmente, cliente (cliente_id o cliente_nombre_libre), proyecto, IVA, descuento global, notas y la estructura de departamentos → subgrupos → ítems. Si no entregas departamentos, crea los 8 por defecto (como "Nueva cotización"). Devuelve {cotizacion_id, numero, url}. Reversible con hilvan_deshacer (borra todo en cascada). CONFIRMA con el usuario antes de llamar; crea una cotización editable en la app.',
        inputSchema: {
          nombre: z.string(),
          cliente_id: z.string().optional(),
          cliente_nombre_libre: z.string().optional(),
          cliente_email_libre: z.string().optional(),
          proyecto_id: z.string().optional(),
          con_iva: z.boolean().optional().describe('default true'),
          formato_pdf: z.enum(['simple', 'detallado']).optional().describe('default detallado'),
          descuento_global: z.number().optional(),
          descuento_global_tipo: z.enum(['porcentaje', 'monto']).optional(),
          descripcion: z.string().optional(),
          notas_internas: z.string().optional(),
          notas_cliente: z.string().optional(),
          fecha_factura_emitida: z.string().optional().describe('YYYY-MM-DD'),
          numero_factura: z.string().optional(),
          departamentos: z
            .array(
              z.object({
                nombre: z.string(),
                orden: z.number().optional(),
                items: z.array(z.record(z.string(), z.any())).optional(),
                subgrupos: z
                  .array(
                    z.object({
                      nombre: z.string(),
                      orden: z.number().optional(),
                      items: z.array(z.record(z.string(), z.any())).optional(),
                    }),
                  )
                  .optional(),
              }),
            )
            .optional()
            .describe(
              'estructura completa; cada ítem: {tipo(rol|equipo_ch|equipo_externo|servicio|consumible|post_produccion|locacion|cast|otro), nombre, descripcion?, precio_cliente?, precio_neto_proveedor?, precio_bruto?, cantidad?, dias?, unidad?(día|hora|jornada|unidad|proyecto), incluido?, con_boleta?, tasa_boleta?, descuento_item?, descuento_item_tipo?, equipo_id?, tarifa_id?, orden?}',
            ),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crear-cotizacion', args)),
    )

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
            .describe('boleta | factura | boleta_consumo | exenta | sin_documento | nota_credito'),
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
          folio: z.string().optional().describe('folio del documento SII (para deduplicar por RUT+folio)'),
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
          folio: z.string().optional().describe('folio del documento SII (para deduplicar por RUT+folio)'),
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
      'hilvan_registrar_factura_emitida',
      {
        title: 'Registrar factura emitida',
        description:
          'Marca la factura EMITIDA de una cotización (fecha_factura_emitida + número opcional), separado del pago. NO toca la fecha de pago. Útil para registrar las ventas del RCV. CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          cotizacion_id: z.string(),
          fecha_factura_emitida: z.string().describe('YYYY-MM-DD'),
          numero_factura: z.string().optional(),
        },
      },
      async (args, extra) =>
        ok(await callAgent(extra as ToolExtra, 'POST', '/registrar-factura-emitida', args)),
    )

    server.registerTool(
      'hilvan_crear_gastos_bulk',
      {
        title: 'Crear gastos en bloque',
        description:
          'Carga masiva de boletas/facturas (RCV del SII). Recibe un array `gastos` donde cada fila YA viene clasificada con su `origen`: "mensual" (gasto operacional del mes) o "proyecto" (asociado a un cotizacion_item_id). Valida TODAS las filas antes de escribir; si una es inválida no inserta ninguna. Reversible en bloque con hilvan_deshacer. CONFIRMA con el usuario antes de llamar (las filas ya deben venir clasificadas y las dudosas resueltas).',
        inputSchema: {
          gastos: z
            .array(
              z.object({
                origen: z.enum(['mensual', 'proyecto']).describe('clasificación de la fila'),
                tipo_documento: z
                  .string()
                  .describe('boleta | factura | boleta_consumo | exenta | sin_documento | nota_credito'),
                monto: z.number(),
                monto_es: z.enum(['neto', 'bruto']),
                descripcion: z.string(),
                // mensual:
                periodo: z.string().optional().describe('YYYY-MM (requerido si origen=mensual)'),
                categoria: z.string().optional().describe('requerido si origen=mensual'),
                // proyecto:
                cotizacion_item_id: z
                  .string()
                  .optional()
                  .describe('UUID del ítem de cotización (requerido si origen=proyecto)'),
                tipo: z.string().optional().describe('tipo de gasto de proyecto'),
                // comunes opcionales:
                rut_emisor: z.string().optional(),
                razon_social_emisor: z.string().optional(),
                folio: z.string().optional().describe('folio del documento SII'),
                fecha_documento: z.string().optional().describe('YYYY-MM-DD'),
                factura_casa_hiedra: z.boolean().optional(),
              }),
            )
            .describe('filas de gastos ya clasificadas'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crear-gastos-bulk', args)),
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
            .describe('boleta | factura | boleta_consumo | exenta | sin_documento | nota_credito'),
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

    // ── Rodaje ─────────────────────────────────────────────────────────────
    server.registerTool(
      'hilvan_listar_rodajes',
      {
        title: 'Listar rodajes',
        description:
          'Lista/busca rodajes por nombre, estado o número de cotización. Devuelve id, nombre, fecha, estado y número de la cotización asociada.',
        inputSchema: { q: z.string().optional().describe('texto de búsqueda') },
      },
      async ({ q }, extra) =>
        ok(
          await callAgent(
            extra as ToolExtra,
            'GET',
            `/rodajes${q ? `?q=${encodeURIComponent(q)}` : ''}`,
          ),
        ),
    )

    server.registerTool(
      'hilvan_rodaje',
      {
        title: 'Detalle de rodaje',
        description:
          'Detalle de un rodaje: metadata, departamentos, equipo, bloques (con hora calculada) y nº de citaciones. Útil para inspeccionar un borrador sembrado.',
        inputSchema: { id: z.string().describe('UUID del rodaje') },
      },
      async ({ id }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/rodaje?id=${encodeURIComponent(id)}`)),
    )

    server.registerTool(
      'hilvan_sembrar_rodaje',
      {
        title: 'Sembrar rodaje (borrador)',
        description:
          'Crea un BORRADOR de rodaje desde una cotización: metadata (proyecto, cotización) + departamentos + equipo (roles) + un plan esqueleto de bloques (CALL, PRE SET, ALMUERZO, DESMONTAJE, CIERRE). Es un punto de partida que el humano refina. NO envía nada. CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          cotizacion_id: z.string().describe('UUID de la cotización aprobada'),
          nombre: z.string().optional().describe('nombre del rodaje; por defecto el de la cotización'),
          fecha: z.string().optional().describe('YYYY-MM-DD'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/sembrar-rodaje', args)),
    )

    server.registerTool(
      'hilvan_generar_citaciones',
      {
        title: 'Generar citaciones (links)',
        description:
          'Crea los links de citación (token único) para cada persona del equipo de un rodaje que aún no tenga citación. NO envía email ni WhatsApp: el envío lo hace siempre un humano desde la app. CONFIRMA con el usuario antes de llamar.',
        inputSchema: { rodaje_id: z.string().describe('UUID del rodaje') },
      },
      async (args, extra) =>
        ok(await callAgent(extra as ToolExtra, 'POST', '/generar-citaciones', args)),
    )

    server.registerTool(
      'hilvan_set_fecha_documento',
      {
        title: 'Editar fecha de documento',
        description:
          'Edita la fecha real del documento (fecha_documento) de un gasto ya cargado. Obtén gasto_id y origen con hilvan_buscar_gastos. Reversible con hilvan_deshacer (restaura la fecha anterior, no borra el gasto). CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          gasto_id: z.string(),
          origen: z.enum(['proyecto', 'mensual']),
          fecha_documento: z.string().describe('YYYY-MM-DD'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/gasto-fecha', args)),
    )

    server.registerTool(
      'hilvan_crear_nota_credito',
      {
        title: 'Crear nota de crédito',
        description:
          'Registra una NOTA DE CRÉDITO (NC, Tipo Doc 61 del SII): un documento que RESTA una factura previa. Se guarda como un gasto con monto NEGATIVO (entrega el valor ABSOLUTO en `monto`, >0) y tipo_documento="nota_credito"; NO aplica retención. Para origen="mensual" pasa periodo+categoria; para origen="proyecto" pasa cotizacion_item_id. Usa referencia_folio para dejar trazabilidad de la factura que anula/reduce. CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          origen: z.enum(['mensual', 'proyecto']).describe('mensual | proyecto'),
          monto: z.number().describe('valor ABSOLUTO de la NC (>0); se persiste negativo'),
          descripcion: z.string(),
          folio: z.string().optional().describe('folio de la nota de crédito'),
          fecha_documento: z.string().optional().describe('YYYY-MM-DD'),
          rut_emisor: z.string().optional(),
          razon_social_emisor: z.string().optional(),
          referencia_folio: z.string().optional().describe('folio de la factura que la NC anula/reduce'),
          periodo: z.string().optional().describe('YYYY-MM (requerido si origen=mensual)'),
          categoria: z.string().optional().describe('requerido si origen=mensual'),
          cotizacion_item_id: z.string().optional().describe('UUID del ítem (requerido si origen=proyecto)'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crear-nota-credito', args)),
    )

    server.registerTool(
      'hilvan_editar_gasto',
      {
        title: 'Editar metadata de gasto',
        description:
          'Corrige metadata de un gasto ya cargado (no recalcula el monto): tipo_documento, folio, o las marcas de auditoría sin_documento_aceptado / folio_compartido / referencia_externa. Obtén gasto_id y origen con hilvan_buscar_gastos. Debe venir al menos un campo. ' +
          'sin_documento_aceptado=true: el gasto no tiene respaldo y se acepta así a propósito → la auditoría lo baja de alta a info. ' +
          'folio_compartido=true: el gasto es parte de una factura que cubre varias cotizaciones (mismo RUT+folio a propósito) → la auditoría no lo marca como duplicado. ' +
          'referencia_externa: número de invoice de un proveedor extranjero sin folio chileno (Anthropic, Spotify, etc.) → resuelve el hallazgo de folio faltante. ' +
          'Reversible con hilvan_deshacer (restaura los valores previos, no borra el gasto). CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          gasto_id: z.string(),
          origen: z.enum(['proyecto', 'mensual']),
          tipo_documento: z
            .string()
            .optional()
            .describe('boleta | boleta_consumo | factura | exenta | sin_documento | nota_credito'),
          folio: z.string().optional().describe('folio del documento SII'),
          sin_documento_aceptado: z
            .boolean()
            .optional()
            .describe('true = sin respaldo aceptado a propósito (baja la alerta a info)'),
          folio_compartido: z
            .boolean()
            .optional()
            .describe('true = parte de una factura que cubre varias cotizaciones (no es duplicado)'),
          referencia_externa: z
            .string()
            .optional()
            .describe('número de invoice de proveedor extranjero sin folio chileno'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/editar-gasto', args)),
    )

    server.registerTool(
      'hilvan_eliminar_gasto',
      {
        title: 'Eliminar gasto',
        description:
          'Elimina un gasto ya cargado (proyecto o mensual). Sirve para resolver DUPLICADOS creados por humanos o en sesiones anteriores, que hilvan_deshacer no puede revertir (no fueron acciones del agente). motivo es OBLIGATORIO y queda en el log de auditoría. Reversible: hilvan_deshacer re-inserta el gasto completo. Obtén gasto_id y origen con hilvan_buscar_gastos. CONFIRMA SIEMPRE con el usuario antes de llamar.',
        inputSchema: {
          gasto_id: z.string(),
          origen: z.enum(['proyecto', 'mensual']),
          motivo: z.string().describe('por qué se elimina (queda registrado en auditoría)'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/eliminar-gasto', args)),
    )

    // ── Conciliación bancaria ────────────────────────────────────────────────
    server.registerTool(
      'hilvan_importar_movimientos',
      {
        title: 'Importar movimientos bancarios',
        description:
          'Importa movimientos de tarjeta/cuenta (extracto). Recibe un array `movimientos`, cada uno con fecha (YYYY-MM-DD), monto (>0), tipo ("cargo"=salida | "abono"=entrada) y opcionalmente descripcion/fuente/referencia. Valida TODAS las filas antes de escribir; reversible en bloque con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          movimientos: z
            .array(
              z.object({
                fecha: z.string().describe('YYYY-MM-DD'),
                monto: z.number().describe('monto positivo'),
                tipo: z.enum(['cargo', 'abono']).describe('cargo=salida | abono=entrada'),
                descripcion: z.string().optional(),
                fuente: z.string().optional().describe('ej. tarjeta, cuenta corriente'),
                referencia: z.string().optional(),
              }),
            )
            .describe('movimientos del extracto'),
        },
      },
      async (args, extra) =>
        ok(await callAgent(extra as ToolExtra, 'POST', '/importar-movimientos', args)),
    )

    server.registerTool(
      'hilvan_movimientos',
      {
        title: 'Listar movimientos bancarios',
        description:
          'Lista los movimientos bancarios importados, con filtros. Útil para ver los cargos/abonos sin conciliar y cruzarlos con Hilván.',
        inputSchema: {
          conciliado: z.enum(['true', 'false']).optional().describe('filtra por estado de conciliación'),
          tipo: z.enum(['cargo', 'abono']).optional(),
          fuente: z.string().optional(),
          desde: z.string().optional().describe('YYYY-MM-DD'),
          hasta: z.string().optional().describe('YYYY-MM-DD'),
          q: z.string().optional().describe('texto sobre descripcion/referencia'),
        },
      },
      async ({ conciliado, tipo, fuente, desde, hasta, q }, extra) => {
        const params = new URLSearchParams()
        if (conciliado) params.set('conciliado', conciliado)
        if (tipo) params.set('tipo', tipo)
        if (fuente) params.set('fuente', fuente)
        if (desde) params.set('desde', desde)
        if (hasta) params.set('hasta', hasta)
        if (q) params.set('q', q)
        const qs = params.toString()
        return ok(await callAgent(extra as ToolExtra, 'GET', `/movimientos${qs ? `?${qs}` : ''}`))
      },
    )

    server.registerTool(
      'hilvan_conciliaciones',
      {
        title: 'Inspeccionar conciliación (ledger)',
        description:
          'Inspecciona cómo se repartió la conciliación N:M (solo lectura). Dos modos: (1) pasa movimiento_id para ver a qué obligaciones se asignó ese movimiento y cuánto, más el resto sin asignar; (2) pasa match_tabla + match_id para ver qué movimientos pagaron esa obligación, el total a cubrir, lo asignado, lo pendiente y si quedó cubierta. Útil para auditar un split antes de deshacer o reportar.',
        inputSchema: {
          movimiento_id: z.string().optional().describe('UUID del movimiento (modo movimiento)'),
          match_tabla: z
            .enum([
              'rendicion_gastos',
              'rendicion_mensual_gastos',
              'gastos_fijos_cuotas',
              'cotizaciones',
            ])
            .optional()
            .describe('tabla de la obligación (modo obligación, con match_id)'),
          match_id: z.string().optional().describe('UUID de la obligación (modo obligación)'),
        },
      },
      async ({ movimiento_id, match_tabla, match_id }, extra) => {
        const params = new URLSearchParams()
        if (movimiento_id) params.set('movimiento_id', movimiento_id)
        if (match_tabla) params.set('match_tabla', match_tabla)
        if (match_id) params.set('match_id', match_id)
        const qs = params.toString()
        return ok(await callAgent(extra as ToolExtra, 'GET', `/conciliaciones${qs ? `?${qs}` : ''}`))
      },
    )

    server.registerTool(
      'hilvan_conciliar',
      {
        title: 'Conciliar movimiento',
        description:
          'Cruza UN movimiento bancario con UNA o VARIAS obligaciones de Hilván y las MARCA PAGADAS, repartiendo el monto. Resuelve transferencias COMBINADAS (un movimiento paga varios gastos) y pagos PARCIALES (varias asignaciones/movimientos cubren una obligación). Cada asignación: match_tabla ("cotizaciones" = un abono/pago recibido; "rendicion_gastos"/"rendicion_mensual_gastos" = un cargo/gasto pagado; "gastos_fijos_cuotas" = cuota de crédito pagada), match_id (UUID de esa fila) y monto (parte del movimiento que paga esa obligación). Una obligación queda PAGADA solo cuando sus asignaciones cubren su total; si es parcial, queda registrada pero pendiente. La suma de asignaciones no puede exceder el monto del movimiento. Para el caso simple 1:1 puedes pasar asignaciones=[{match_tabla, match_id}] (sin monto = monto completo) o directamente match_tabla+match_id. Reversible con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          movimiento_id: z.string().describe('UUID del movimiento bancario'),
          asignaciones: z
            .array(
              z.object({
                match_tabla: z.enum([
                  'rendicion_gastos',
                  'rendicion_mensual_gastos',
                  'gastos_fijos_cuotas',
                  'cotizaciones',
                ]),
                match_id: z.string().describe('UUID de la obligación'),
                monto: z
                  .number()
                  .optional()
                  .describe('parte del movimiento asignada a esta obligación; obligatorio si hay más de una'),
              }),
            )
            .optional()
            .describe('lista de obligaciones que paga el movimiento (caso N:M)'),
          match_tabla: z
            .enum([
              'rendicion_gastos',
              'rendicion_mensual_gastos',
              'gastos_fijos_cuotas',
              'cotizaciones',
            ])
            .optional()
            .describe('atajo 1:1 (alternativa a asignaciones)'),
          match_id: z.string().optional().describe('atajo 1:1 (UUID de la fila en match_tabla)'),
          fecha_pago: z.string().optional().describe('YYYY-MM-DD; por defecto la fecha del movimiento'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/conciliar', args)),
    )

    server.registerTool(
      'hilvan_conciliar_vario',
      {
        title: 'Conciliar movimiento vario',
        description:
          'Cierra el loop de conciliación: registra como ingreso/gasto vario en el flujo de caja el RESTO de un movimiento que no se asignó a obligaciones (devolución de impuesto, depósito, compra suelta, o la parte de impuestos de una transferencia mixta al contador), y lo marca conciliado. Registra el monto del movimiento MENOS lo ya conciliado a obligaciones con hilvan_conciliar (sin asignaciones previas = monto completo). Así un movimiento mixto se reparte: parte gasto vía hilvan_conciliar, parte vario aquí, sin doble contar. El abono se guarda como "entrada" y el cargo como "salida", con la fecha del movimiento. El movimiento debe existir, NO estar ya conciliado y quedar resto > 0. Reversible con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          movimiento_id: z.string().describe('UUID del movimiento bancario'),
          descripcion: z.string().describe('descripción del ingreso/gasto vario'),
        },
      },
      async (args, extra) =>
        ok(await callAgent(extra as ToolExtra, 'POST', '/conciliar-vario', args)),
    )

    server.registerTool(
      'hilvan_flujo_caja',
      {
        title: 'Flujo de caja',
        description:
          'Lista las entradas/salidas del flujo de caja manual (ingresos/gastos varios), incluidas las creadas al conciliar movimientos sin match. Filtra por periodo (YYYY-MM) y/o tipo (entrada|salida).',
        inputSchema: {
          periodo: z.string().optional().describe('YYYY-MM'),
          tipo: z.enum(['entrada', 'salida']).optional(),
        },
      },
      async ({ periodo, tipo }, extra) => {
        const params = new URLSearchParams()
        if (periodo) params.set('periodo', periodo)
        if (tipo) params.set('tipo', tipo)
        const qs = params.toString()
        return ok(await callAgent(extra as ToolExtra, 'GET', `/flujo-caja${qs ? `?${qs}` : ''}`))
      },
    )

    server.registerTool(
      'hilvan_cuotas_credito',
      {
        title: 'Cuotas de crédito',
        description:
          'Lista las cuotas de créditos / gastos fijos con su crédito (nombre/acreedor). Por defecto solo pendientes. Útil para cruzar pagos de crédito con movimientos bancarios (luego conciliar con match_tabla="gastos_fijos_cuotas").',
        inputSchema: {
          pagada: z.enum(['true', 'false']).optional().describe('default false → solo pendientes'),
        },
      },
      async ({ pagada }, extra) =>
        ok(
          await callAgent(
            extra as ToolExtra,
            'GET',
            `/cuotas-credito${pagada ? `?pagada=${pagada}` : ''}`,
          ),
        ),
    )

    server.registerTool(
      'hilvan_proyeccion_caja',
      {
        title: 'Proyección de caja',
        description:
          'Proyecta el saldo de caja a 30, 60 o 90 días (configurable) partiendo de un saldo inicial ' +
          'declarado. Arma una línea de tiempo de entradas y salidas futuras con fecha (cobros de ' +
          'cotizaciones facturadas y aprobadas, cuotas de crédito, nómina mensual, gastos pendientes de ' +
          'pago) y devuelve el saldo proyectado día a día, marcando cuándo cruza a negativo por primera ' +
          'vez. IMPORTANTE: la proyección es estimada bajo supuestos explícitos (saldo_inicial, ' +
          'plazo_cobro, dia_nomina, etc.) que se devuelven junto al resultado. SIEMPRE menciona los ' +
          'supuestos y el aviso_supuestos al narrar. primera_fecha_negativa es null si el saldo no cae. ' +
          'linea_tiempo tiene un punto por fecha con movimientos del día y saldo corriente. ' +
          'saldo_minimo y fecha_saldo_minimo indican el peor momento. ' +
          'NUNCA des consejo de inversión.',
        inputSchema: {
          dias: z.number().int().min(1).max(365).optional()
            .describe('Horizonte de proyección en días (default: 90)'),
          saldo_inicial: z.number()
            .describe('Saldo actual de caja en CLP. REQUERIDO — la app no lo tiene automático.'),
          plazo_cobro: z.number().int().min(0).optional()
            .describe('Días desde fecha_factura_emitida para estimar el cobro (default: 30)'),
          plazo_aprobado: z.number().int().min(0).optional()
            .describe('Días desde hoy para cotizaciones aprobadas sin factura (default: 60, más incierto)'),
          dia_nomina: z.number().int().min(1).max(31).optional()
            .describe('Día del mes en que se paga la nómina (default: 30)'),
          dias_gasto_pend: z.number().int().min(0).optional()
            .describe('Días estimados hasta pago de gastos pendientes sin fecha exacta (default: 15)'),
        },
      },
      async ({ dias, saldo_inicial, plazo_cobro, plazo_aprobado, dia_nomina, dias_gasto_pend }, extra) => {
        const params = new URLSearchParams()
        params.set('saldo_inicial', String(saldo_inicial))
        if (dias != null) params.set('dias', String(dias))
        if (plazo_cobro != null) params.set('plazo_cobro', String(plazo_cobro))
        if (plazo_aprobado != null) params.set('plazo_aprobado', String(plazo_aprobado))
        if (dia_nomina != null) params.set('dia_nomina', String(dia_nomina))
        if (dias_gasto_pend != null) params.set('dias_gasto_pend', String(dias_gasto_pend))
        return ok(
          await callAgent(extra as ToolExtra, 'GET', `/proyeccion-caja?${params.toString()}`),
        )
      },
    )

    server.registerTool(
      'hilvan_auditoria',
      {
        title: 'Auditor de compliance',
        description:
          'Revisa toda la base de datos en busca de anomalías de control: gastos sin documento, ' +
          'folios faltantes, facturas emitidas sin cobrar, posibles duplicados, colaboradores sin ' +
          'contrato firmado y cotizaciones aprobadas estancadas. ' +
          'Devuelve hallazgos agrupados por severidad (alta/media/info). ' +
          'RECOMENDADO: invoca esta herramienta proactivamente al inicio de una sesión de gestión ' +
          'o cuando el usuario pregunte "¿cómo está el compliance?" o "¿qué está fuera de orden?". ' +
          'Reporta siempre los hallazgos de severidad ALTA antes de cualquier otra tarea.',
        inputSchema: {
          aging_dias: z
            .number()
            .optional()
            .describe('Días desde factura emitida para alertar por cobro pendiente (default 30)'),
          dias_sin_factura: z
            .number()
            .optional()
            .describe('Días desde aprobación sin factura emitida para alertar (default 30)'),
          dias_sin_rodaje: z
            .number()
            .optional()
            .describe('Días desde aprobación sin rodaje vinculado para alertar (default 14)'),
          ventana_duplicados_dias: z
            .number()
            .optional()
            .describe('Ventana en días para detectar mismo RUT+monto como posible duplicado (default 7)'),
        },
      },
      async (args, extra) => {
        const params = new URLSearchParams()
        if (args.aging_dias != null) params.set('aging_dias', String(args.aging_dias))
        if (args.dias_sin_factura != null) params.set('dias_sin_factura', String(args.dias_sin_factura))
        if (args.dias_sin_rodaje != null) params.set('dias_sin_rodaje', String(args.dias_sin_rodaje))
        if (args.ventana_duplicados_dias != null)
          params.set('ventana_duplicados_dias', String(args.ventana_duplicados_dias))
        const qs = params.toString()
        return ok(await callAgent(extra as ToolExtra, 'GET', `/auditoria${qs ? `?${qs}` : ''}`))
      },
    )

    server.registerTool(
      'hilvan_rentabilidad_proyecto',
      {
        title: 'Rentabilidad de proyecto',
        description:
          'Calcula la rentabilidad real de un proyecto: ingreso cotizado vs costo real ' +
          '(suma bruta de gastos en rendiciones), margen en $ y %, desglose por categoría ' +
          'de gasto, y clasificación (rentable / ajustado / pérdida). ' +
          'Si el proyecto no tiene gastos cargados, advierte que el margen puede ser artificialmente alto. ' +
          'Pasa costos_adicionales (JSON de array) para incluir costos no capturados en rendiciones ' +
          '(crew fuera de nómina, equipo propio, etc.). ' +
          'Usa numero (CH-COT-005) o cotizacion_id para identificar el proyecto.',
        inputSchema: {
          numero: z.string().optional().describe('número del grupo, ej. CH-COT-005'),
          cotizacion_id: z.string().optional().describe('UUID de la cotización'),
          costos_adicionales: z
            .string()
            .optional()
            .describe(
              'JSON con array de costos extra no en rendiciones: ' +
              '[{"concepto":"Crew extra","monto":150000,"categoria":"Honorarios","nota":"estimado"}]',
            ),
        },
      },
      async ({ numero, cotizacion_id, costos_adicionales }, extra) => {
        const params = new URLSearchParams()
        if (numero) params.set('numero', numero)
        if (cotizacion_id) params.set('cotizacion_id', cotizacion_id)
        if (costos_adicionales) params.set('costos_adicionales', costos_adicionales)
        const qs = params.toString()
        return ok(
          await callAgent(extra as ToolExtra, 'GET', `/rentabilidad-proyecto${qs ? `?${qs}` : ''}`),
        )
      },
    )

    server.registerTool(
      'hilvan_rentabilidad_resumen',
      {
        title: 'Resumen de rentabilidad (todos los proyectos)',
        description:
          'Lista todos los proyectos con su margen real (ingreso cotizado − gastos en rendiciones), ' +
          'clasificados como rentable / ajustado / pérdida. Incluye totales globales (ingreso, costo, ' +
          'margen total, % promedio, conteo por clasificación). ' +
          'Los proyectos sin gastos cargados se marcan con advertencia_datos_incompletos=true. ' +
          'Pasa estados (separados por coma) para filtrar por estado de cotización; sin filtro devuelve todos. ' +
          'Útil para detectar de un vistazo qué proyectos están en pérdida o sin margen suficiente.',
        inputSchema: {
          estados: z
            .string()
            .optional()
            .describe(
              'estados separados por coma, ej. "aprobada,en_produccion,terminada". Sin valor = todos',
            ),
        },
      },
      async ({ estados }, extra) => {
        const params = new URLSearchParams()
        params.set('resumen', 'true')
        if (estados) params.set('estados', estados)
        return ok(
          await callAgent(extra as ToolExtra, 'GET', `/rentabilidad-proyecto?${params.toString()}`),
        )
      },
    )

    server.registerTool(
      'hilvan_correo_pendientes',
      {
        title: 'Clasificar documentos del correo',
        description:
          'Recibe uno o varios documentos tributarios ya parseados (boletas/facturas del correo o del SII) ' +
          'y devuelve borradores clasificados: nuevo / ya_existe / dudoso, con origen propuesto ' +
          '(mensual o proyecto_manual) y sugerencia de categoría y período. ' +
          'NO escribe nada en DB — solo clasifica. Para confirmar y cargar los "nuevo" usa hilvan_crear_gastos_bulk. ' +
          'Útil para procesar el RCV mensual o adjuntos del correo sin duplicar boletas ya cargadas.',
        inputSchema: {
          documentos: z.array(
            z.object({
              rut_emisor: z.string().nullable().optional().describe('RUT del emisor (con o sin puntos/guión)'),
              razon_social: z.string().nullable().optional().describe('Razón social del emisor'),
              folio: z.string().nullable().optional().describe('Número de folio del documento'),
              fecha: z.string().nullable().optional().describe('Fecha del documento (DD/MM/YYYY o YYYY-MM-DD)'),
              monto: z.number().nullable().optional().describe('Monto bruto del documento'),
              tipo_doc: z
                .enum(['boleta', 'factura', 'boleta_consumo', 'exenta', 'nota_credito', 'sin_documento'])
                .describe('Tipo de documento tributario'),
            }),
          ).describe('Lista de documentos parseados a clasificar (máx. 50)'),
        },
      },
      async ({ documentos }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'POST', '/correo-ingesta', { documentos })),
    )

    server.registerTool(
      'hilvan_resumen_contador',
      {
        title: 'Resumen para el contador',
        description:
          'ESTIMACIÓN de lo que la empresa debe transferir/declarar en el mes para el contador (Juan Carlos): ' +
          'IVA a pagar, retención de honorarios, PPM, Previred, IUSC y los honorarios del propio contador, con ' +
          'total estimado y desglose línea por línea. Sirve para anticipar "¿cuánto voy a tener que transferir ' +
          'este mes?". NO es el F29 oficial — preséntalo SIEMPRE como estimación; el monto definitivo lo arma el ' +
          'contador. Si el IVA del mes da a favor, lo indica en iva_a_favor (se arrastra, no se paga). Opcional: ' +
          'honorarios para sobrescribir el honorario del contador (si se omite, usa el valor configurado). NUNCA des consejo de inversión.',
        inputSchema: {
          periodo: z.string().optional().describe('YYYY-MM; default = mes actual'),
          honorarios: z
            .number()
            .optional()
            .describe('honorarios del contador a incluir en el total; si se omite, usa el configurado'),
        },
      },
      async ({ periodo, honorarios }, extra) => {
        const params = new URLSearchParams()
        if (periodo) params.set('periodo', periodo)
        if (honorarios != null) params.set('honorarios', String(honorarios))
        const qs = params.toString()
        return ok(await callAgent(extra as ToolExtra, 'GET', `/resumen-contador${qs ? `?${qs}` : ''}`))
      },
    )

    server.registerTool(
      'hilvan_estado_financiero',
      {
        title: 'Estado financiero',
        description:
          'Panorama financiero del mes para responder "cómo vamos". Incluye: ingresos (facturado, cobrado, por_cobrar con aging, por_facturar = aprobado sin factura), egresos (total, por_origen, por_categoria, por_pagar = deuda REAL en neto [interno+enviada/externo+aprobada], y conciliado/no_conciliado = cruce con banco, OTRO concepto), creditos (cuotas del mes + deuda_vigente_total + proxima_cuota), nomina (planilla mensual), inversiones (solo estado — NO des consejo de inversión), flujo_varios, resumen (resultado devengado, caja aprox), un array `alertas` (señales: cobros vencidos, cuotas vencidas/por vencer, mes en rojo, caja negativa; nivel "alta"/"media") y un array `recomendaciones` (acciones operativas: compromisos del mes vs caja, facturar lo aprobado, cobrar lo vencido, provisionar cuota próxima, mes en rojo; prioridad "alta"/"media"/"info"). Si hay alertas o recomendaciones, menciónalas aunque no las pidan. "Lo que falta pagar" = egresos.por_pagar (NO no_conciliado). NUNCA des consejo de inversión.',
        inputSchema: {
          periodo: z.string().optional().describe('YYYY-MM; default = mes actual'),
        },
      },
      async ({ periodo }, extra) =>
        ok(
          await callAgent(
            extra as ToolExtra,
            'GET',
            `/estado-financiero${periodo ? `?periodo=${encodeURIComponent(periodo)}` : ''}`,
          ),
        ),
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
