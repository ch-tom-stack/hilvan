// types/index.ts
//
// Archivo canónico de TIPOS de Hilván. La lógica de negocio (cálculos de
// cotización/rental, retención de rendiciones y helpers de rodaje) vive en
// lib/*-calc.ts y lib/rodaje-helpers.ts desde T12. Aquí solo se REEXPORTA
// para no romper los ~100 imports existentes desde '@/types'.
//
// Reexports al final del archivo:
//   - lib/cotizaciones-calc  → calcularBruto, subtotalItem, ..., formatCLP, rental
//   - lib/rendiciones-calc   → calcularRetencion
//   - lib/rodaje-helpers     → horaAMinutos, calcularCascada, generarMensajeCitacion, ...

// La cadencia se USA en la interfaz Prospecto (no solo se reexporta), así que
// además se importa acá.
import type { Cadencia } from '@/lib/crm-cadencia'

// ============================================================
// AUTH / USUARIOS
// ============================================================
export type Rol = 'admin' | 'productor' | 'colaborador' | 'cliente' | 'contabilidad'

export interface Profile {
  id: string
  email: string
  nombre: string
  rol: Rol
  created_at: string
}

// ============================================================
// EQUIPOS (Chat 1 — no modificar)
// ============================================================
export type EstadoEquipo = 'disponible' | 'en_uso' | 'en_mantenimiento' | 'pendiente_compra'

export interface CategoriaEquipo {
  id: string
  codigo: string
  nombre: string
  orden: number
}

export interface Equipo {
  id: string
  codigo: string
  nombre: string
  categoria_id: string
  categoria_codigo?: string
  categoria?: CategoriaEquipo
  descripcion?: string
  marca?: string
  modelo?: string
  numero_serie?: string
  subcategoria?: string
  estado: EstadoEquipo
  precio_jornada?: number
  fotos?: string[]
  cantidad?: number
  rentable?: boolean
  notas?: string
  created_at: string
}

export interface MaletaNota {
  id: string
  maleta_id: string
  contenido: string
  created_at: string
  created_by?: string
  autor?: Profile
  autor_nombre?: string
}

export interface Maleta {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  foto_url?: string
  foto_empaque?: string
  notas?: MaletaNota[]
  items?: MaletaItem[]
  created_at: string
}

export interface MaletaItem {
  id: string
  maleta_id: string
  equipo_id: string
  equipo?: Equipo
  cantidad: number
  notas?: string
}

// ============================================================
// CLIENTES
// ============================================================
export interface Cliente {
  id: string
  nombre: string
  empresa?: string
  email?: string
  telefono?: string
  rut?: string
  direccion?: string
  ciudad?: string | null
  pais?: string | null
  parent_id?: string | null
  parent?: Cliente | null
  notas?: string | null
  created_at: string
  updated_at?: string
  created_by?: string
}

export interface ClienteContacto {
  id: string
  cliente_id: string
  nombre: string
  cargo?: string | null
  email?: string | null
  telefono?: string | null
  area?: string | null
  notas?: string | null
  created_at: string
  updated_at?: string
}

export interface ProyectoContacto {
  id: string
  proyecto_id: string
  contacto_id: string
  contacto?: ClienteContacto
  rol_en_proyecto?: string | null
}

export interface ProyectoTarea {
  id: string
  proyecto_id: string
  texto: string
  completada: boolean
  created_at: string
}

// ============================================================
// PROYECTOS
// ============================================================
export type EstadoProyecto =
  | 'prospecto'
  | 'activo'
  | 'en_rodaje'
  | 'post'
  | 'entregado'
  | 'cerrado'
  | 'cancelado'

export const ESTADO_PROYECTO_LABELS: Record<EstadoProyecto, string> = {
  prospecto:  'Prospecto',
  activo:     'Activo',
  en_rodaje:  'En rodaje',
  post:       'Post',
  entregado:  'Entregado',
  cerrado:    'Cerrado',
  cancelado:  'Cancelado',
}

export const ESTADO_PROYECTO_ACTIVOS: EstadoProyecto[] = ['prospecto', 'activo', 'en_rodaje', 'post']

export interface Proyecto {
  id: string
  nombre: string
  cliente_id?: string | null
  cliente?: Cliente
  estado: EstadoProyecto
  descripcion?: string | null
  notas?: string | null
  fecha_inicio?: string | null
  fecha_cierre?: string | null
  created_at: string
  updated_at?: string
  created_by?: string
}

// ============================================================
// TARIFAS BASE
// ============================================================
export type TipoItem =
  | 'rol'
  | 'equipo_ch'
  | 'equipo_externo'
  | 'servicio'
  | 'consumible'
  | 'post_produccion'
  | 'locacion'
  | 'cast'
  | 'otro'

export type UnidadItem = 'día' | 'hora' | 'jornada' | 'unidad' | 'proyecto'

