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
    description: 'Corrige metadata de un gasto ya cargado (no recalcula el monto): tipo_documento, folio, o las marcas de auditoría sin_documento_aceptado / folio_compartido / referencia_externa. Obtén gasto_id y origen con hilvan_buscar_gastos. Debe venir al menos un campo. sin_documento_aceptado=true: sin respaldo aceptado a propósito (la auditoría lo baja a info). folio_compartido=true: parte de una factura que cubre varias cotizaciones (no es duplicado). referencia_externa: invoice de proveedor extranjero sin folio chileno (resuelve folio faltante). Reversible con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        gasto_id: { type: 'string' },
        origen: { type: 'string', description: 'proyecto | mensual' },
        tipo_documento: { type: 'string', description: 'boleta | boleta_consumo | factura | exenta | sin_documento | nota_credito' },
        folio: { type: 'string', description: 'folio del documento SII' },
        sin_documento_aceptado: { type: 'boolean', description: 'true = sin respaldo aceptado a propósito (baja la alerta a info)' },
        folio_compartido: { type: 'boolean', description: 'true = parte de una factura que cubre varias cotizaciones (no es duplicado)' },
        referencia_externa: { type: 'string', description: 'número de invoice de proveedor extranjero sin folio chileno' },
      },
      required: ['gasto_id', 'origen'],
    },
    run: (a) => api('POST', '/editar-gasto', a),
  },
  {
    name: 'hilvan_eliminar_gasto',
    description: 'Elimina un gasto ya cargado (proyecto o mensual). Sirve para resolver DUPLICADOS creados por humanos o en sesiones anteriores, que hilvan_deshacer no puede revertir. motivo es OBLIGATORIO y queda en el log de auditoría. Reversible: hilvan_deshacer re-inserta el gasto completo. Obtén gasto_id y origen con hilvan_buscar_gastos. CONFIRMA SIEMPRE con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        gasto_id: { type: 'string' },
        origen: { type: 'string', description: 'proyecto | mensual' },
        motivo: { type: 'string', description: 'por qué se elimina (queda registrado en auditoría)' },
      },
      required: ['gasto_id', 'origen', 'motivo'],
    },
    run: (a) => api('POST', '/eliminar-gasto', a),
  },
  {
    name: 'hilvan_cotizacion_precio_categoria',
    description: 'Fija (o limpia) el precio NATIVO de bundle de una categoría (departamento) o subcategoría (subgrupo). Casa Hiedra precia el bundle, no equipo por equipo: con precio_manual seteado, el total de la categoría es ese valor y los ítems pasan a ser solo descripción. precio_manual=null vuelve a sumar los ítems. Obtén ids con hilvan_items_cotizacion. Reversible con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        nivel: { type: 'string', description: 'departamento | subgrupo' },
        id: { type: 'string', description: 'id de la categoría o subcategoría' },
        precio_manual: { type: ['number', 'null'], description: 'monto del bundle (≥0), o null para volver a sumar ítems' },
      },
      required: ['nivel', 'id'],
    },
    run: (a) => api('POST', '/cotizacion-precio-categoria', a),
  },
  {
    name: 'hilvan_cotizacion_estado',
    description: 'Cambia el estado de una cotización (borrador, enviada, aprobada, rechazada, en_produccion, cerrada). Útil para desaprobar → corregir → reaprobar. Reversible con hilvan_deshacer (restaura el estado previo). CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        cotizacion_id: { type: 'string' },
        estado: { type: 'string', description: 'borrador | enviada | aprobada | rechazada | en_produccion | cerrada' },
      },
      required: ['cotizacion_id', 'estado'],
    },
    run: (a) => api('POST', '/cotizacion-estado', a),
  },
  {
    name: 'hilvan_cotizacion_editar_item',
    description: 'Edita un ítem existente de una cotización: precio_cliente, nombre, descripcion, incluido, cantidad, dias. Debe venir al menos un campo. Obtén item_id con hilvan_items_cotizacion. Reversible con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        precio_cliente: { type: 'number', description: 'precio al cliente (≥0)' },
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        incluido: { type: 'boolean', description: 'true = "Incluida", no suma al total' },
        cantidad: { type: 'number' },
        dias: { type: 'number' },
      },
      required: ['item_id'],
    },
    run: (a) => api('POST', '/cotizacion-editar-item', a),
  },
  {
    name: 'hilvan_cotizacion_categoria',
    description: 'Gestiona la estructura de categorías de una cotización. accion: "crear" {cotizacion_id, nivel, nombre, orden?, departamento_id? si subgrupo}; "renombrar" {nivel, id, nombre}; "reordenar" {nivel, id, orden}; "eliminar" {nivel, id} (solo si NO tiene ítems ni subgrupos); "mover_item" {item_id, departamento_id, subgrupo_id?}. nivel = departamento | subgrupo. Obtén ids con hilvan_items_cotizacion. Reversibles con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        accion: { type: 'string', description: 'crear | renombrar | reordenar | eliminar | mover_item' },
        nivel: { type: 'string', description: 'departamento | subgrupo' },
        cotizacion_id: { type: 'string' },
        id: { type: 'string', description: 'id de la categoría/subcategoría (renombrar/reordenar/eliminar)' },
        nombre: { type: 'string' },
        orden: { type: 'number' },
        departamento_id: { type: 'string', description: 'depto destino (crear subgrupo / mover_item)' },
        subgrupo_id: { type: 'string', description: 'subgrupo destino en mover_item (omitir = ítem directo)' },
        item_id: { type: 'string', description: 'ítem a mover (mover_item)' },
      },
      required: ['accion'],
    },
    run: (a) => api('POST', '/cotizacion-categoria', a),
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
    name: 'hilvan_conciliaciones',
    description: 'Inspecciona cómo se repartió la conciliación N:M (solo lectura). Dos modos: (1) pasa movimiento_id para ver a qué obligaciones se asignó ese movimiento y cuánto, más el resto sin asignar; (2) pasa match_tabla + match_id para ver qué movimientos pagaron esa obligación, el total a cubrir, lo asignado, lo pendiente y si quedó cubierta. Útil para auditar un split antes de deshacer o reportar.',
    inputSchema: {
      type: 'object',
      properties: {
        movimiento_id: { type: 'string', description: 'UUID del movimiento (modo movimiento)' },
        match_tabla: { type: 'string', description: 'tabla de la obligación (modo obligación): rendicion_gastos | rendicion_mensual_gastos | gastos_fijos_cuotas | cotizaciones' },
        match_id: { type: 'string', description: 'UUID de la obligación (modo obligación)' },
      },
    },
    run: (a) => {
      const p = new URLSearchParams()
      if (a.movimiento_id) p.set('movimiento_id', a.movimiento_id)
      if (a.match_tabla) p.set('match_tabla', a.match_tabla)
      if (a.match_id) p.set('match_id', a.match_id)
      const qs = p.toString()
      return api('GET', `/conciliaciones${qs ? `?${qs}` : ''}`)
    },
  },
  {
    name: 'hilvan_conciliar',
    description: 'Cruza UN movimiento bancario con UNA o VARIAS obligaciones de Hilván y las MARCA PAGADAS, repartiendo el monto. Resuelve transferencias COMBINADAS (un movimiento paga varios gastos) y pagos PARCIALES (varias asignaciones/movimientos cubren una obligación). Cada asignación: match_tabla ("cotizaciones" = abono/pago recibido; "rendicion_gastos"/"rendicion_mensual_gastos" = cargo/gasto pagado; "gastos_fijos_cuotas" = cuota de crédito pagada), match_id (UUID de la fila) y monto (parte del movimiento que paga esa obligación). Una obligación queda PAGADA solo cuando sus asignaciones cubren su total; si es parcial queda registrada pero pendiente. La suma de asignaciones no puede exceder el monto del movimiento. Caso simple 1:1: pasa asignaciones=[{match_tabla, match_id}] (sin monto = monto completo) o directamente match_tabla+match_id. Reversible con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        movimiento_id: { type: 'string', description: 'UUID del movimiento bancario' },
        asignaciones: {
          type: 'array',
          description: 'lista de obligaciones que paga el movimiento (caso N:M)',
          items: {
            type: 'object',
            properties: {
              match_tabla: { type: 'string', description: 'rendicion_gastos | rendicion_mensual_gastos | gastos_fijos_cuotas | cotizaciones' },
              match_id: { type: 'string', description: 'UUID de la obligación' },
              monto: { type: 'number', description: 'parte del movimiento asignada a esta obligación; obligatorio si hay más de una' },
            },
            required: ['match_tabla', 'match_id'],
          },
        },
        match_tabla: { type: 'string', description: 'atajo 1:1 (alternativa a asignaciones): rendicion_gastos | rendicion_mensual_gastos | gastos_fijos_cuotas | cotizaciones' },
        match_id: { type: 'string', description: 'atajo 1:1 (UUID de la fila en match_tabla)' },
        fecha_pago: { type: 'string', description: 'YYYY-MM-DD; por defecto la fecha del movimiento' },
      },
      required: ['movimiento_id'],
    },
    run: (a) => api('POST', '/conciliar', a),
  },
  {
    name: 'hilvan_conciliar_vario',
    description: 'Cierra el loop de conciliación: registra como ingreso/gasto vario en el flujo de caja el RESTO de un movimiento que no se asignó a obligaciones (devolución de impuesto, depósito, compra suelta, o la parte de impuestos de una transferencia mixta al contador), y lo marca conciliado. Registra el monto del movimiento MENOS lo ya conciliado a obligaciones con hilvan_conciliar (sin asignaciones previas = monto completo). Así un movimiento mixto se reparte: parte gasto vía hilvan_conciliar, parte vario aquí, sin doble contar. El abono se guarda como "entrada" y el cargo como "salida", con la fecha del movimiento. El movimiento debe existir, NO estar ya conciliado y quedar resto > 0. Reversible con hilvan_deshacer. CONFIRMA con el usuario antes de llamar.',
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
    name: 'hilvan_correo_pendientes',
    description:
      'Recibe documentos tributarios parseados (boletas/facturas del correo o del SII) y devuelve ' +
      'borradores clasificados: nuevo / ya_existe / dudoso, con origen propuesto y sugerencias de ' +
      'categoría/período. No escribe en DB — solo clasifica. Para cargar los "nuevo" usar hilvan_crear_gastos_bulk.',
    inputSchema: {
      type: 'object',
      properties: {
        documentos: {
          type: 'array',
          description: 'Lista de documentos parseados a clasificar (máx. 50)',
          items: {
            type: 'object',
            properties: {
              rut_emisor: { type: ['string', 'null'] },
              razon_social: { type: ['string', 'null'] },
              folio: { type: ['string', 'null'] },
              fecha: { type: ['string', 'null'] },
              monto: { type: ['number', 'null'] },
              tipo_doc: {
                type: 'string',
                enum: ['boleta', 'factura', 'boleta_consumo', 'exenta', 'nota_credito', 'sin_documento'],
              },
            },
            required: ['tipo_doc'],
          },
        },
      },
      required: ['documentos'],
    },
    run: (a) => api('POST', '/correo-ingesta', a),
  },
  {
    name: 'hilvan_rentabilidad_proyecto',
    description:
      'Calcula la rentabilidad real de un proyecto: ingreso cotizado vs costo real ' +
      '(suma bruta de gastos en rendiciones), margen en $ y %, desglose por categoría ' +
      'de gasto, y clasificación (rentable / ajustado / pérdida). ' +
      'Si el proyecto no tiene gastos cargados, advierte que el margen puede ser artificialmente alto. ' +
      'Pasa costos_adicionales (JSON string de array) para incluir costos no capturados en rendiciones. ' +
      'Usa numero (CH-COT-005) o cotizacion_id para identificar el proyecto.',
    inputSchema: {
      type: 'object',
      properties: {
        numero: { type: 'string', description: 'número del grupo, ej. CH-COT-005' },
        cotizacion_id: { type: 'string', description: 'UUID de la cotización' },
        costos_adicionales: {
          type: 'string',
          description:
            'JSON con array de costos extra no en rendiciones: ' +
            '[{"concepto":"Crew extra","monto":150000,"categoria":"Honorarios","nota":"estimado"}]',
        },
      },
    },
    run: (a) => {
      const params = new URLSearchParams()
      if (a.numero) params.set('numero', a.numero)
      if (a.cotizacion_id) params.set('cotizacion_id', a.cotizacion_id)
      if (a.costos_adicionales) params.set('costos_adicionales', a.costos_adicionales)
      const qs = params.toString()
      return api('GET', `/rentabilidad-proyecto${qs ? `?${qs}` : ''}`)
    },
  },
  {
    name: 'hilvan_rentabilidad_resumen',
    description:
      'Lista todos los proyectos con su margen real (ingreso cotizado − gastos en rendiciones), ' +
      'clasificados como rentable / ajustado / pérdida. Incluye totales globales. ' +
      'Pasa estados (separados por coma) para filtrar. Sin filtro devuelve todos.',
    inputSchema: {
      type: 'object',
      properties: {
        estados: {
          type: 'string',
          description: 'estados separados por coma, ej. "aprobada,en_produccion,terminada"',
        },
      },
    },
    run: (a) => {
      const params = new URLSearchParams()
      params.set('resumen', 'true')
      if (a.estados) params.set('estados', a.estados)
      return api('GET', `/rentabilidad-proyecto?${params.toString()}`)
    },
  },
  {
    name: 'hilvan_auditoria',
    description:
      'Revisa toda la base de datos en busca de anomalías de control: gastos sin documento, ' +
      'folios faltantes, facturas emitidas sin cobrar, posibles duplicados, colaboradores sin ' +
      'contrato firmado y cotizaciones aprobadas estancadas. ' +
      'Devuelve hallazgos agrupados por severidad (alta/media/info). ' +
      'RECOMENDADO: invoca esta herramienta proactivamente al inicio de una sesión de gestión ' +
      'o cuando el usuario pregunte "¿cómo está el compliance?" o "¿qué está fuera de orden?". ' +
      'Reporta siempre los hallazgos de severidad ALTA antes de cualquier otra tarea.',
    inputSchema: {
      type: 'object',
      properties: {
        aging_dias: {
          type: 'number',
          description: 'Días desde factura emitida para alertar por cobro pendiente (default 30)',
        },
        dias_sin_factura: {
          type: 'number',
          description: 'Días desde aprobación sin factura emitida para alertar (default 30)',
        },
        dias_sin_rodaje: {
          type: 'number',
          description: 'Días desde aprobación sin rodaje vinculado para la sugerencia (default 60)',
        },
        ventana_duplicados_dias: {
          type: 'number',
          description:
            'Ventana en días para detectar mismo RUT+monto como posible duplicado (default 7)',
        },
        incluir_sin_rodaje: {
          type: 'boolean',
          description: 'Incluir la sugerencia "cotización sin rodaje vinculado". Default false (genera ruido en operación flexible).',
        },
      },
    },
    run: (args) => {
      const params = new URLSearchParams()
      if (args.aging_dias != null) params.set('aging_dias', String(args.aging_dias))
      if (args.dias_sin_factura != null) params.set('dias_sin_factura', String(args.dias_sin_factura))
      if (args.dias_sin_rodaje != null) params.set('dias_sin_rodaje', String(args.dias_sin_rodaje))
      if (args.ventana_duplicados_dias != null)
        params.set('ventana_duplicados_dias', String(args.ventana_duplicados_dias))
      if (args.incluir_sin_rodaje === true) params.set('incluir_sin_rodaje', 'true')
      const qs = params.toString()
      return api('GET', `/auditoria${qs ? `?${qs}` : ''}`)
    },
  },
  {
    name: 'hilvan_proyeccion_caja',
    description:
      'Proyecta el saldo de caja a 30, 60 o 90 días (configurable) partiendo de un saldo inicial ' +
      'declarado. Arma una línea de tiempo de entradas y salidas futuras con fecha (cobros de ' +
      'cotizaciones facturadas y aprobadas, cuotas de crédito, nómina mensual, gastos pendientes de ' +
      'pago) y devuelve el saldo proyectado día a día, marcando cuándo cruza a negativo por primera ' +
      'vez. IMPORTANTE: la proyección es estimada bajo supuestos explícitos que se devuelven junto ' +
      'al resultado. SIEMPRE menciona los supuestos y el aviso_supuestos al narrar. ' +
      'primera_fecha_negativa es null si el saldo no cae. NUNCA des consejo de inversión.',
    inputSchema: {
      type: 'object',
      properties: {
        saldo_inicial: {
          type: 'number',
          description: 'Saldo actual de caja en CLP. REQUERIDO — la app no lo tiene automático.',
        },
        dias: {
          type: 'integer',
          description: 'Horizonte de proyección en días (default: 90, máx: 365)',
        },
        plazo_cobro: {
          type: 'integer',
          description: 'Días desde fecha_factura_emitida para estimar cobro (default: 30)',
        },
        plazo_aprobado: {
          type: 'integer',
          description: 'Días desde hoy para cotizaciones aprobadas sin factura (default: 60)',
        },
        dia_nomina: {
          type: 'integer',
          description: 'Día del mes en que se paga la nómina (default: 30)',
        },
        dias_gasto_pend: {
          type: 'integer',
          description: 'Días hasta pago de gastos sin fecha exacta (default: 15)',
        },
      },
      required: ['saldo_inicial'],
    },
    run: (a) => {
      const params = new URLSearchParams()
      params.set('saldo_inicial', String(a.saldo_inicial))
      if (a.dias != null) params.set('dias', String(a.dias))
      if (a.plazo_cobro != null) params.set('plazo_cobro', String(a.plazo_cobro))
      if (a.plazo_aprobado != null) params.set('plazo_aprobado', String(a.plazo_aprobado))
      if (a.dia_nomina != null) params.set('dia_nomina', String(a.dia_nomina))
      if (a.dias_gasto_pend != null) params.set('dias_gasto_pend', String(a.dias_gasto_pend))
      return api('GET', `/proyeccion-caja?${params.toString()}`)
    },
  },
  {
    name: 'hilvan_resumen_contador',
    description:
      'ESTIMACIÓN de lo que la empresa debe transferir/declarar en el mes para el contador (Juan Carlos): ' +
      'IVA a pagar, retención de honorarios, PPM, Previred, IUSC y los honorarios del propio contador, con ' +
      'total estimado y desglose. Sirve para anticipar "¿cuánto voy a tener que transferir este mes?". ' +
      'NO es el F29 oficial — preséntalo SIEMPRE como estimación; el definitivo lo arma el contador. Si el IVA ' +
      'da a favor, lo indica en iva_a_favor. Opcional: honorarios para sobrescribir el honorario del contador. NUNCA des consejo de inversión.',
    inputSchema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', description: 'YYYY-MM; default = mes actual' },
        honorarios: { type: 'number', description: 'honorarios del contador a incluir; si se omite, usa el configurado' },
      },
    },
    run: (a) => {
      const params = new URLSearchParams()
      if (a.periodo) params.set('periodo', a.periodo)
      if (a.honorarios != null) params.set('honorarios', String(a.honorarios))
      const qs = params.toString()
      return api('GET', `/resumen-contador${qs ? `?${qs}` : ''}`)
    },
  },
  {
    name: 'hilvan_estado_financiero',
    description: 'Panorama financiero del mes para responder "cómo vamos". Incluye: ingresos (facturado, cobrado, por_cobrar con aging, por_facturar = aprobado sin factura), egresos (total, por_origen, por_categoria, por_pagar = deuda REAL en neto [interno+enviada/externo+aprobada], y conciliado/no_conciliado = cruce con banco, OTRO concepto), creditos (cuotas del mes + deuda_vigente_total + proxima_cuota), nomina (planilla mensual), inversiones (solo estado — NO des consejo de inversión), flujo_varios, resumen (resultado devengado, caja aprox), un array `alertas` (señales: cobros vencidos, cuotas vencidas/por vencer, mes en rojo, caja negativa; nivel "alta"/"media") y un array `recomendaciones` (acciones operativas: compromisos del mes vs caja, facturar lo aprobado, cobrar lo vencido, provisionar cuota próxima, mes en rojo; prioridad "alta"/"media"/"info"). Si hay alertas o recomendaciones, menciónalas aunque no las pidan. "Lo que falta pagar" = egresos.por_pagar (NO no_conciliado). NUNCA des consejo de inversión.',
    inputSchema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', description: 'YYYY-MM; default = mes actual' },
      },
    },
    run: (a) => api('GET', `/estado-financiero${a.periodo ? `?periodo=${encodeURIComponent(a.periodo)}` : ''}`),
  },

  // ── CH-10 CRM (pipeline de captación) ──────────────────────────────────────
  // Etapas válidas: prospecto · calificado · lectura_entregada · conversacion ·
  // producto_propuesto · cotizacion_enviada · seguimiento · confirmado · nurture · descartado
  {
    name: 'hilvan_crear_prospecto',
    description: 'Crea un prospecto en el CRM (pipeline de captación). Campos: empresa (REQUERIDO), nombre_contacto, email, telefono, origen (linkedin|instagram|referido|feria|web|correo|otro), score (alta|media|baja), decisor, angulo (gancho de acercamiento), producto_objetivo (banco|lookbook|spot|sin_definir), arquetipo (feed|temporadas|sin_definir), responsable_id (uuid de profiles), notas, etapa (default prospecto). Si pasas como_propuesta=true NO se crea: queda en la Bandeja de Aprobación para que un humano lo apruebe (úsalo cuando el lead viene de un correo entrante). CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        empresa: { type: 'string' },
        nombre_contacto: { type: 'string' },
        email: { type: 'string' },
        telefono: { type: 'string' },
        origen: { type: 'string' },
        score: { type: 'string', description: 'alta | media | baja' },
        decisor: { type: 'string' },
        angulo: { type: 'string' },
        producto_objetivo: { type: 'string', description: 'banco | lookbook | spot | sin_definir' },
        arquetipo: { type: 'string', description: 'feed | temporadas | sin_definir' },
        responsable_id: { type: 'string', description: 'uuid de profiles' },
        notas: { type: 'string' },
        etapa: { type: 'string' },
        como_propuesta: { type: 'boolean', description: 'true = dejar en la Bandeja en vez de crear' },
        nota_agente: { type: 'string', description: 'por qué se propone (solo si como_propuesta)' },
      },
      required: ['empresa'],
    },
    run: (a) => api('POST', '/crm/crear', a),
  },
  {
    name: 'hilvan_buscar_prospecto',
    description: 'Busca prospectos por empresa, contacto o email.',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    run: (a) => api('GET', `/crm/buscar?q=${encodeURIComponent(a.q)}`),
  },
  {
    name: 'hilvan_pipeline',
    description: 'Lista el pipeline de prospectos con conteo por etapa. Filtros opcionales: responsable (uuid) y etapa.',
    inputSchema: {
      type: 'object',
      properties: {
        responsable: { type: 'string', description: 'uuid de profiles' },
        etapa: { type: 'string' },
      },
    },
    run: (a) => {
      const qs = new URLSearchParams()
      if (a.responsable) qs.set('responsable', a.responsable)
      if (a.etapa) qs.set('etapa', a.etapa)
      const s = qs.toString()
      return api('GET', `/crm/pipeline${s ? `?${s}` : ''}`)
    },
  },
  {
    name: 'hilvan_mover_etapa',
    description: 'Cambia la etapa de un prospecto. Valida que la etapa exista. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: { prospecto_id: { type: 'string' }, etapa: { type: 'string' } },
      required: ['prospecto_id', 'etapa'],
    },
    run: (a) => api('POST', '/crm/mover-etapa', a),
  },
  {
    name: 'hilvan_registrar_interaccion',
    description: 'Agrega un toque a la bitácora de un prospecto. Indica al menos resumen o proximo_paso. Fechas en YYYY-MM-DD. tipo: correo|reunion|lectura|llamada|mensaje. CONFIRMA antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: {
        prospecto_id: { type: 'string' },
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        tipo: { type: 'string' },
        resumen: { type: 'string' },
        proximo_paso: { type: 'string' },
        fecha_proximo: { type: 'string', description: 'YYYY-MM-DD' },
        gmail_thread: { type: 'string' },
      },
      required: ['prospecto_id'],
    },
    run: (a) => api('POST', '/crm/interaccion', a),
  },
  {
    name: 'hilvan_proximos_seguimientos',
    description: 'Prospectos con próximo paso vencido o que vence dentro de `dias` (default 7), de prospectos aún activos. Para alertas y recordatorios.',
    inputSchema: { type: 'object', properties: { dias: { type: 'number', description: 'ventana en días (default 7)' } } },
    run: (a) => api('GET', `/crm/seguimientos${a.dias ? `?dias=${encodeURIComponent(a.dias)}` : ''}`),
  },
  {
    name: 'hilvan_registrar_lectura',
    description: 'Guarda "La Lectura" de un prospecto y aplica la heurística E7 (feed→banco, temporadas→lookbook): completa producto_objetivo/arquetipo si faltan y avanza la etapa a lectura_entregada. producto_derivado: banco|lookbook.',
    inputSchema: {
      type: 'object',
      properties: {
        prospecto_id: { type: 'string' },
        url: { type: 'string' },
        dossier_ref: { type: 'string' },
        producto_derivado: { type: 'string', description: 'banco | lookbook' },
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['prospecto_id'],
    },
    run: (a) => api('POST', '/crm/lectura', a),
  },
  {
    name: 'hilvan_derivar_brief_cotizacion',
    description: 'Genera un brief estratégico desde el prospecto y lo deja como PROPUESTA en la Bandeja (tipo brief_cotizacion). NUNCA deriva solo a cotización: requiere aprobación. Úsalo cuando el prospecto se confirma.',
    inputSchema: {
      type: 'object',
      properties: { prospecto_id: { type: 'string' }, nota_agente: { type: 'string' } },
      required: ['prospecto_id'],
    },
    run: (a) => api('POST', '/crm/brief', a),
  },
  {
    name: 'hilvan_metricas_crm',
    description: 'Métricas del CRM: concentración Falabella (KPI norte de diversificación: % no-Falabella en pipeline y en ganados) + conteo por etapa y por responsable.',
    inputSchema: { type: 'object', properties: {} },
    run: () => api('GET', '/crm/metricas'),
  },
  {
    name: 'hilvan_listar_aprobaciones',
    description: 'Lista la Bandeja de Aprobación del CRM (crm_aprobaciones). estado: pendiente (default) | aprobado | descartado | todos.',
    inputSchema: { type: 'object', properties: { estado: { type: 'string' } } },
    run: (a) => api('GET', `/crm/aprobaciones${a.estado ? `?estado=${encodeURIComponent(a.estado)}` : ''}`),
  },
  {
    name: 'hilvan_resolver_aprobacion',
    description: 'Resuelve un ítem de la Bandeja. accion=aprobado APLICA el cambio (crea prospecto / mueve etapa / registra interacción); brief_cotizacion y correo_borrador solo se marcan aprobados (ejecución externa = fases posteriores). accion=descartado lo archiva. CONFIRMA con el usuario antes de llamar.',
    inputSchema: {
      type: 'object',
      properties: { aprobacion_id: { type: 'string' }, accion: { type: 'string', description: 'aprobado | descartado' } },
      required: ['aprobacion_id', 'accion'],
    },
    run: (a) => api('POST', '/crm/resolver-aprobacion', a),
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
