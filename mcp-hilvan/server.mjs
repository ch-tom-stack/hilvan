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
    name: 'hilvan_buscar_cliente',
    description: 'Busca clientes por nombre, empresa o RUT. Devuelve id, nombre, empresa, rut, email. Útil para obtener el cliente_id antes de crear una cotización.',
    inputSchema: { type: 'object', properties: { q: { type: 'string', description: 'nombre, empresa o RUT' } }, required: ['q'] },
    run: (a) => api('GET', `/clientes?q=${encodeURIComponent(a.q)}`),
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
        tipo_documento: { type: 'string', description: 'boleta | factura | boleta_consumo | exenta | sin_documento | nota_credito' },
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
    name: 'hilvan_crear_cliente',
    description: 'Crea un cliente nuevo (igual que en la app). Devuelve {id, nombre}. Reversible con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        empresa: { type: 'string' },
        email: { type: 'string' },
        telefono: { type: 'string' },
        rut: { type: 'string' },
        direccion: { type: 'string' },
        ciudad: { type: 'string' },
        pais: { type: 'string' },
        notas: { type: 'string' },
      },
      required: ['nombre'],
    },
    run: (a) => api('POST', '/cliente', a),
  },
  {
    name: 'hilvan_crear_cotizacion',
    description: 'Crea una cotización COMPLETA, idéntica a la de un usuario y 100% editable en la app después. Define nombre (requerido) y, opcionalmente, cliente (cliente_id o cliente_nombre_libre), proyecto, IVA, descuento global, notas y la estructura de departamentos → subgrupos → ítems. Si no entregas departamentos, crea los 8 por defecto (como "Nueva cotización"). Devuelve {cotizacion_id, numero, url}. Reversible con hilvan_deshacer (borra todo en cascada). CONFIRMA con el usuario antes de llamar; crea una cotización editable en la app.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        cliente_id: { type: 'string' },
        cliente_nombre_libre: { type: 'string' },
        cliente_email_libre: { type: 'string' },
        proyecto_id: { type: 'string' },
        con_iva: { type: 'boolean', description: 'default true' },
        formato_pdf: { type: 'string', description: 'simple | detallado (default detallado)' },
        descuento_global: { type: 'number' },
        descuento_global_tipo: { type: 'string', description: 'porcentaje | monto' },
        descripcion: { type: 'string' },
        notas_internas: { type: 'string' },
        notas_cliente: { type: 'string' },
        fecha_factura_emitida: { type: 'string', description: 'YYYY-MM-DD' },
        numero_factura: { type: 'string' },
        departamentos: {
          type: 'array',
          description: 'estructura completa; cada ítem: {tipo(rol|equipo_ch|equipo_externo|servicio|consumible|post_produccion|locacion|cast|otro), nombre, descripcion?, precio_cliente?, precio_neto_proveedor?, precio_bruto?, cantidad?, dias?, unidad?(día|hora|jornada|unidad|proyecto), incluido?, con_boleta?, tasa_boleta?, descuento_item?, descuento_item_tipo?, equipo_id?, tarifa_id?, orden?}',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              orden: { type: 'number' },
              items: { type: 'array', items: { type: 'object' } },
              subgrupos: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nombre: { type: 'string' },
                    orden: { type: 'number' },
                    items: { type: 'array', items: { type: 'object' } },
                  },
                  required: ['nombre'],
                },
              },
            },
            required: ['nombre'],
          },
        },
      },
      required: ['nombre'],
    },
    run: (a) => api('POST', '/crear-cotizacion', a),
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
              tipo_documento: { type: 'string', description: 'boleta | factura | boleta_consumo | exenta | sin_documento | nota_credito' },
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
        tipo_documento: { type: 'string', description: 'boleta | factura | boleta_consumo | exenta | sin_documento | nota_credito' },
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
  {
    name: 'hilvan_crear_nota_credito',
    description: 'Registra una NOTA DE CRÉDITO (NC, Tipo Doc 61 del SII): un documento que RESTA una factura previa. Se guarda como un gasto con monto NEGATIVO (entrega el valor ABSOLUTO en `monto`, >0) y tipo_documento="nota_credito"; NO aplica retención. Para origen="mensual" pasa periodo+categoria; para origen="proyecto" pasa cotizacion_item_id. Usa referencia_folio para dejar trazabilidad de la factura que anula/reduce. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        origen: { type: 'string', description: 'mensual | proyecto' },
        monto: { type: 'number', description: 'valor ABSOLUTO de la NC (>0); se persiste negativo' },
        descripcion: { type: 'string' },
        folio: { type: 'string', description: 'folio de la nota de crédito' },
        fecha_documento: { type: 'string', description: 'YYYY-MM-DD' },
        rut_emisor: { type: 'string' },
        razon_social_emisor: { type: 'string' },
        referencia_folio: { type: 'string', description: 'folio de la factura que la NC anula/reduce' },
        periodo: { type: 'string', description: 'YYYY-MM (requerido si origen=mensual)' },
        categoria: { type: 'string', description: 'requerido si origen=mensual' },
        cotizacion_item_id: { type: 'string', description: 'UUID del ítem (requerido si origen=proyecto)' },
      },
      required: ['origen', 'monto', 'descripcion'],
    },
    run: (a) => api('POST', '/crear-nota-credito', a),
  },
  {
    name: 'hilvan_editar_gasto',
    description: 'Corrige el tipo_documento y/o el folio de un gasto ya cargado (no recalcula el monto). Obtén gasto_id y origen con hilvan_buscar_gastos. Debe venir al menos uno de tipo_documento/folio. Reversible con hilvan_deshacer (restaura los valores previos, no borra el gasto). CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        gasto_id: { type: 'string' },
        origen: { type: 'string', description: 'proyecto | mensual' },
        tipo_documento: { type: 'string', description: 'boleta | boleta_consumo | factura | exenta | sin_documento | nota_credito' },
        folio: { type: 'string', description: 'folio del documento SII' },
      },
      required: ['gasto_id', 'origen'],
    },
    run: (a) => api('POST', '/editar-gasto', a),
  },
  {
    name: 'hilvan_importar_movimientos',
    description: 'Importa movimientos de tarjeta/cuenta (extracto). Recibe un array `movimientos`, cada uno con fecha (YYYY-MM-DD), monto (>0), tipo ("cargo"=salida | "abono"=entrada) y opcionalmente descripcion/fuente/referencia. Valida TODAS las filas antes de escribir; reversible en bloque con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        movimientos: {
          type: 'array',
          description: 'movimientos del extracto',
          items: {
            type: 'object',
            properties: {
              fecha: { type: 'string', description: 'YYYY-MM-DD' },
              monto: { type: 'number', description: 'monto positivo' },
              tipo: { type: 'string', description: 'cargo=salida | abono=entrada' },
              descripcion: { type: 'string' },
              fuente: { type: 'string', description: 'ej. tarjeta, cuenta corriente' },
              referencia: { type: 'string' },
            },
            required: ['fecha', 'monto', 'tipo'],
          },
        },
      },
      required: ['movimientos'],
    },
    run: (a) => api('POST', '/importar-movimientos', a),
  },
  {
    name: 'hilvan_movimientos',
    description: 'Lista los movimientos bancarios importados, con filtros. Útil para ver los cargos/abonos sin conciliar y cruzarlos con Hilván.',
    inputSchema: {
      type: 'object',
      properties: {
        conciliado: { type: 'string', description: 'true | false' },
        tipo: { type: 'string', description: 'cargo | abono' },
        fuente: { type: 'string' },
        desde: { type: 'string', description: 'YYYY-MM-DD' },
        hasta: { type: 'string', description: 'YYYY-MM-DD' },
        q: { type: 'string', description: 'texto sobre descripcion/referencia' },
      },
    },
    run: (a) => {
      const params = new URLSearchParams()
      if (a.conciliado) params.set('conciliado', a.conciliado)
      if (a.tipo) params.set('tipo', a.tipo)
      if (a.fuente) params.set('fuente', a.fuente)
      if (a.desde) params.set('desde', a.desde)
      if (a.hasta) params.set('hasta', a.hasta)
      if (a.q) params.set('q', a.q)
      const qs = params.toString()
      return api('GET', `/movimientos${qs ? `?${qs}` : ''}`)
    },
  },
  {
    name: 'hilvan_conciliar',
    description: 'Cruza un movimiento bancario con una fila de Hilván y MARCA PAGADA la obligación. match_tabla indica qué se paga: "cotizaciones" (un abono = pago recibido, setea fecha_pago_recibido), "rendicion_gastos"/"rendicion_mensual_gastos" (un cargo = gasto pagado), "gastos_fijos_cuotas" (un cargo = cuota de crédito pagada). match_id es el UUID de esa fila. Reversible con hilvan_deshacer (restaura el estado previo). CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        movimiento_id: { type: 'string', description: 'UUID del movimiento bancario' },
        match_tabla: { type: 'string', description: 'rendicion_gastos | rendicion_mensual_gastos | gastos_fijos_cuotas | cotizaciones' },
        match_id: { type: 'string', description: 'UUID de la fila en match_tabla' },
        fecha_pago: { type: 'string', description: 'YYYY-MM-DD; por defecto la fecha del movimiento' },
      },
      required: ['movimiento_id', 'match_tabla', 'match_id'],
    },
    run: (a) => api('POST', '/conciliar', a),
  },
  {
    name: 'hilvan_conciliar_vario',
    description: 'Cierra el loop de conciliación: registra un movimiento bancario SIN match en Hilván (devolución de impuesto, depósito, compra suelta, etc.) como ingreso/gasto vario en el flujo de caja y lo marca conciliado. El abono se guarda como "entrada" y el cargo como "salida", con el monto y la fecha del movimiento. El movimiento debe existir y NO estar ya conciliado. Reversible con hilvan_deshacer (borra la fila de flujo y des-concilia el movimiento). CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        movimiento_id: { type: 'string', description: 'UUID del movimiento bancario' },
        descripcion: { type: 'string', description: 'descripción del ingreso/gasto vario' },
      },
      required: ['movimiento_id', 'descripcion'],
    },
    run: (a) => api('POST', '/conciliar-vario', a),
  },
  {
    name: 'hilvan_flujo_caja',
    description: 'Lista las entradas/salidas del flujo de caja manual (ingresos/gastos varios), incluidas las creadas al conciliar movimientos sin match. Filtra por periodo (YYYY-MM) y/o tipo (entrada|salida).',
    inputSchema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', description: 'YYYY-MM' },
        tipo: { type: 'string', description: 'entrada | salida' },
      },
    },
    run: (a) => {
      const params = new URLSearchParams()
      if (a.periodo) params.set('periodo', a.periodo)
      if (a.tipo) params.set('tipo', a.tipo)
      const qs = params.toString()
      return api('GET', `/flujo-caja${qs ? `?${qs}` : ''}`)
    },
  },
  {
    name: 'hilvan_cuotas_credito',
    description: 'Lista las cuotas de créditos / gastos fijos con su crédito (nombre/acreedor). Por defecto solo pendientes. Útil para cruzar pagos de crédito con movimientos bancarios (luego conciliar con match_tabla="gastos_fijos_cuotas").',
    inputSchema: {
      type: 'object',
      properties: {
        pagada: { type: 'string', description: 'true | false (default false → solo pendientes)' },
      },
    },
    run: (a) => api('GET', `/cuotas-credito${a.pagada ? `?pagada=${a.pagada}` : ''}`),
  },
  {
    name: 'hilvan_estado_financiero',
    description: 'Resumen financiero del mes (ingresos, egresos, por cobrar, créditos, flujo) para responder cómo vamos.',
    inputSchema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', description: 'YYYY-MM; default = mes actual' },
      },
    },
    run: (a) => api('GET', `/estado-financiero${a.periodo ? `?periodo=${encodeURIComponent(a.periodo)}` : ''}`),
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