export interface TarifaBase {
  id: string
  tipo: TipoItem
  nombre: string
  descripcion?: string
  precio_referencial: number
  unidad: UnidadItem
  activo: boolean
  created_at: string
}

// ============================================================
// COTIZACIONES
// ============================================================
export type EstadoCotizacion =
  | 'borrador'
  | 'enviada'
  | 'aprobada'
  | 'rechazada'
  | 'en_produccion'
  | 'cerrada'

export type FormatoPDF = 'simple' | 'detallado'
export type TipoDescuento = 'porcentaje' | 'monto'

// --- Grupo (familia de versiones y variantes) ---
export interface Etiqueta {
  id: string
  texto: string
  color: string
  created_at: string
}

export interface CotizacionGrupo {
  id: string
  numero_base: string
  cliente_id?: string
  cliente?: Cliente
  proyecto_id?: string
  proyecto?: Proyecto
  created_at: string
  created_by?: string
  cotizaciones?: Cotizacion[]
  etiquetas?: Etiqueta[]
}

// --- Cotización (una versión/variante específica) ---
export interface Cotizacion {
  id: string
  grupo_id: string
  grupo?: CotizacionGrupo
  version: number
  variante?: string | null
  copiada_de?: string

  nombre: string
  cliente_id?: string
  cliente?: Cliente
  cliente_nombre_libre?: string
  cliente_email_libre?: string
  proyecto_id?: string
  proyecto?: Proyecto

  estado: EstadoCotizacion
  token?: string
  fecha_envio?: string
  fecha_respuesta_cliente?: string
  comentario_cliente?: string
  fecha_factura_emitida?: string | null
  fecha_pago_recibido?: string | null
  numero_factura?: string | null

  con_iva: boolean
  formato_pdf: FormatoPDF
  descuento_global: number
  descuento_global_tipo: TipoDescuento

  descripcion?: string
  notas_internas?: string
  notas_cliente?: string

  // Header del documento
  cliente_final?: string | null
  medios?: string | null
  referencia?: string | null
  solicita?: string | null

  created_at: string
  updated_at: string
  created_by?: string

  departamentos?: CotizacionDepartamento[]
}

// Número visible — calculado, nunca almacenado
export function numeroCotizacion(c: {
  grupo?: { numero_base: string }
  version: number
  variante?: string | null
}): string {
  const base = c.grupo?.numero_base ?? '—'
  if (c.version === 1 && !c.variante) return base
  const v = `v${c.version}`
  const var_ = c.variante ? `-${c.variante}` : ''
  return `${base} ${v}${var_}`
}

// --- Departamento ---
export interface CotizacionDepartamento {
  id: string
  cotizacion_id: string
  nombre: string
  orden: number
  /** Precio nativo del bundle. Si está seteado, el total de la categoría es este
   *  valor (ignora la suma de ítems) y los ítems se muestran solo como descripción. */
  precio_manual?: number | null
  subgrupos?: CotizacionSubgrupo[]
  items?: CotizacionItem[]
}

// --- Sub-grupo ---
export interface CotizacionSubgrupo {
  id: string
  cotizacion_id: string
  departamento_id: string
  nombre: string
  orden: number
  /** Precio nativo del bundle a nivel de subcategoría (ver CotizacionDepartamento.precio_manual). */
  precio_manual?: number | null
  items?: CotizacionItem[]
}

// --- Ítem ---
export interface CotizacionItem {
  id: string
  cotizacion_id: string
  departamento_id: string
  subgrupo_id?: string | null

  tipo: TipoItem
  equipo_id?: string | null
  equipo?: Equipo
  tarifa_id?: string | null
  tarifa?: TarifaBase

  nombre: string
  descripcion?: string

  con_boleta: boolean
  tasa_boleta: number
  precio_neto_proveedor: number
  precio_bruto: number
  precio_cliente_personalizado: boolean
  precio_cliente: number

  cantidad: number
  dias: number
  unidad: UnidadItem

  incluido: boolean

  descuento_item: number
  descuento_item_tipo: TipoDescuento

  orden: number
  created_at: string

  // calculados (desde vista cotizacion_items_totales)
  subtotal_cliente?: number
  costo_real?: number
  margen?: number
}

// ============================================================
// HELPERS DE CÁLCULO + FORMATO CLP
// ============================================================
// Movidos a lib/cotizaciones-calc.ts (T12). Reexportados al final del archivo:
//   calcularBruto, subtotalItem, subtotalSubgrupo, subtotalDepartamento,
//   calcularTotales, TotalesCotizacion, formatCLP.

// ─── RODAJE ───────────────────────────────────────
export type EstadoRodaje = 'borrador' | 'confirmado' | 'completado'
export type VisibilidadPlan = 'ninguna' | 'completo' | 'segmento'

