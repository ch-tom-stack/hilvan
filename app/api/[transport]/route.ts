// app/api/[transport]/route.ts
//
// Endpoint MCP remoto de Hilván — sirve en https://app.casahiedra.com/api/mcp
// (conector personalizado por URL + token en Claude / Cowork).
//
// NO contiene lógica de negocio: cada tool reenvía a /api/agent/* (la "verdad").
//
// Este es el ÚNICO servidor MCP de Hilván. Hubo uno local por stdio
// (mcp-hilvan/server.mjs) que se eliminó en ago-2026: nadie lo tenía
// configurado, replicaba estas mismas tools a mano y llevaba siete de retraso,
// así que editarlo se sentía como trabajar y no hacía nada. Si alguna vez se
// necesita stdio de nuevo, que sea un proxy a este endpoint, no una copia.
//
// `npm run smoke:mcp` compara las tools que sirve el endpoint contra las
// registradas acá abajo — sirve para confirmar que un deploy llegó.
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
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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
      'hilvan_editar_cliente',
      {
        title: 'Editar cliente',
        description:
          'Edita datos de un cliente existente (típico: cargarle el RUT para que el auto-match de facturas emitidas suba a confianza alta). Solo cambia los campos que pases. Reversible con hilvan_deshacer (restaura el valor previo). Usa hilvan_buscar_cliente para obtener el cliente_id.',
        inputSchema: {
          cliente_id: z.string().describe('id del cliente a editar'),
          rut: z.string().optional().describe('RUT, ej. 77551028-5'),
          nombre: z.string().optional(),
          empresa: z.string().optional(),
          email: z.string().optional(),
          telefono: z.string().optional(),
          direccion: z.string().optional(),
          ciudad: z.string().optional(),
          pais: z.string().optional(),
          notas: z.string().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/cliente-editar', args)),
    )

    server.registerTool(
      'hilvan_crear_codigo',
      {
        title: 'Crear código de descuento',
        description:
          'Emite un código de descuento para arriendo (tipo CH10-XXXXX) a mano — para un trato o persona puntual. Idempotente por correo: si ese correo ya tiene uno vigente, devuelve el mismo. Se APILA con la promo y el descuento por volumen en el cotizador web. enviar_correo=true le manda el código al correo. pct default 10, dias default 90. Reversible con hilvan_deshacer.',
        inputSchema: {
          email: z.string().describe('correo del cliente'),
          nombre: z.string().optional(),
          pct: z.number().optional().describe('% de descuento (1–50, default 10)'),
          dias: z.number().optional().describe('días de vigencia (default 90)'),
          enviar_correo: z.boolean().optional().describe('si true, le manda el código por correo'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/codigo-crear', args)),
    )

    server.registerTool(
      'hilvan_listar_codigos',
      {
        title: 'Listar códigos de descuento',
        description:
          'Lista los códigos de descuento con su estado (emitido/usado/vencido/anulado), correo y vencimiento. Filtra por estado o correo. Solo lectura.',
        inputSchema: {
          estado: z.enum(['emitido', 'usado', 'vencido', 'anulado', 'todos']).optional(),
          email: z.string().optional().describe('filtrar por correo (parcial)'),
          limite: z.number().optional(),
        },
      },
      async (args, extra) => {
        const qs = new URLSearchParams(
          Object.entries(args as Record<string, unknown>).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]),
        ).toString()
        return ok(await callAgent(extra as ToolExtra, 'GET', `/codigos${qs ? `?${qs}` : ''}`))
      },
    )

    server.registerTool(
      'hilvan_gestionar_codigo',
      {
        title: 'Usar o anular un código',
        description:
          'accion="usar" quema el código (marca usado — hazlo al CONFIRMAR la reserva para que no se reutilice). accion="anular" lo mata. Reversible con hilvan_deshacer.',
        inputSchema: {
          codigo: z.string().describe('ej. CH10-K7M2P'),
          accion: z.enum(['usar', 'anular']),
          cotizacion_id: z.string().optional().describe('cotización que lo usó (solo con accion=usar)'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/codigo-estado', args)),
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
      'hilvan_sii_sync',
      {
        title: 'Traer documentos del SII (RCV + honorarios)',
        description:
          'SOLO LECTURA. Trae del SII (vía API Gateway) las FACTURAS COMPRADAS/RECIBIDAS (RCV compras), las NOTAS DE CRÉDITO recibidas (dte 61, en `notas_credito`) y las BOLETAS DE HONORARIOS RECIBIDAS (`honorarios`) de un período, ya normalizadas, marcando cuáles YA están cargadas (ya_cargado por rut+folio). Además guarda cada documento en sii_documentos (respaldo fiel para el contador). NO escribe gastos. Flujo: 1) llamas esto; 2) clasificas las filas NUEVAS de `compras` y `honorarios` (origen mensual/proyecto, categoría o cotizacion_item_id) y las cargas con hilvan_crear_gastos_bulk; 3) las de `notas_credito` NO van por ahí: cárgalas con hilvan_crear_nota_credito (monto en positivo, referencia_folio = la factura que anula). periodo en formato AAAAMM (ej. 202606). incluir_crudo=true muestra el registro original del SII.',
        inputSchema: {
          periodo: z.string().describe('AAAAMM, ej. 202606'),
          tipo: z.enum(['ambos', 'rcv', 'bhe']).optional().describe('qué traer (default ambos)'),
          incluir_crudo: z.boolean().optional().describe('incluye el registro SII original por fila (debug de mapeo)'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/sii-sync', args)),
    )

    server.registerTool(
      'hilvan_sii_sync_ventas',
      {
        title: 'Traer facturas EMITIDAS del SII (RCV ventas)',
        description:
          'SOLO LECTURA. Trae del SII (vía API Gateway) las FACTURAS EMITIDAS por Casa Hiedra (RCV ventas) de un período — DTE 33/34/39 en `facturas` y las NOTAS DE CRÉDITO emitidas (dte 61) en `notas_credito`. Cada fila trae receptor (=cliente), folio, fecha, montos y `cotizacion_sugerida` {id, numero, confianza alta/media} cruzando RUT receptor + monto + fecha; `ya_registrada` marca si ese folio ya está en una cotización. Guarda todo en sii_documentos (respaldo del contador). NO escribe en cotizaciones. Flujo: 1) llamas esto; 2) para los matches de confianza ALTA ya confirmados: hilvan_registrar_factura_emitida(cotizacion_id, fecha_factura_emitida, numero_factura=folio); 3) el cobro va por su carril (movimientos/conciliar o registrar_pago). NUNCA inventes el match — si no hay cotizacion_sugerida, pregunta. periodo AAAAMM (ej. 202606). incluir_crudo=true muestra el registro SII original.',
        inputSchema: {
          periodo: z.string().describe('AAAAMM, ej. 202606'),
          incluir_crudo: z.boolean().optional().describe('incluye el registro SII original por fila (debug de mapeo)'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/sii-sync-ventas', args)),
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
          'documento_recibido: false = "pagado/cargado pero el proveedor aún no emitió la boleta/factura" (documento pendiente); true = ya la tenemos. Independiente del pago. ' +
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
          documento_recibido: z
            .boolean()
            .optional()
            .describe('false = documento (boleta/factura) pendiente de emisión; true = ya la tenemos'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/editar-gasto', args)),
    )

    server.registerTool(
      'hilvan_pagar_gasto',
      {
        title: 'Marcar gasto como pagado',
        description:
          'Marca un gasto (proyecto o mensual) como PAGADO directo: setea pagado=true + fecha_pago (default hoy). Para el caso "tengo el comprobante" sin importar movimiento + conciliar. NO toca `estado` (pago y aprobación son ortogonales) ni crea entrada en el ledger (es "pagado sin conciliar" → cuando llegue la cartola, ese cargo se importa/concilia aparte). Obtén gasto_id y origen con hilvan_buscar_gastos. Reversible con hilvan_deshacer (restaura pagado/fecha_pago previos). CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          gasto_id: z.string(),
          origen: z.enum(['proyecto', 'mensual']),
          fecha_pago: z.string().optional().describe('YYYY-MM-DD; default hoy'),
          comprobante_pago_url: z.string().optional().describe('URL del comprobante de pago (opcional)'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/pagar-gasto', args)),
    )

    server.registerTool(
      'hilvan_cerrar_item',
      {
        title: 'Cerrar/rendir ítem de cotización',
        description:
          'Marca un ítem de cotización como RENDIDO/CERRADO (el "cuadre" del presupuesto del ítem contra los gastos reales). Úsalo cuando el productor da la instrucción de cerrar un ítem aunque sobre o se exceda el presupuesto. Devuelve el cuadre (presupuesto vs gastado vs diferencia). cerrado=false lo reabre. Obtén cotizacion_item_id con hilvan_cotizacion_detalle / hilvan_items_cotizacion. Reversible con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          cotizacion_item_id: z.string(),
          cerrado: z.boolean().optional().describe('true = cerrar/rendir (default); false = reabrir'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/cerrar-item', args)),
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

    // ── Cotizaciones: estructura y precio de bundle ──────────────────────────
    server.registerTool(
      'hilvan_cotizacion_precio_categoria',
      {
        title: 'Precio de bundle por categoría',
        description:
          'Fija (o limpia) el precio NATIVO de bundle de una categoría (departamento) o subcategoría (subgrupo). Casa Hiedra precia el bundle, no equipo por equipo: con precio_manual seteado, el total de la categoría es ese valor y los ítems pasan a ser solo descripción (sin monto). Manda precio_manual=null para volver a sumar los ítems. Obtén los ids con hilvan_items_cotizacion. Reversible con hilvan_deshacer (restaura el precio previo). CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          nivel: z.enum(['departamento', 'subgrupo']),
          id: z.string().describe('id de la categoría o subcategoría'),
          precio_manual: z
            .number()
            .nullable()
            .describe('monto del bundle (≥0), o null para volver a sumar los ítems'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/cotizacion-precio-categoria', args)),
    )

    server.registerTool(
      'hilvan_cotizacion_estado',
      {
        title: 'Cambiar estado de cotización',
        description:
          'Cambia el estado de una cotización (borrador, enviada, aprobada, rechazada, en_produccion, cerrada). Útil para el flujo desaprobar → corregir → reaprobar. Reversible con hilvan_deshacer (restaura el estado previo). CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          cotizacion_id: z.string(),
          estado: z.enum(['borrador', 'enviada', 'aprobada', 'rechazada', 'en_produccion', 'cerrada']),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/cotizacion-estado', args)),
    )

    server.registerTool(
      'hilvan_cotizacion_editar_item',
      {
        title: 'Editar ítem de cotización',
        description:
          'Edita un ítem existente: precio_cliente, nombre, descripcion, incluido, cantidad, dias, con_boleta, tasa_boleta. Debe venir al menos un campo. Si mandas precio_cliente se marca como precio personalizado. tasa_boleta va como FRACCIÓN (0.1525 = 15,25%); si activas con_boleta sin tasa y el ítem la tenía en 0, se rellena con la retención del año (Ley 21.133). Obtén item_id con hilvan_cotizacion_detalle. Reversible con hilvan_deshacer (restaura los valores previos). CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          item_id: z.string(),
          precio_cliente: z.number().optional().describe('precio al cliente (≥0)'),
          nombre: z.string().optional(),
          descripcion: z.string().optional(),
          incluido: z.boolean().optional().describe('true = "Incluida", no suma al total'),
          cantidad: z.number().optional(),
          dias: z.number().optional(),
          con_boleta: z.boolean().optional().describe('true = el proveedor emite boleta de honorarios (retención)'),
          tasa_boleta: z.number().optional().describe('retención como fracción 0–1, ej. 0.1525 = 15,25% (2026)'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/cotizacion-editar-item', args)),
    )

    server.registerTool(
      'hilvan_cotizacion_categoria',
      {
        title: 'Gestionar categorías de cotización',
        description:
          'Gestiona la estructura de categorías de una cotización. accion: ' +
          '"crear" {cotizacion_id, nivel, nombre, orden?, departamento_id? (si nivel=subgrupo)}; ' +
          '"renombrar" {nivel, id, nombre}; "reordenar" {nivel, id, orden}; ' +
          '"eliminar" {nivel, id} (solo si la categoría NO tiene ítems ni subgrupos); ' +
          '"mover_item" {item_id, departamento_id, subgrupo_id?}. nivel = departamento | subgrupo. ' +
          'Obtén ids con hilvan_items_cotizacion. Todas reversibles con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          accion: z.enum(['crear', 'renombrar', 'reordenar', 'eliminar', 'mover_item']),
          nivel: z.enum(['departamento', 'subgrupo']).optional(),
          cotizacion_id: z.string().optional(),
          id: z.string().optional().describe('id de la categoría/subcategoría (renombrar/reordenar/eliminar)'),
          nombre: z.string().optional(),
          orden: z.number().optional(),
          departamento_id: z.string().optional().describe('depto destino (crear subgrupo / mover_item)'),
          subgrupo_id: z.string().optional().describe('subgrupo destino en mover_item (omitir = ítem directo)'),
          item_id: z.string().optional().describe('ítem a mover (mover_item)'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/cotizacion-categoria', args)),
    )

    server.registerTool(
      'hilvan_cotizacion_agregar_items',
      {
        title: 'Agregar ítems a una cotización existente',
        description:
          'Inserta líneas NUEVAS en una cotización YA creada (lo que faltaba: agregar/copiar ítems sin rehacer la cotización). Cada ítem indica su `departamento` por NOMBRE (si no existe en la cotización, se crea) y opcional `subgrupo` por nombre. Campos del ítem: nombre (req), precio_cliente, cantidad, dias, unidad (día|hora|jornada|unidad|proyecto), tipo (rol|equipo_ch|equipo_externo|servicio|consumible|post_produccion|locacion|cast|otro), descripcion, incluido. Valida TODOS antes de escribir. Obtén el cotizacion_id con hilvan_buscar_cotizacion. Reversible con hilvan_deshacer (borra lo creado). CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          cotizacion_id: z.string(),
          items: z
            .array(
              z.object({
                departamento: z.string().describe('nombre del departamento/categoría; se crea si no existe'),
                subgrupo: z.string().optional().describe('nombre del subgrupo; se crea si no existe'),
                nombre: z.string(),
                precio_cliente: z.number().optional(),
                cantidad: z.number().optional(),
                dias: z.number().optional(),
                unidad: z.string().optional(),
                tipo: z.string().optional(),
                descripcion: z.string().optional(),
                incluido: z.boolean().optional(),
              }),
            )
            .describe('líneas a agregar'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/cotizacion-agregar-items', args)),
    )

    server.registerTool(
      'hilvan_cotizacion_editar',
      {
        title: 'Editar campos de la cotización',
        description:
          'Edita campos a nivel cotización (título, descripción, cliente, IVA, descuento, notas, formato y el Encargo). Debe venir al menos un campo. cliente_id enlaza un cliente formal; cliente_nombre_libre (alias agencia_cliente) es texto libre. Reversible con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          cotizacion_id: z.string(),
          nombre: z.string().optional(),
          descripcion: z.string().optional(),
          cliente_id: z.string().nullable().optional().describe('uuid de clientes; null para soltar el cliente formal'),
          cliente_nombre_libre: z.string().optional().describe('agencia/cliente como texto libre'),
          cliente_email_libre: z.string().optional(),
          con_iva: z.boolean().optional(),
          descuento_global: z.number().optional(),
          descuento_global_tipo: z.enum(['porcentaje', 'monto']).optional(),
          notas_cliente: z.string().optional(),
          notas_internas: z.string().optional(),
          formato_pdf: z.enum(['simple', 'detallado']).optional(),
          proyecto_id: z.string().nullable().optional(),
          solicita: z.string().optional(),
          cliente_final: z.string().optional().describe('marca o cliente final'),
          medios: z.string().optional(),
          referencia: z.string().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/cotizacion-editar', args)),
    )

    server.registerTool(
      'hilvan_cotizacion_detalle',
      {
        title: 'Detalle de cotización con precios',
        description:
          'Desglose CON precios de una cotización + RESUMEN (subtotal por departamento, neto, descuento, IVA, total). Cada ítem trae precio_cliente, cantidad, dias, unidad, incluido, con_boleta y su subtotal. Para verificar montos sin abrir el navegador. Pasa `numero` (ej. CH-COT-005) o `cotizacion_id`. Solo lectura.',
        inputSchema: {
          numero: z.string().optional(),
          cotizacion_id: z.string().optional(),
        },
      },
      async (args, extra) => {
        const qs = new URLSearchParams()
        if (args.numero) qs.set('numero', args.numero)
        if (args.cotizacion_id) qs.set('cotizacion_id', args.cotizacion_id)
        return ok(await callAgent(extra as ToolExtra, 'GET', `/cotizacion-detalle?${qs.toString()}`))
      },
    )

    server.registerTool(
      'hilvan_cotizacion_eliminar_item',
      {
        title: 'Eliminar ítem de cotización',
        description:
          'Elimina una línea (ítem) de una cotización. Obtén item_id con hilvan_cotizacion_detalle o hilvan_items_cotizacion. Reversible con hilvan_deshacer (re-inserta la fila). CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          item_id: z.string(),
          motivo: z.string().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/cotizacion-eliminar-item', args)),
    )

    server.registerTool(
      'hilvan_cotizacion_duplicar',
      {
        title: 'Duplicar / versión / variante de cotización',
        description:
          'Copia una cotización completa (cabecera + departamentos + subgrupos + ítems, incluyendo precios de bundle). modo="copia" crea un grupo NUEVO con número nuevo (como "Duplicar" en la UI); modo="version" crea otra versión en el MISMO grupo (version = máx+1); modo="variante" crea una variante (misma versión, siguiente letra libre o la que pases en `variante`). Reversible con hilvan_deshacer (borra la copia completa, y el grupo si era "copia"). CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          cotizacion_id: z.string(),
          modo: z.enum(['copia', 'version', 'variante']),
          variante: z.string().optional(),
          nombre: z.string().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/cotizacion-duplicar', args)),
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
          incluir_sin_rodaje: z
            .boolean()
            .optional()
            .describe('Incluir la sugerencia "cotización sin rodaje vinculado". Default false (genera ruido en operación flexible).'),
        },
      },
      async (args, extra) => {
        const params = new URLSearchParams()
        if (args.aging_dias != null) params.set('aging_dias', String(args.aging_dias))
        if (args.dias_sin_factura != null) params.set('dias_sin_factura', String(args.dias_sin_factura))
        if (args.dias_sin_rodaje != null) params.set('dias_sin_rodaje', String(args.dias_sin_rodaje))
        if (args.ventana_duplicados_dias != null)
          params.set('ventana_duplicados_dias', String(args.ventana_duplicados_dias))
        if (args.incluir_sin_rodaje === true) params.set('incluir_sin_rodaje', 'true')
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

    // ── CH-10 CRM (pipeline de captación) ─────────────────────────────────────
    // Etapas: prospecto · contacto · conversacion · confirmado · nurture · descartado
    // Hitos NO ordinales (checklist en la ficha): lectura · producto_propuesto ·
    // cotizacion_enviada · reunion
    server.registerTool(
      'hilvan_crear_prospecto',
      {
        title: 'Crear prospecto (CRM)',
        description:
          'Crea un prospecto en el CRM. empresa REQUERIDO; opcionales: nombre_contacto, email, telefono, origen (linkedin|instagram|referido|feria|web|correo|otro), score (alta|media|baja), decisor, angulo, producto_objetivo (banco|lookbook|spot|sin_definir), arquetipo (feed|temporadas|sin_definir), responsable_id (uuid de profiles), notas (se guarda como una nota suelta, no como campo del prospecto), etapa (default prospecto). como_propuesta=true NO crea: deja el lead en la Bandeja de Aprobación (úsalo para leads de correo entrante). CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          empresa: z.string(),
          nombre_contacto: z.string().optional(),
          email: z.string().optional(),
          telefono: z.string().optional(),
          origen: z.string().optional(),
          score: z.string().optional().describe('alta | media | baja'),
          decisor: z.string().optional(),
          angulo: z.string().optional(),
          producto_objetivo: z.string().optional().describe('banco | lookbook | spot | sin_definir'),
          arquetipo: z.string().optional().describe('feed | temporadas | sin_definir'),
          responsable_id: z.string().optional().describe('uuid de profiles'),
          notas: z.string().optional(),
          etapa: z.string().optional(),
          como_propuesta: z.boolean().optional().describe('true = dejar en la Bandeja en vez de crear'),
          nota_agente: z.string().optional().describe('por qué se propone (solo si como_propuesta)'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/crear', args)),
    )

    server.registerTool(
      'hilvan_buscar_prospecto',
      {
        title: 'Buscar prospecto',
        description: 'Busca prospectos por empresa, contacto o email.',
        inputSchema: { q: z.string() },
      },
      async ({ q }, extra) => ok(await callAgent(extra as ToolExtra, 'GET', `/crm/buscar?q=${encodeURIComponent(q)}`)),
    )

    server.registerTool(
      'hilvan_pipeline',
      {
        title: 'Pipeline CRM',
        description: 'Lista el pipeline con conteo por etapa. Cada prospecto trae tamano, segmento, sin_clasificar, ultimo_toque, toques, cadencia y dias_atraso: alcanza para auditar el estado del CRM sin pedir el detalle uno por uno. Filtros opcionales: responsable (uuid) y etapa.',
        inputSchema: {
          responsable: z.string().optional().describe('uuid de profiles'),
          etapa: z.string().optional(),
        },
      },
      async (args, extra) => {
        const qs = new URLSearchParams()
        if (args.responsable) qs.set('responsable', args.responsable)
        if (args.etapa) qs.set('etapa', args.etapa)
        const s = qs.toString()
        return ok(await callAgent(extra as ToolExtra, 'GET', `/crm/pipeline${s ? `?${s}` : ''}`))
      },
    )

    server.registerTool(
      'hilvan_mover_etapa',
      {
        title: 'Mover etapa de prospecto',
        description:
          'Cambia la etapa de un prospecto. Valida que la etapa exista. CONFIRMA con el usuario antes de llamar. ' +
          'AVANZAR (prospecto→contacto→conversacion) va directo si hay evidencia positiva. ' +
          'RETROCEDER usa `como_propuesta: true` + `evidencia`: no mueve nada, deja la propuesta en la Bandeja ' +
          'para que la apruebe un humano — retroceder se apoya en una ausencia, y una ausencia puede ser un ' +
          'fallo de búsqueda. NUNCA muevas a `confirmado` por inferencia: dispara el handoff a cotización.',
        inputSchema: {
          prospecto_id: z.string(),
          etapa: z.string(),
          como_propuesta: z.boolean().optional().describe('true = propone en la Bandeja en vez de mover'),
          evidencia: z.string().optional().describe('obligatoria si como_propuesta: por qué se propone'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/mover-etapa', args)),
    )

    server.registerTool(
      'hilvan_registrar_interaccion',
      {
        title: 'Registrar interacción (CRM)',
        description:
          'Agrega un toque a la bitácora de un prospecto. Indica al menos resumen o proximo_paso. Fechas en YYYY-MM-DD. tipo: correo|reunion|lectura|llamada|mensaje. CONFIRMA antes de llamar.',
        inputSchema: {
          prospecto_id: z.string(),
          fecha: z.string().optional().describe('YYYY-MM-DD'),
          tipo: z.string().optional(),
          resumen: z.string().optional(),
          proximo_paso: z.string().optional(),
          fecha_proximo: z.string().optional().describe('YYYY-MM-DD'),
          gmail_thread: z.string().optional().describe('id del hilo de Gmail — evita registrar dos veces el mismo correo'),
          respondido: z.boolean().optional().describe('el prospecto respondió'),
          enviado_por: z.string().optional().describe('quién hizo el contacto: "Simón", "Natalia"'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/interaccion', args)),
    )

    server.registerTool(
      'hilvan_insight_escribir',
      {
        title: 'Guardar insight de abordaje (CRM)',
        description:
          'Deja en la ficha del prospecto el PORQUÉ del abordaje, visible para Nati y Simón. ' +
          'tipo: investigacion (lo que encontraste de la marca — Brave, su sitio, su IG) | ' +
          'lectura (extraído de su dossier de La Lectura) | ' +
          'literatura (qué corresponde según la secuencia de ventas: toque 1-2 valor, 3-4 pedir un ' +
          'avance, 5+ reactivar). Guarda lo que fundamenta el borrador, no el borrador — ese va en ' +
          'hilvan_borrador_escribir.',
        inputSchema: {
          prospecto_id: z.string(),
          tipo: z.string().optional().describe('investigacion | lectura | literatura'),
          titulo: z.string().describe('una línea, concreta'),
          detalle: z.string().optional(),
          fuente: z.string().optional().describe('URL, o el nombre de la obra si es literatura'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/insight', args)),
    )

    server.registerTool(
      'hilvan_insights_leer',
      {
        title: 'Insights de abordaje de un prospecto (CRM)',
        description: 'SOLO LECTURA: lo ya averiguado sobre este prospecto. Míralo antes de investigar de nuevo.',
        inputSchema: { prospecto_id: z.string() },
      },
      async ({ prospecto_id }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/crm/insight?prospecto_id=${encodeURIComponent(prospecto_id)}`)),
    )

    server.registerTool(
      'hilvan_repertorio_leer',
      {
        title: 'Repertorio: lo que Casa Hiedra ya hizo (CRM)',
        description:
          'SOLO LECTURA. El cuerpo de obra, con links. Úsalo ANTES de escribir un correo: la regla ' +
          'de credenciales pide siempre DOS referencias, una marca grande que reconozcan y una ' +
          'chica del porte del prospecto — nunca cuatro, que se leen como currículum. ' +
          'Pasa `credenciales_para` con el rubro del prospecto (moda, belleza, retail…) y devuelve ' +
          'el par ya elegido en `credenciales`, descartando los links rotos. ' +
          'Si `delRubro` viene false, no había del rubro y son de otro: dilo en el borrador o no las uses.',
        inputSchema: {
          credenciales_para: z.string().optional().describe('rubro del prospecto — devuelve el par grande+chica listo'),
          rubro: z.string().optional(),
          escala: z.string().optional().describe('grande | chica'),
          formato: z.string().optional().describe('banco | lookbook | spot | otro'),
          q: z.string().optional().describe('buscar por marca'),
          incluir_no_mostrables: z.boolean().optional().describe('incluye lo que decidimos no mostrar'),
        },
      },
      async (args, extra) => {
        const qs = new URLSearchParams()
        for (const [k, v] of Object.entries(args)) {
          if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
        }
        return ok(await callAgent(extra as ToolExtra, 'GET', `/crm/repertorio?${qs.toString()}`))
      },
    )

    server.registerTool(
      'hilvan_repertorio_escribir',
      {
        title: 'Guardar un trabajo en el Repertorio (CRM)',
        description:
          'Agrega o actualiza un trabajo del cuerpo de obra. Sin `id` busca por marca+formato+año ' +
          'y actualiza si ya existe, así que la rutina puede correr dos veces sin duplicar. ' +
          '`escala` es lo que hace funcionar la regla de credenciales: marca `grande` la que ' +
          'cualquiera reconoce y `chica` la del porte de un prospecto pequeño — sin ella el trabajo ' +
          'no sirve para armar el par. `mostrable: false` para lo que se conserva como contexto ' +
          'pero decidimos no exhibir (el material viejo del canal de YouTube). ' +
          'Un link nuevo entra `sin_revisar` y NO puedes declararlo vivo: eso lo decide ' +
          'hilvan_repertorio_revisar. Al editar un trabajo, reenvía cada link con su `revisado_en` ' +
          'para no perder el resultado de la última revisión.',
        inputSchema: {
          id: z.string().optional().describe('sólo para editar uno existente'),
          marca: z.string(),
          rubro: z.string().optional().describe('minúsculas y singular: moda, belleza, retail, educacion…'),
          escala: z.string().optional().describe('grande | chica'),
          anio: z.number().optional(),
          formato: z.string().optional().describe('banco | lookbook | spot | otro'),
          descripcion: z.string().optional().describe('qué se hizo, concreto — sirve de material para el correo'),
          links: z.array(z.any()).optional().describe('URLs (string) u objetos {url, titulo, plataforma}'),
          mostrable: z.boolean().optional(),
          notas: z.string().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/repertorio', args)),
    )

    server.registerTool(
      'hilvan_repertorio_revisar',
      {
        title: 'Revisar que los links del Repertorio sigan vivos (CRM)',
        description:
          'Comprueba los links y marca los rotos. Sin `id` revisa todo el catálogo. ' +
          'Córrelo cada tanto: un link roto en un correo de captación es peor que ningún link. ' +
          'Un 403 o un timeout NO se marca muerto (Instagram bloquea bots) — sale en ' +
          '`no_concluyentes` para mirarlo a mano. Si viene `aviso`, se cortó por tope y falta revisar.',
        inputSchema: { id: z.string().optional().describe('un trabajo puntual; omitir para revisar todo') },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/repertorio/revisar', args)),
    )

    server.registerTool(
      'hilvan_interacciones',
      {
        title: 'Bitácora de un prospecto (CRM)',
        description:
          'SOLO LECTURA: los toques ya registrados de un prospecto, del más reciente al más antiguo. ' +
          'Devuelve total, cuántos tuvieron respuesta, la fecha del último y `hilos_registrados` ' +
          '(los gmail_thread ya anotados). Úsalo ANTES de registrar para no duplicar.',
        inputSchema: { prospecto_id: z.string() },
      },
      async ({ prospecto_id }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/crm/interacciones?prospecto_id=${encodeURIComponent(prospecto_id)}`)),
    )

    server.registerTool(
      'hilvan_registrar_interacciones_bulk',
      {
        title: 'Registrar muchas interacciones (CRM)',
        description:
          'Registra hasta 200 toques de una vez — para la reconciliación de correos, donde la primera ' +
          'corrida son decenas. Valida TODO antes de escribir: si una entrada está mal, no se escribe nada. ' +
          'Los `gmail_thread` ya registrados se OMITEN y se reportan, así la rutina puede correr dos veces ' +
          'sin duplicar. CONFIRMA antes de llamar.',
        inputSchema: {
          interacciones: z.array(z.object({
            prospecto_id: z.string(),
            fecha: z.string().optional().describe('YYYY-MM-DD'),
            tipo: z.string().optional().describe('correo|reunion|lectura|llamada|mensaje'),
            resumen: z.string().optional(),
            respondido: z.boolean().optional(),
            proximo_paso: z.string().optional(),
            fecha_proximo: z.string().optional().describe('YYYY-MM-DD'),
            gmail_thread: z.string().optional(),
            enviado_por: z.string().optional(),
          })).describe('cada una necesita al menos resumen o proximo_paso'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/interacciones-bulk', args)),
    )

    server.registerTool(
      'hilvan_proximos_seguimientos',
      {
        title: 'Próximos seguimientos (CRM)',
        description: 'LA AGENDA DE CONTACTO: a quién le toca hoy y a quién dentro de `dias` (default 7). Corre sobre el mismo motor de cadencia que el digest matinal y la pantalla del CRM, así que sus números coinciden — úsala para planificar el día en vez de hilvan_digest_matinal {dry:true}. Ordenada por prioridad: primero quien respondió, después el más atrasado. Devuelve estado, ultimo_toque, dias_atraso y sin_respuesta. Excluye confirmado/descartado/nurture/en_frio y a los agotados (16 toques sin respuesta).',
        inputSchema: { dias: z.number().optional().describe('ventana en días (default 7)') },
      },
      async ({ dias }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/crm/seguimientos${dias ? `?dias=${encodeURIComponent(dias)}` : ''}`)),
    )

    server.registerTool(
      'hilvan_registrar_lectura',
      {
        title: 'Registrar La Lectura (CRM)',
        description: 'Guarda "La Lectura" de un prospecto y aplica la heurística E7 (feed→banco, temporadas→lookbook): completa producto_objetivo/arquetipo si faltan y avanza la etapa a lectura_entregada. producto_derivado: banco|lookbook.',
        inputSchema: {
          prospecto_id: z.string(),
          url: z.string().optional(),
          dossier_ref: z.string().optional(),
          producto_derivado: z.string().optional().describe('banco | lookbook'),
          fecha: z.string().optional().describe('YYYY-MM-DD'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/lectura', args)),
    )

    server.registerTool(
      'hilvan_derivar_brief_cotizacion',
      {
        title: 'Derivar brief a cotización (CRM)',
        description: 'Genera un brief estratégico desde el prospecto y lo deja como PROPUESTA en la Bandeja (tipo brief_cotizacion). NUNCA deriva solo a cotización: requiere aprobación. Úsalo cuando el prospecto se confirma.',
        inputSchema: { prospecto_id: z.string(), nota_agente: z.string().optional() },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/brief', args)),
    )

    server.registerTool(
      'hilvan_metricas_crm',
      {
        title: 'Métricas CRM',
        description: 'Métricas del CRM: concentración Falabella (KPI norte de diversificación: % no-Falabella en pipeline y en ganados) + conteo por etapa y por responsable.',
        inputSchema: {},
      },
      async (_args, extra) => ok(await callAgent(extra as ToolExtra, 'GET', '/crm/metricas')),
    )

    server.registerTool(
      'hilvan_biblioteca_contactos',
      {
        title: 'Biblioteca de contactos (CRM)',
        description: 'Insights empíricos de contactos por etapa del Kanban (promedio y mediana de toques, tasa de respuesta) + a qué toque cierran los confirmados vs a cuál se enfrían. Úsalo para fundamentar recomendaciones. Solo lectura.',
        inputSchema: {},
      },
      async (_args, extra) => ok(await callAgent(extra as ToolExtra, 'GET', '/crm/biblioteca')),
    )

    server.registerTool(
      'hilvan_borrador_leer',
      {
        title: 'Leer borrador de respuesta (CRM)',
        description: 'Lee la casilla de borradores de respuesta de un prospecto (correos redactados con material, links y paquetes en PDF).',
        inputSchema: { prospecto_id: z.string() },
      },
      async ({ prospecto_id }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/crm/borrador?prospecto_id=${encodeURIComponent(prospecto_id)}`)),
    )

    server.registerTool(
      'hilvan_borrador_escribir',
      {
        title: 'Escribir borrador de respuesta (CRM)',
        description: 'Rellena/actualiza la casilla de borrador de respuesta de un prospecto. prospecto_id REQUERIDO; asunto, cuerpo, links[] (material propio), adjuntos[] (paquetes/PDF), estado (borrador|listo|enviado), id (para actualizar), contacto_id. NO envía el correo: deja el borrador para que un humano lo revise/envíe.',
        inputSchema: {
          prospecto_id: z.string(),
          id: z.string().optional(),
          asunto: z.string().optional(),
          cuerpo: z.string().optional(),
          links: z.array(z.string()).optional(),
          adjuntos: z.array(z.string()).optional(),
          estado: z.string().optional(),
          contacto_id: z.string().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/borrador', args)),
    )

    server.registerTool(
      'hilvan_reglas_crm',
      {
        title: 'Reglas del CRM',
        description: 'Las reglas vigentes del CRM de Casa Hiedra, tal como están en el repo: correos (qué y cómo se escribe), cadencia (cuándo toca el próximo contacto), reparto (de quién es cada prospecto) y misiones (cómo se proponen las misiones diarias y semanales del equipo — es una GUÍA, no un reglamento: si tu criterio la contradice, manda tu criterio y dilo en el reporte). LÉELAS AL EMPEZAR cada rutina — son la fuente de verdad y cambian. Sin parámetros trae las cuatro; doc=correos|cadencia|reparto|misiones trae una.',
        inputSchema: { doc: z.string().optional() },
      },
      async ({ doc }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/crm/reglas${doc ? `?doc=${encodeURIComponent(doc)}` : ''}`)),
    )

    server.registerTool(
      'hilvan_misiones_listar',
      {
        title: 'Misiones cargadas',
        description: 'Las misiones que Tomás YA eligió y están cargadas en Hilván, con si la persona las declaró cumplidas. Sin parámetros trae la semana en curso; desde=YYYY-MM-DD trae desde esa fecha. LLÁMALA ANTES de proponer: sin esto vuelves a proponer espacios que ya están tomados. `cumplida` es solo lectura — la marca la persona en la app, nunca tú.',
        inputSchema: { desde: z.string().optional() },
      },
      async ({ desde }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/misiones${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`)),
    )

    server.registerTool(
      'hilvan_misiones_crear',
      {
        title: 'Cargar misiones elegidas',
        description: 'Carga las misiones que Tomás YA ELIGIÓ, para que aparezcan en el dashboard y el perfil de cada persona. NO cargues opciones ni propuestas: tú propones dos o tres alternativas en tu reporte, Tomás elige, y recién ahí llamas esto con las elegidas. Reglas que la herramienta hace cumplir (lee la regla `misiones` de hilvan_reglas_crm antes): el texto NO lleva conteos —"tus 11 sin primer contacto" envejece y la misión pasa a mentir; el número va en fuente_verificacion con verificado_en—; `persona` es el nombre o el email de un perfil real; la semanal se guarda en el lunes de su semana aunque mandes otro día. Valida TODO antes de escribir: si algo falla no escribe nada y te dice qué. Si ya hay misión en ese espacio responde 409; manda reemplazar:true para pisarla. Reversible con hilvan_deshacer (borra las creadas y restaura las pisadas).',
        inputSchema: {
          misiones: z.array(z.object({
            persona: z.string(),
            tipo: z.enum(['diaria', 'semanal']),
            texto: z.string(),
            guia: z.string().optional(),
            fuente_verificacion: z.string().optional(),
            verificado_en: z.string().optional(),
            fecha_objetivo: z.string(),
          })),
          reemplazar: z.boolean().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/misiones', args)),
    )

    server.registerTool(
      'hilvan_editar_prospecto',
      {
        title: 'Editar prospecto (CRM)',
        description: 'Corrige los datos de un prospecto. prospecto_id REQUERIDO; sólo se escriben los campos que mandes (los que omitas quedan intactos). Manda "" para vaciar uno. Úsalo sobre todo para arreglar `origen`: decide si el prospecto es frío o entrante y con eso la secuencia de correos. NO cambia etapa (usa hilvan_mover_etapa) ni responsable (usa hilvan_solicitar_asignacion); para tamaño/segmento usa hilvan_clasificar_prospecto; para notas usa hilvan_nota_escribir. Guarda el valor anterior en la auditoría para poder revertir.',
        inputSchema: {
          prospecto_id: z.string(),
          empresa: z.string().optional(),
          nombre_contacto: z.string().optional(),
          email: z.string().optional(),
          telefono: z.string().optional(),
          origen: z.string().optional().describe('lectura|web|feria|referido|correo|linkedin|instagram|otro'),
          arquetipo: z.string().optional(),
          score: z.string().optional(),
          decisor: z.string().optional(),
          angulo: z.string().optional(),
          producto_objetivo: z.string().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/editar', args)),
    )

    server.registerTool(
      'hilvan_editar_interaccion',
      {
        title: 'Editar interacción (CRM)',
        description: 'Corrige una interacción ya registrada. interaccion_id REQUERIDO; sólo se escriben los campos que mandes. Úsalo sobre todo para poner `gmail_thread` en interacciones cargadas a mano: sin ese campo el cotejo diario no las reconoce y las vuelve a insertar cada vez, dejando duplicados que inflan el conteo de toques y corren la cadencia. Los ids salen de hilvan_interacciones. Guarda el valor anterior en la auditoría.',
        inputSchema: {
          interaccion_id: z.string(),
          gmail_thread: z.string().optional(),
          fecha: z.string().optional().describe('YYYY-MM-DD'),
          tipo: z.string().optional(),
          resumen: z.string().optional(),
          proximo_paso: z.string().optional(),
          fecha_proximo: z.string().optional().describe('YYYY-MM-DD — contexto, no decide la agenda'),
          enviado_por: z.string().optional(),
          respondido: z.boolean().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/interaccion/editar', args)),
    )

    server.registerTool(
      'hilvan_contactos_listar',
      {
        title: 'Árbol de contactos (CRM)',
        description: 'Quién es quién en la marca, con su `contacto_id`. De acá salen los ids que piden hilvan_hilo, hilvan_registrar_respuesta y hilvan_borrador_escribir. LLÁMALA ANTES de crear un contacto: es como se evita tener a la misma persona dos veces. Cada uno trae `en_hilo_abierto` (si ya está anclado a una conversación viva) y `fuente` (de dónde salió). Devuelve además `hilos_sin_contacto`: líneas abiertas sin nadie asignado, que son las que hay que emparejar.',
        inputSchema: { prospecto_id: z.string() },
      },
      async ({ prospecto_id }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/crm/contactos?prospecto_id=${encodeURIComponent(prospecto_id)}`)),
    )

    server.registerTool(
      'hilvan_contacto_crear',
      {
        title: 'Agregar un contacto (CRM)',
        description: 'Agrega una persona al árbol de la marca. Necesita al menos nombre o email. Rechaza correos repetidos dentro de la misma marca (409 con el contacto_id existente): dos fichas de la misma persona parten la conversación en dos. `fuente` es de dónde salió el dato —el correo, la reunión, el sitio— y sostiene la regla de no inventar: si no sabes de dónde salió, no lo crees. Cuando la marca tiene UNA sola línea abierta y está sin contacto, lo ancla ahí automáticamente (desactivable con anclar_a_hilo:false). Úsalo en el cotejo diario: cada correo trae el nombre y la dirección de quien firma, y hoy ese dato se pierde.',
        inputSchema: {
          prospecto_id: z.string(),
          nombre: z.string().optional(),
          email: z.string().optional(),
          cargo: z.string().optional(),
          telefono: z.string().optional(),
          fuente: z.string().optional().describe('de qué correo, reunión o página salió'),
          notas: z.string().optional(),
          es_decisor: z.boolean().optional(),
          anclar_a_hilo: z.boolean().optional().describe('default true'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/contactos', args)),
    )

    server.registerTool(
      'hilvan_contacto_editar',
      {
        title: 'Corregir un contacto (CRM)',
        description: 'Corrige los datos de una persona del árbol. contacto_id REQUERIDO; sólo se escriben los campos que mandes. Es la vía para arreglar correos mal tipeados sin perder la conversación colgada de ese contacto — hay al menos uno con "gmail.con" que llegó así desde el formulario web. Guarda el valor anterior en la auditoría.',
        inputSchema: {
          contacto_id: z.string(),
          nombre: z.string().optional(),
          email: z.string().optional(),
          cargo: z.string().optional(),
          telefono: z.string().optional(),
          fuente: z.string().optional(),
          notas: z.string().optional(),
          es_decisor: z.boolean().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'PATCH', '/crm/contactos', args)),
    )

    server.registerTool(
      'hilvan_contacto_borrar',
      {
        title: 'Borrar un contacto (CRM)',
        description: 'Borra una persona del árbol. SOLO si no tiene conversación asociada: con mensajes o líneas encima ya no es un error de tipeo sino historia, y borrarlo dejaría esa conversación sin dueño — ahí corresponde hilvan_contacto_editar. Sirve para deshacer un contacto creado por error.',
        inputSchema: { contacto_id: z.string() },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'DELETE', '/crm/contactos', args)),
    )

    server.registerTool(
      'hilvan_notas_leer',
      {
        title: 'Notas del prospecto (CRM)',
        description: 'Las notas sueltas de un prospecto, de la más nueva a la más vieja. Reemplazan al campo único `prospectos.notas`, que quedó vacío en ago-2026. Cada nota trae `tipo` (nota|lectura|acuerdo) y `bloqueada`. Devuelve además `lectura`: el dossier de La Lectura, que NO es una nota —viene de otra tabla y no se edita por acá—. Léelas antes de redactar: es donde está lo que se sabe de la marca y no cabe en la bitácora.',
        inputSchema: { prospecto_id: z.string() },
      },
      async ({ prospecto_id }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/crm/notas?prospecto_id=${encodeURIComponent(prospecto_id)}`)),
    )

    server.registerTool(
      'hilvan_nota_escribir',
      {
        title: 'Escribir una nota (CRM)',
        description: 'Agrega una nota a un prospecto. Una nota por tema —para eso dejaron de ser un campo único—. `bloqueada: true` la guarda como REGISTRO: no se podrá editar después, sólo borrar. Úsalo para lo que llegó de afuera o lo que se pactó con el cliente, nunca para apuntes de trabajo que después habrá que corregir. Esto NO es la bitácora (eso es lo que pasó) ni un insight (eso es el porqué del abordaje).',
        inputSchema: {
          prospecto_id: z.string(),
          cuerpo: z.string(),
          titulo: z.string().optional(),
          tipo: z.string().optional().describe('nota | lectura | acuerdo — default nota'),
          bloqueada: z.boolean().optional().describe('true = registro congelado, no editable'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/notas', args)),
    )

    server.registerTool(
      'hilvan_nota_editar',
      {
        title: 'Corregir una nota (CRM)',
        description: 'Corrige una nota. nota_id REQUERIDO; sólo se escriben los campos que mandes (los que omitas quedan intactos). Existe para que puedas arreglar lo que escribiste mal en vez de dejar dos notas del mismo tema: escribir una encima deja basura. NO sirve para notas bloqueadas —eso es un registro y cambiarlo en silencio es justo lo que el candado impide—: si una bloqueada está mal, bórrala con hilvan_nota_borrar y escribe otra. Guarda el valor anterior en la auditoría.',
        inputSchema: {
          nota_id: z.string(),
          cuerpo: z.string().optional(),
          titulo: z.string().optional(),
          tipo: z.string().optional().describe('nota | lectura | acuerdo'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'PATCH', '/crm/notas', args)),
    )

    server.registerTool(
      'hilvan_nota_borrar',
      {
        title: 'Borrar una nota (CRM)',
        description: 'Borra una nota. Acepta también las BLOQUEADAS: el candado impide editar, no borrar, porque borrar es visible y queda entero en la auditoría —la nota completa se guarda ahí— mientras que editar un registro en silencio no deja rastro. Es la salida cuando algo se bloqueó mal. Antes de borrar algo que no escribiste tú, dilo en el reporte.',
        inputSchema: { nota_id: z.string() },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'DELETE', '/crm/notas', args)),
    )

    server.registerTool(
      'hilvan_bitacora',
      {
        title: 'Bitácora conversacional (CRM)',
        description: 'La conversación completa con una marca, agrupada en líneas (hilos): quién dijo qué, a quién, y contestando a qué. Cada mensaje trae `direccion` (enviado = nosotros | recibido = ellos) y `quien` (nombre real). Úsala en vez de hilvan_interacciones cuando necesites ENTENDER la conversación: sin la dirección no se distingue "le escribimos tres veces" de "nos escribieron tres veces". Devuelve también las líneas cerradas y por qué se cerraron.',
        inputSchema: { prospecto_id: z.string() },
      },
      async ({ prospecto_id }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/crm/bitacora?prospecto_id=${encodeURIComponent(prospecto_id)}`)),
    )

    server.registerTool(
      'hilvan_registrar_respuesta',
      {
        title: 'Registrar respuesta recibida (CRM)',
        description: 'Registra lo que la contraparte CONTESTÓ (mensaje entrante). Es la otra mitad del cotejo de correos: hasta ahora encontrar una respuesta sólo permitía marcar un booleano y el contenido —la objeción, el "está caro", el "vuelve en marzo"— se perdía. Marca automáticamente como respondido el mensaje al que contesta, que es de donde la cadencia saca el estado más urgente. NO uses hilvan_registrar_interaccion para esto: eso registra toques NUESTROS y correría la escalera al revés.',
        inputSchema: {
          prospecto_id: z.string(),
          resumen: z.string().optional().describe('en una línea: qué dijeron'),
          cuerpo: z.string().optional().describe('la respuesta completa'),
          fecha: z.string().optional().describe('YYYY-MM-DD, default hoy'),
          tipo: z.string().optional().describe('correo|llamada|mensaje|reunion'),
          contacto_id: z.string().optional().describe('quién de la marca contestó'),
          responde_a: z.string().optional().describe('id del mensaje nuestro; default el último enviado'),
          hilo_id: z.string().optional(),
          gmail_thread: z.string().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/respuesta', args)),
    )

    server.registerTool(
      'hilvan_hilo',
      {
        title: 'Líneas de conversación (CRM)',
        description: 'Abre, cierra, reabre o ASIGNA CONTACTO a una línea de la bitácora. `asignar` {hilo_id, contacto_id} le pone cara a una conversación que ya existe — úsalo cuando identifiques a la persona a mitad de camino, en vez de abrir una línea nueva (eso reiniciaría la cadencia sólo para anotar un nombre). El contacto_id sale de hilvan_contactos_listar y tiene que ser de la misma marca. ABRIR cierra la vigente y REINICIA LA CADENCIA: los toques sin respuesta del interlocutor anterior dejan de contar. Úsalo cuando cambie la contraparte en la marca o cuando se retome después de mucho tiempo — así el prospecto no arranca agotado con la persona nueva. motivo/motivo_cierre: cambio_contacto | cambio_responsable | reinicio | sin_respuesta | manual.',
        inputSchema: {
          accion: z.string().describe('abrir | cerrar | reabrir | asignar'),
          prospecto_id: z.string().optional().describe('requerido para abrir'),
          hilo_id: z.string().optional().describe('requerido para cerrar/reabrir'),
          contacto_id: z.string().optional().describe('con quién es la línea (requerido en asignar)'),
          titulo: z.string().optional(),
          motivo: z.string().optional().describe('al cerrar'),
          motivo_cierre: z.string().optional().describe('al abrir: por qué se cierra la anterior'),
          cerrar_actual: z.boolean().optional().describe('default true'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/hilo', args)),
    )

    server.registerTool(
      'hilvan_solicitar_asignacion',
      {
        title: 'Pedir un prospecto (CRM)',
        description: 'Pide que un prospecto pase a otra persona. NO reasigna: deja una propuesta en la Bandeja para que la resuelva quien gestiona el reparto. `para` es el EMAIL de quien lo llevaría — si no calza con ningún usuario falla, en vez de adivinar por parecido de nombre. Usa esto cuando alguien del equipo pida llevar una marca; el reparto automático sigue siendo el camino normal.',
        inputSchema: {
          prospecto_id: z.string(),
          para: z.string().describe('email del futuro responsable'),
          motivo: z.string().optional(),
          pedido_por: z.string().optional().describe('nombre de quien lo pide'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/solicitar-asignacion', args)),
    )

    server.registerTool(
      'hilvan_clasificar_prospecto',
      {
        title: 'Clasificar prospecto (CRM)',
        description: 'Clasifica un prospecto por tamano (chica|mediana|grande) y segmento (general|estudiante|ropa_intima_fem|masculino_estereotipo|rental) — los ejes con que se asigna el responsable. Si el prospecto NO tiene responsable, lo asigna EN EL ACTO según las reglas (rental→Josué; estudiante/masculino/videoclip→Simón; ropa_intima/banco/lookbook-chica→Natalia; lookbook o empresa grande→Tomás; fallback→Simón). NO reasigna si ya tiene dueño. Fíjalo al investigar/enriquecer el lead. prospecto_id REQUERIDO.',
        inputSchema: {
          prospecto_id: z.string(),
          tamano: z.string().optional(),
          segmento: z.string().optional(),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/clasificar', args)),
    )

    server.registerTool(
      'hilvan_digest_matinal',
      {
        title: 'Digest matinal (CRM)',
        description: 'Dispara el digest matinal del CRM (a cada operador: cuántos prospectos activos y borradores listos tiene). dry=true simula sin enviar y devuelve el cálculo; solo=<email> envía a un único destinatario (para probar). Sin parámetros envía a todos — úsalo con cuidado.',
        inputSchema: { dry: z.boolean().optional(), solo: z.string().optional() },
      },
      async ({ dry, solo }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/crm/digest-matinal?dry=${dry ? 'true' : 'false'}${solo ? `&solo=${encodeURIComponent(solo)}` : ''}`)),
    )

    server.registerTool(
      'hilvan_listar_aprobaciones',
      {
        title: 'Bandeja de aprobación (CRM)',
        description: 'Lista la Bandeja de Aprobación del CRM (crm_aprobaciones). estado: pendiente (default) | aprobado | descartado | todos.',
        inputSchema: { estado: z.string().optional() },
      },
      async ({ estado }, extra) =>
        ok(await callAgent(extra as ToolExtra, 'GET', `/crm/aprobaciones${estado ? `?estado=${encodeURIComponent(estado)}` : ''}`)),
    )

    server.registerTool(
      'hilvan_resolver_aprobacion',
      {
        title: 'Resolver aprobación (CRM)',
        description:
          'Resuelve un ítem de la Bandeja. accion=aprobado APLICA el cambio (crea prospecto / mueve etapa / registra interacción); brief_cotizacion y correo_borrador solo se marcan aprobados (ejecución externa = fases posteriores). accion=descartado lo archiva. CONFIRMA con el usuario antes de llamar.',
        inputSchema: {
          aprobacion_id: z.string(),
          accion: z.string().describe('aprobado | descartado'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/resolver-aprobacion', args)),
    )

    server.registerTool(
      'hilvan_buscar_leads_web',
      {
        title: 'Buscar/enriquecer leads web (CRM)',
        description:
          'Enriquece empresas y las deja como PROPUESTAS en la Bandeja (sitio + correo GENÉRICO publicado + gancho real, vía Firecrawl+LLM). DOS modos: (a) DIRIGIDO con `objetivos` (dominios/nombres ya aprobados, idealmente de hilvan_descubrir_marcas); (b) BÚSQUEDA con solo `sector` (más superficial). Flujo recomendado: descubrir_marcas → podar → buscar_leads_web con objetivos. NO obtiene el correo personal del decisor: entrega genérico (contacto@/marketing@) o formulario. El humano aprueba en la Bandeja.',
        inputSchema: {
          sector: z.string().describe('rubro/contexto, ej: "marca de vestuario Chile" (clasifica rubro + gancho)'),
          objetivos: z.array(z.string()).optional().describe('modo dirigido: dominios o nombres de marca a enriquecer'),
          max: z.number().optional().describe('modo búsqueda: 1-15, default 6'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/leads-web', args)),
    )

    server.registerTool(
      'hilvan_descubrir_marcas',
      {
        title: 'Descubrir marcas (CRM, paso 1)',
        description:
          'PASO 1 del descubrimiento: dado un sector, minea FUENTES curadas (listicles/guías/directorios) y extrae con LLM la LISTA de marcas del rubro (nombre + sitio). NO scrapea cada marca ni escribe en la Bandeja — devuelve la lista para revisar/podar. Luego enriquece las aprobadas con hilvan_buscar_leads_web pasando `objetivos`. Mejor que buscar a ciegas.',
        inputSchema: {
          sector: z.string().describe('rubro a descubrir, ej: "marcas de vestuario independiente Chile"'),
        },
      },
      async (args, extra) => ok(await callAgent(extra as ToolExtra, 'POST', '/crm/descubrir-marcas', args)),
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