export interface Rodaje {
  id: string
  nombre: string
  fecha?: string
  fecha_confirmada: boolean
  proyecto_id?: string
  proyecto?: Proyecto
  cotizacion_id?: string
  cotizacion?: Cotizacion
  locacion_nombre?: string
  locacion_direccion?: string
  locacion_lat?: number
  locacion_lng?: number
  hora_llamado_general?: string
  estado: EstadoRodaje
  visibilidad_plan: VisibilidadPlan
  notas_generales?: string
  chiste_texto?: string
  chiste_imagen_url?: string
  cliente_logo_url?: string
  created_by?: string
  created_at: string
  updated_at: string
  departamentos?: RodajeDepartamento[]
  equipo_tecnico?: RodajeEquipoTecnico[]
  escenas?: RodajeEscena[]
  etiquetas?: Etiqueta[]
}

export interface RodajeDepartamento {
  id: string
  rodaje_id: string
  nombre: string
  hora_llamado?: string
  orden: number
  miembros?: RodajeEquipoTecnico[]
}

export interface Colaborador {
  id: string
  nombre: string
  rut?: string
  email?: string
  telefono?: string
  tipo_persona?: 'natural' | 'empresa'
  razon_social?: string
  tipo_documento?: 'boleta' | 'bet' | 'factura' | 'sin_documento' | 'contratado'
  alerta_tributaria?: string
  banco?: string
  tipo_cuenta?: 'corriente' | 'vista' | 'ahorro'
  numero_cuenta?: string
  disponible: boolean
  requiere_release: boolean
  contrato_marco: boolean
  especialidades?: string[]
  notas_internas?: string
  rol_habitual?: string
  notas?: string
  restricciones_alimentarias?: string
  created_at: string
  updated_at: string
}

export interface ColaboradorTarifa {
  id: string
  colaborador_id: string
  rodaje_id?: string
  rodaje?: { nombre: string; fecha?: string }
  rol?: string
  monto_dia: number
  created_at: string
}

export interface ColaboradorLinkTemporal {
  id: string
  colaborador_id: string
  rodaje_id?: string
  tipo: 'rendicion' | 'onboarding'
  token: string
  expires_at: string
  used_at?: string
  created_at: string
}

export type TipoRendicion = 'honorarios' | 'arte' | 'transporte' | 'alimentacion' | 'insumos' | 'servicios' | 'viaticos' | 'otro'
export type EstadoRendicion = 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'pago_aprobado'
export type TipoDocRendicion = 'boleta' | 'boleta_consumo' | 'factura' | 'exenta' | 'sin_documento' | 'nota_credito'

export interface Rendicion {
  id: string
  cotizacion_id: string
  cotizacion?: { id: string; nombre: string; grupo?: { numero_base?: string } }
  estado: EstadoRendicion
  factura_emitida: boolean
  factura_archivos: string[]
  pago_recibido: boolean
  created_at: string
  updated_at: string
  gastos?: RendicionGasto[]
}

export interface RendicionGasto {
  id: string
  rendicion_id: string
  cotizacion_item_id: string | null
  colaborador_id: string | null
  nombre_libre: string | null
  origen: 'interno' | 'externo'
  tipo: TipoRendicion
  descripcion: string
  monto: number
  tipo_documento: TipoDocRendicion | null
  foto_url: string | null
  estado: EstadoRendicion
  motivo_rechazo: string | null
  comprobante_pago_url: string | null
  rut_emisor: string | null
  razon_social_emisor: string | null
  factura_casa_hiedra: boolean
  pagado?: boolean
  fecha_pago?: string | null
  documento_recibido?: boolean
  created_at: string
  updated_at: string
  colaborador?: { id: string; nombre: string; email: string; banco?: string; tipo_cuenta?: string; numero_cuenta?: string; rut?: string } | null
  cotizacion_item?: { id: string; nombre: string; tipo: string } | null
}

export interface RendicionNotaGlosa {
  id: string
  cotizacion_item_id: string
  autor_id?: string
  autor?: { nombre?: string; email?: string }
  nota: string
  created_at: string
}

export type TipoContrato = 'marco_equipo' | 'marco_modelo' | 'marco_empresa' | 'release'

export interface ContratoGenerado {
  id: string
  colaborador_id: string
  rodaje_id?: string
  rodaje?: { nombre: string }
  tipo: TipoContrato
  archivo_url?: string
  firmado: boolean
  created_at: string
}

// ============================================================
// RENDICIÓN MENSUAL
// ============================================================
export type EstadoRendicionMensual = 'pendiente' | 'aprobado' | 'pagado'

export const CATEGORIAS_RENDICION_MENSUAL = [
  'Honorarios',
  'Transporte',
  'Alimentación',
  'Artículos de oficina',
  'Insumos de rodaje',
  'Suscripciones',
  'Otros',
] as const

export interface RendicionMensual {
  id: string
  periodo: string
  presupuesto: number
  estado: EstadoRendicionMensual
  notas: string | null
  created_at: string
  updated_at: string
  gastos?: RendicionMensualGasto[]
}

export interface RendicionMensualGasto {
  id: string
  rendicion_mensual_id: string
  descripcion: string
  monto: number
  categoria: string | null
  archivo_url: string | null
  cargado_por: string
  cargado_por_id: string | null
  tipo_documento: string | null
  rut_emisor: string | null
  razon_social_emisor: string | null
  factura_casa_hiedra: boolean
  pagado?: boolean
  fecha_pago?: string | null
  documento_recibido?: boolean
  created_at: string
}

// calcularRetencion movido a lib/rendiciones-calc.ts (T12) — reexportado al final.

export interface RodajeEquipoTecnico {
  id: string
  rodaje_id: string
  departamento_id?: string
  departamento?: RodajeDepartamento
  colaborador_id?: string
  colaborador?: Colaborador
  nombre: string
  rol?: string
  email?: string
  telefono?: string
  es_jefe_departamento: boolean
  hora_llamado_individual?: string
  created_at: string
  updated_at: string
  citacion?: RodajeCitacion
}

export interface RodajeEscena {
  id: string
  rodaje_id: string
  orden: number
  titulo: string
  descripcion?: string
  hora_estimada?: string
  duracion_min?: number
  locacion_especifica?: string
  notas?: string
  visible_en_citacion: boolean
}

export interface RodajeCitacion {
  id: string
  rodaje_id: string
  persona_id: string
  persona?: RodajeEquipoTecnico
  token: string
  mensaje_personalizado?: string
  whatsapp_enviado: boolean
  whatsapp_enviado_at?: string
  email_enviado_at?: string
  recordatorio_enviado_at?: string
  respondida_at?: string
  confirmada?: boolean
  restricciones_alimentarias?: string
  created_at: string
  updated_at: string
  rodaje?: Rodaje
}

// Helpers de citación/horas movidos a lib/rodaje-helpers.ts (T12) —
// reexportados al final: resolverHoraLlamado, formatHora, generarMensajeCitacion,
// generarLinkCalendar, generarLinkUber, estadoCitacion.

export interface RodajeLocacion {
  id: string
  rodaje_id: string
  nombre: string
  direccion?: string
  lat?: number
  lng?: number
  es_principal: boolean
  orden: number
  notas?: string
  created_at: string
  updated_at: string
}

export type TipoBloque = 'rodaje' | 'pausa' | 'traslado' | 'montaje' | 'otro' | 'libre'

// Estilo expresivo de un bloque (devuelve la "libertad del Google Sheet" al plan):
// fuente de un set curado, color de texto/fondo, tamaño, peso y alineación.
export interface BloqueEstilo {
  fuente?: string // clave del set curado (ver FUENTES_PLAN), ej. 'manuscrita'
  color?: string // color del texto
  color_fondo?: string // color de fondo del bloque
  tamano?: 'sm' | 'md' | 'lg' | 'xl'
  peso?: 'thin' | 'normal' | 'bold'
  align?: 'left' | 'center' | 'right'
}

export interface RodajeBloque {
  id: string
  rodaje_id: string
  padre_id?: string
  orden: number
  titulo: string
  tipo: TipoBloque
  scenes_label?: string
  scenes_color?: string
  character_num?: string
  dia_noche?: 'D' | 'N'
  interior_exterior?: 'I' | 'E' | '-'
  locacion_id?: string
  locacion?: RodajeLocacion
  descripcion?: string
  nota_previa?: string
  hora_inicio_fija?: string
  hora_fin?: string
  duracion_min?: number
  es_paralelo: boolean
  es_anclado: boolean
  visible_equipo: boolean
  visible_catering: boolean
  visible_extras: boolean
  visible_cliente: boolean
  imagen_url?: string
  /** Texto libre del bloque "libre" (el lienzo: chistes, notas, lo que sea). */
  contenido_rico?: string
  /** Estilo expresivo del bloque (fuente curada, colores, tamaño, peso). */
  estilo?: BloqueEstilo
  created_at: string
  updated_at: string
  hijos?: RodajeBloque[]
}

// Set CURADO de fuentes con personalidad para el contenido del plan (devuelve la
// expresión del Google Sheet). Se cargan en globals.css. Acotado a propósito: da
// carácter sin romper la consistencia ni complicar el PDF/viewer.
export const FUENTES_PLAN: Array<{ clave: string; label: string; family: string }> = [
  { clave: 'manuscrita', label: 'Manuscrita', family: "'Cedarville Cursive', cursive" },
  { clave: 'mano', label: 'Mano', family: "'Rock Salt', cursive" },
  { clave: 'marcador', label: 'Marcador', family: "'Permanent Marker', cursive" },
  { clave: 'gruesa', label: 'Gruesa', family: "'Oi', system-ui, sans-serif" },
  { clave: 'maquina', label: 'Máquina', family: "'Courier Prime', monospace" },
  { clave: 'grotesk', label: 'Grotesk', family: "'Schibsted Grotesk', sans-serif" },
  { clave: 'fina', label: 'Fina', family: "'Archivo', sans-serif" },
  { clave: 'marca', label: 'Marca', family: "'Cormorant Garamond', serif" },
]

/** Devuelve el font-family CSS de una fuente curada del plan, o undefined. */
export function familiaFuentePlan(clave?: string): string | undefined {
  if (!clave) return undefined
  return FUENTES_PLAN.find((f) => f.clave === clave)?.family
}

// Sticker flotante: imagen o nota de texto que se posa ENCIMA del plan (como en el
// Google Sheet). Posición/tamaño en fracción del ancho del plan (0..1) para que
// escale en distintos tamaños/orientaciones del export. Imágenes en bucket rodaje-imagenes.
export interface RodajeSticker {
  id: string
  rodaje_id: string
  tipo: 'imagen' | 'texto'
  imagen_url?: string
  contenido?: string // texto de la nota
  estilo?: BloqueEstilo // fuente/color/tamaño/peso (notas)
  x: number // 0..1 fracción del ancho del plan
  y: number // 0..1 fracción del alto del plan
  w: number // 0..1 fracción del ancho del plan
  rot: number // grados
  z: number // orden de apilado
  created_at: string
}

// Helpers de cascada/tiempo de bloques movidos a lib/rodaje-helpers.ts (T12) —
// reexportados al final: horaAMinutos, minutosAHora, calcularCascada,
// aplicarCambioTiempo, duracionTotalDia, uberLinkLocacion.

// ============================================================
// MÓDULO FINANCIERO
// ============================================================

export type TipoGastoFijo = 'credito_bancario' | 'prestamo_socio' | 'otro'

export interface GastoFijo {
  id: string
  nombre: string
  descripcion: string | null
  tipo: TipoGastoFijo
  acreedor: string | null
  monto_total: number
  monto_cuota: number
  n_cuotas: number
  dia_vencimiento: number
  fecha_inicio: string
  tasa_interes: number | null
  activo: boolean
  created_at: string
  cuotas?: GastoFijoCuota[]
}

export interface GastoFijoCuota {
  id: string
  gasto_fijo_id: string
  numero_cuota: number
  fecha_vencimiento: string
  monto: number
  pagada: boolean
  fecha_pago: string | null
  created_at: string
}

export type TipoFlujoCaja = 'entrada' | 'salida'

export interface FlujoCajaManual {
  id: string
  descripcion: string
  monto: number
  fecha: string
  tipo: TipoFlujoCaja
  created_at: string
  created_by: string | null
}

// ============================================================
// CONCILIACIÓN BANCARIA
// ============================================================

export type TipoMovimientoBancario = 'cargo' | 'abono'

export interface MovimientoBancario {
  id: string
  fecha: string
  descripcion: string | null
  monto: number
  tipo: TipoMovimientoBancario
  fuente: string | null
  referencia: string | null
  conciliado: boolean
  conciliado_tabla: string | null
  conciliado_id: string | null
  created_at: string
}

// ============================================================
// MÓDULO INVERSIONES
// ============================================================

export type CategoriaInversion =
  | 'equipo_audiovisual'
  | 'vehiculo'
  | 'software'
  | 'consultoria'
  | 'otro'

export type TratamientoContable = 'activo_fijo' | 'gasto_directo'

export type TipoDocInversion = 'factura' | 'sin_documento' | null

export interface Inversion {
  id: string
  categoria: CategoriaInversion
  descripcion: string
  proveedor: string | null
  rut_proveedor: string | null
  fecha_compra: string           // ISO date YYYY-MM-DD
  monto: number                  // entero CLP
  tipo_documento: TipoDocInversion
  factura_casa_hiedra: boolean
  comprobante_url: string | null
  tratamiento_contable: TratamientoContable
  notas: string | null
  created_at: string
  created_by: string | null
}

export const CATEGORIAS_INVERSION: Record<CategoriaInversion, string> = {
  equipo_audiovisual: 'Equipo audiovisual',
  vehiculo: 'Vehículo',
  software: 'Software',
  consultoria: 'Consultoría',
  otro: 'Otro',
}

// ============================================================
// CH-8 CALENDARIO
// ============================================================

export type ClasificacionEvento = 'sin_clasificar' | 'rodaje' | 'reunion' | 'ignorar'
export type EstadoRental = 'pendiente' | 'aprobada' | 'denegada' | 'entregada' | 'devuelta'

export interface EventoCalendario {
  id: string
  google_event_id: string
  titulo: string
  descripcion: string | null
  fecha_inicio: string
  fecha_fin: string
  todo_el_dia: boolean
  clasificacion: ClasificacionEvento
  rodaje_id: string | null
  clasificado_por: string | null
  created_at: string
  updated_at: string
}

export interface RentalReserva {
  id: string
  equipo_id: string | null
  maleta_id: string | null
  cliente_id: string | null
  fecha_inicio: string
  fecha_fin: string
  estado: EstadoRental
  aprobada_por: string | null
  cotizacion_id: string | null
  notas: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// MÓDULO RENTAL — COTIZACIONES
// ============================================================
export type EstadoRentalCotizacion = 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'cerrada'

export const ESTADO_RENTAL_COT_LABELS: Record<EstadoRentalCotizacion, string> = {
  borrador:  'Borrador',
  enviada:   'Enviada',
  aprobada:  'Aprobada',
  rechazada: 'Rechazada',
  cerrada:   'Cerrada',
}

export interface RentalCotizacion {
  id: string
  numero: string
  reserva_id: string | null
  cliente_id: string | null
  cliente?: Cliente
  cliente_nombre_libre?: string | null
  cliente_email_libre?: string | null
  estado: EstadoRentalCotizacion
  con_iva: boolean
  descuento_global: number
  descuento_global_tipo: 'porcentaje' | 'monto'
  notas_internas?: string | null
  notas_cliente?: string | null
  created_at: string
  updated_at: string
  created_by?: string | null
  secciones?: RentalCotizacionSeccion[]
}

export interface RentalCotizacionSeccion {
  id: string
  cotizacion_id: string
  nombre: string
  orden: number
  items?: RentalCotizacionItem[]
}

export interface RentalCotizacionItem {
  id: string
  cotizacion_id: string
  seccion_id?: string | null
  equipo_id?: string | null
  equipo?: Equipo
  maleta_id?: string | null
  maleta?: Maleta
  descripcion: string
  cantidad: number
  dias: number
  precio_unitario: number
  descuento: number
  descuento_tipo: 'porcentaje' | 'monto'
  incluido: boolean
  orden: number
  created_at: string
}

// subtotalRentalItem y calcularTotalesRental movidos a lib/cotizaciones-calc.ts
// (T12) — reexportados al final.

export const CLASIFICACION_LABELS: Record<ClasificacionEvento, string> = {
  sin_clasificar: 'Sin clasificar',
  rodaje:         'Rodaje',
  reunion:        'Reunión',
  ignorar:        'Ignorar',
}

export const CLASIFICACION_COLORES: Record<ClasificacionEvento, string> = {
  sin_clasificar: '#c9a84c',
  rodaje:         '#7a9e7e',
  reunion:        '#6b8cba',
  ignorar:        '#3a3a38',
}

export const PLANTILLAS_BLOQUES: Array<{ label: string; titulo: string; tipo: TipoBloque; duracion_min: number; scenes_color: string; dia_noche: 'D' | 'N'; interior_exterior: 'I' | 'E' | '-' }> = [
  { label: 'CALL',       titulo: 'Call equipo completo',  tipo: 'otro',     duracion_min: 0,  scenes_color: '#353135', dia_noche: 'D', interior_exterior: '-' },
  { label: 'PRE SET',    titulo: 'Preparación de set',    tipo: 'montaje',  duracion_min: 40, scenes_color: '#353135', dia_noche: 'D', interior_exterior: 'I' },
  { label: 'DESAYUNO',   titulo: 'Desayuno equipo',       tipo: 'pausa',    duracion_min: 30, scenes_color: '#353135', dia_noche: 'D', interior_exterior: '-' },
  { label: 'SNACK',      titulo: 'Snack equipo',          tipo: 'pausa',    duracion_min: 15, scenes_color: '#353135', dia_noche: 'D', interior_exterior: '-' },
  { label: 'ALMUERZO',   titulo: 'Almuerzo equipo',       tipo: 'pausa',    duracion_min: 45, scenes_color: '#353135', dia_noche: 'D', interior_exterior: '-' },
  { label: 'TRASLADO',   titulo: 'Traslado a locación',   tipo: 'traslado', duracion_min: 30, scenes_color: '#353135', dia_noche: 'D', interior_exterior: '-' },
  { label: 'DESMONTAJE', titulo: 'Desmontaje de set',     tipo: 'montaje',  duracion_min: 30, scenes_color: '#353135', dia_noche: 'D', interior_exterior: 'I' },
  { label: 'CIERRE',     titulo: 'Cierre jornada',        tipo: 'otro',     duracion_min: 0,  scenes_color: '#353135', dia_noche: 'D', interior_exterior: '-' },
]

// ============================================================
// REEXPORTS DE LÓGICA DE NEGOCIO (T12)
// ============================================================
// Las funciones de cálculo y helpers viven ahora en lib/. Se reexportan aquí
// para no romper los ~100 imports existentes desde '@/types'. El código nuevo
// debería importar directamente desde los módulos lib/ correspondientes.

export {
  calcularBruto,
  subtotalItem,
  subtotalSubgrupo,
  subtotalDepartamento,
  calcularTotales,
  formatCLP,
  subtotalRentalItem,
  calcularTotalesRental,
  type TotalesCotizacion,
} from '@/lib/cotizaciones-calc'

export { calcularRetencion, tasaRetencionBoleta } from '@/lib/rendiciones-calc'

export {
  resolverHoraLlamado,
  formatHora,
  generarMensajeCitacion,
  generarLinkCalendar,
  generarLinkUber,
  estadoCitacion,
  horaAMinutos,
  minutosAHora,
  calcularCascada,
  aplicarCambioTiempo,
  duracionTotalDia,
  uberLinkLocacion,
} from '@/lib/rodaje-helpers'

// ============================================================
// CH-10 CRM (Prospectos / pipeline de captación)
// ============================================================

export type EtapaProspecto =
  | 'prospecto'
  | 'contacto'
  | 'conversacion'
  | 'confirmado'
  | 'en_frio'
  | 'nurture'
  | 'descartado'

export const ETAPA_PROSPECTO_LABELS: Record<EtapaProspecto, string> = {
  prospecto:    'Prospecto',
  contacto:     'Contacto',
  conversacion: 'Conversación',
  confirmado:   'Confirmado',
  en_frio:      'En frío',
  nurture:      'Nurture',
  descartado:   'Descartado',
}

// Columnas del Kanban (en orden de pipeline). Los hitos (Lectura, Producto
// propuesto, Cotización enviada, Reunión) ya NO son etapas: son un checklist
// no ordinal en la tarjeta (ver CHECKLIST_PROSPECTO).
export const ETAPAS_PIPELINE_ACTIVAS: EtapaProspecto[] = [
  'prospecto',
  'contacto',
  'conversacion',
  'confirmado',
  'en_frio',
]

// Etapas donde se registran contactos → contador + correo enviado en la tarjeta.
export const ETAPAS_CON_CONTADOR: EtapaProspecto[] = ['contacto', 'conversacion']

// Etapas que viven en el cajón lateral, fuera del flujo principal
export const ETAPAS_CAJON: EtapaProspecto[] = ['nurture', 'descartado']

// Checklist del prospecto — hitos marcables en CUALQUIER orden (no ordinales).
export const CHECKLIST_PROSPECTO = ['lectura', 'producto_propuesto', 'cotizacion_enviada', 'reunion'] as const
export type ChecklistItem = (typeof CHECKLIST_PROSPECTO)[number]
export const CHECKLIST_LABELS: Record<ChecklistItem, string> = {
  lectura:            'Lectura',
  producto_propuesto: 'Producto propuesto',
  cotizacion_enviada: 'Cotización enviada',
  reunion:            'Reunión hecha',
}

export type Producto = 'banco' | 'lookbook' | 'spot' | 'videoclip'

export const PRODUCTO_LABELS: Record<Producto, string> = {
  banco:     'Banco',
  lookbook:  'Lookbook',
  spot:      'Spot',
  videoclip: 'Videoclip',
}

// `lectura` faltaba y es el origen entrante más grande del CRM (15 de 58): el
// filtro del pipeline no lo ofrecía, así que ese grupo era infiltrable.
export const ORIGENES_PROSPECTO = [
  'lectura',
  'web',
  'feria',
  'referido',
  'correo',
  'linkedin',
  'instagram',
  'otro',
] as const

// Cadencia de contacto (cuándo toca el próximo correo) — ver lib/crm-cadencia.ts
export {
  calcularCadencia,
  intervaloPara,
  snoozeMaximo,
  prioridadCadencia,
  aDiaHabil,
  sumarDias,
  LIMITE_SIN_RESPUESTA,
  type Cadencia,
  type EstadoCadencia,
} from '@/lib/crm-cadencia'

// Temperatura de origen (frío vs entrante) — se deriva de `origen`.
export {
  temperaturaDe,
  TEMPERATURA_LABELS,
  TEMPERATURA_GLOSA,
  TEMPERATURA_BORDE,
  TEMPERATURA_TEXTO,
  TEMPERATURAS,
  type Temperatura,
} from '@/lib/crm-temperatura'

export const SCORES_PROSPECTO = ['alta', 'media', 'baja'] as const

export const ARQUETIPOS = ['feed', 'temporadas', 'sin_definir'] as const

export const PRODUCTOS_OBJETIVO = ['banco', 'lookbook', 'spot', 'videoclip', 'sin_definir'] as const

// ── Ejes de asignación de responsable (los clasifica el operador/agente) ─────
export const TAMANOS_EMPRESA = ['chica', 'mediana', 'grande'] as const
export type TamanoEmpresa = (typeof TAMANOS_EMPRESA)[number]
export const TAMANO_LABELS: Record<TamanoEmpresa, string> = {
  chica:   'Chica',
  mediana: 'Mediana',
  grande:  'Grande',
}

export const SEGMENTOS_PROSPECTO = ['general', 'estudiante', 'ropa_intima_fem', 'masculino_estereotipo', 'rental'] as const
export type SegmentoProspecto = (typeof SEGMENTOS_PROSPECTO)[number]
export const SEGMENTO_LABELS: Record<SegmentoProspecto, string> = {
  general:               'General',
  estudiante:            'Estudiante',
  ropa_intima_fem:       'Ropa íntima fem.',
  masculino_estereotipo: 'Masculino (deportes/herramientas)',
  rental:                'Rental',
}

export const TIPOS_INTERACCION = ['correo', 'reunion', 'lectura', 'llamada', 'mensaje'] as const

export interface Prospecto {
  id: string
  empresa: string
  nombre_contacto?: string | null
  email?: string | null
  telefono?: string | null
  origen?: string | null
  arquetipo?: string | null
  etapa: EtapaProspecto
  responsable_id?: string | null
  responsable?: Pick<Profile, 'id' | 'nombre'> | null
  score?: string | null
  decisor?: string | null
  angulo?: string | null
  producto_objetivo?: string | null
  tamano?: string | null            // chica | mediana | grande (eje de asignación)
  segmento?: string | null          // ver SEGMENTOS_PROSPECTO (eje de asignación)
  cliente_id?: string | null
  cliente?: Pick<Cliente, 'id' | 'nombre'> | null
  notas?: string | null
  checklist?: string[] | null       // hitos marcados (ver CHECKLIST_PROSPECTO)
  snooze_hasta?: string | null       // cadencia: próximo contacto pospuesto a mano
  n_interacciones?: number           // contador de contactos (solo en el pipeline)
  ultima_interaccion?: string | null // YYYY-MM-DD del último toque (solo en el pipeline)
  cadencia?: Cadencia                // cuándo toca el próximo contacto (solo en el pipeline)
  created_at: string
  updated_at?: string
}

export interface CrmInteraccion {
  id: string
  prospecto_id: string
  fecha?: string | null
  tipo?: string | null
  resumen?: string | null
  cuerpo?: string | null            // correo enviado adjunto (texto)
  respondido?: boolean | null       // el contacto tuvo respuesta
  proximo_paso?: string | null
  fecha_proximo?: string | null
  gmail_thread?: string | null
  created_at: string
}

// Árbol de contactos de una marca: varias personas por prospecto.
export interface CrmContacto {
  id: string
  prospecto_id: string
  nombre?: string | null
  cargo?: string | null
  email?: string | null
  telefono?: string | null
  es_decisor?: boolean | null
  notas?: string | null
  links?: string[] | null
  created_at: string
}

// Casilla de borrador de respuesta: la rellena el operador (humano o IA).
export interface CrmBorrador {
  id: string
  prospecto_id: string
  contacto_id?: string | null
  asunto?: string | null
  cuerpo?: string | null
  links?: string[] | null      // links a material propio dentro del correo
  adjuntos?: string[] | null   // paquetes / PDF
  estado?: string | null       // borrador | listo | enviado
  autor?: string | null
  created_at: string
  updated_at?: string
}

export interface CrmLectura {
  id: string
  prospecto_id: string
  url?: string | null
  /** Referencia externa (histórico). El contenido real va en `dossier`. */
  dossier_ref?: string | null
  /** Dossier completo de La Lectura, archivado al aprobar la propuesta. */
  dossier?: Record<string, unknown> | null
  producto_derivado?: string | null
  fecha?: string | null
  created_at: string
}

export type TipoInsight = 'investigacion' | 'lectura' | 'literatura'

/** Por qué se aborda así a este prospecto. No es la bitácora ni el borrador. */
export interface CrmInsight {
  id: string
  prospecto_id: string
  tipo: TipoInsight
  titulo: string
  detalle?: string | null
  /** URL si vino de la web, o el nombre de la obra si vino de la literatura. */
  fuente?: string | null
  created_at: string
}

export const TIPO_INSIGHT_LABEL: Record<TipoInsight, string> = {
  investigacion: 'De la marca',
  lectura:       'De La Lectura',
  literatura:    'De la literatura',
}

export interface CrmAprobacion {
  id: string
  tipo: string
  prospecto_id?: string | null
  payload?: unknown
  estado: string
  origen?: string | null
  nota_agente?: string | null
  created_at: string
  resuelto_por?: string | null
  resuelto_at?: string | null
}
