// types/index.ts

// ============================================================
// AUTH / USUARIOS
// ============================================================
export type Rol = 'admin' | 'productor' | 'colaborador' | 'cliente'

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
  estado: EstadoEquipo
  precio_jornada?: number
  foto_url?: string
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
  notas?: string
  created_at: string
  created_by?: string
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

export interface Proyecto {
  id: string
  nombre: string
  cliente_id?: string
  cliente?: Cliente
  estado: EstadoProyecto
  descripcion?: string
  fecha_inicio?: string
  fecha_cierre?: string
  created_at: string
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

  con_iva: boolean
  formato_pdf: FormatoPDF
  descuento_global: number
  descuento_global_tipo: TipoDescuento

  descripcion?: string
  notas_internas?: string
  notas_cliente?: string

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
// HELPERS DE CÁLCULO
// ============================================================

// Calcula precio_bruto desde neto con boleta
// Bruto = Neto / (1 - tasa)
export function calcularBruto(neto: number, tasa: number = 0.153): number {
  return Math.round(neto / (1 - tasa))
}

// Subtotal de un ítem al cliente
export function subtotalItem(item: CotizacionItem): number {
  if (item.incluido) return 0
  const base = item.precio_cliente * item.cantidad * item.dias
  if (item.descuento_item_tipo === 'porcentaje') {
    return Math.round(base * (1 - item.descuento_item / 100))
  }
  return Math.round(base - item.descuento_item)
}

// Subtotal de un sub-grupo al cliente
export function subtotalSubgrupo(sg: CotizacionSubgrupo): number {
  return (sg.items ?? []).reduce((acc, i) => acc + subtotalItem(i), 0)
}

// Subtotal de un departamento al cliente
export function subtotalDepartamento(dep: CotizacionDepartamento): number {
  const deSubs = (dep.subgrupos ?? []).reduce(
    (acc, sg) => acc + subtotalSubgrupo(sg),
    0
  )
  const directos = (dep.items ?? []).reduce(
    (acc, i) => acc + subtotalItem(i),
    0
  )
  return deSubs + directos
}

// Totales generales
export interface TotalesCotizacion {
  neto: number
  descuento_global_monto: number
  neto_con_descuento: number
  iva: number
  total: number
  costo_real: number
  margen: number
}

export function calcularTotales(cotizacion: Cotizacion): TotalesCotizacion {
  const deps = cotizacion.departamentos ?? []

  const neto = deps.reduce((acc, d) => acc + subtotalDepartamento(d), 0)

  const todosItems = deps.flatMap(d => [
    ...(d.items ?? []),
    ...(d.subgrupos ?? []).flatMap(sg => sg.items ?? []),
  ])

  const costo_real = todosItems.reduce(
    (acc, i) => acc + Math.round(i.precio_bruto * i.cantidad * i.dias),
    0
  )

  let descuento_global_monto = 0
  if (cotizacion.descuento_global > 0) {
    if (cotizacion.descuento_global_tipo === 'porcentaje') {
      descuento_global_monto = Math.round(
        (neto * cotizacion.descuento_global) / 100
      )
    } else {
      descuento_global_monto = cotizacion.descuento_global
    }
  }

  const neto_con_descuento = neto - descuento_global_monto
  const iva = cotizacion.con_iva ? Math.round(neto_con_descuento * 0.19) : 0
  const total = neto_con_descuento + iva
  const margen = total - costo_real

  return {
    neto,
    descuento_global_monto,
    neto_con_descuento,
    iva,
    total,
    costo_real,
    margen,
  }
}

// ============================================================
// FORMATO CLP
// ============================================================
export function formatCLP(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

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
  tipo_documento?: 'boleta' | 'bet' | 'factura' | 'sin_documento'
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
  token: string
  expires_at: string
  used_at?: string
  created_at: string
}

export type TipoRendicion = 'honorarios' | 'arte' | 'transporte' | 'alimentacion' | 'insumos' | 'servicios' | 'viaticos' | 'otro'
export type EstadoRendicion = 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'pago_aprobado'
export type TipoDocRendicion = 'boleta' | 'factura' | 'exenta' | 'sin_documento'

export interface Rendicion {
  id: string
  cotizacion_id: string
  cotizacion?: { id: string; nombre: string; grupo?: { numero_base?: string } }
  estado: EstadoRendicion
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

const RETENCION_BOLETA = 0.154

export function calcularRetencion(rendicion: { monto: number; tipo_documento?: string | null }) {
  if (rendicion.tipo_documento === 'boleta' || rendicion.tipo_documento === 'bet') {
    const retencion = Math.round(rendicion.monto * RETENCION_BOLETA)
    return { bruto: rendicion.monto, retencion, neto: rendicion.monto - retencion, sinDocumento: false }
  }
  if (rendicion.tipo_documento === 'sin_documento') {
    return { bruto: rendicion.monto, retencion: 0, neto: rendicion.monto, sinDocumento: true }
  }
  // factura, exenta — pago bruto completo
  return { bruto: rendicion.monto, retencion: 0, neto: rendicion.monto, sinDocumento: false }
}

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

export function resolverHoraLlamado(persona: RodajeEquipoTecnico, rodaje: Rodaje): string | undefined {
  if (persona.hora_llamado_individual) return persona.hora_llamado_individual
  if (persona.departamento?.hora_llamado) return persona.departamento.hora_llamado
  return rodaje.hora_llamado_general
}

export function formatHora(hora?: string): string {
  if (!hora) return '—'
  return hora.slice(0, 5)
}

export function generarMensajeCitacion(persona: RodajeEquipoTecnico, rodaje: Rodaje, linkCitacion: string): string {
  const hora = formatHora(resolverHoraLlamado(persona, rodaje))
  const fecha = rodaje.fecha
    ? new Date(rodaje.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'fecha por confirmar'
  return `Hola ${persona.nombre}! 👋\n\nTe citamos para el rodaje *${rodaje.nombre}*.\n\n📅 ${fecha}\n⏰ Hora de llegada: *${hora}*\n📍 ${rodaje.locacion_nombre || 'Locación por confirmar'}${rodaje.locacion_direccion ? '\n' + rodaje.locacion_direccion : ''}\n\nPor favor confirma tu asistencia y déjanos saber si tienes restricciones alimentarias:\n${linkCitacion}\n\n¡Nos vemos! 🎬`
}

export function generarLinkCalendar(rodaje: Rodaje): string {
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
  const title = encodeURIComponent(`Rodaje: ${rodaje.nombre}`)
  const fecha = rodaje.fecha ? rodaje.fecha.replace(/-/g, '') : ''
  const dates = fecha ? `${fecha}/${fecha}` : ''
  const location = encodeURIComponent(rodaje.locacion_direccion || rodaje.locacion_nombre || '')
  const details = encodeURIComponent(`Hora de llamado general: ${formatHora(rodaje.hora_llamado_general)}\n${rodaje.notas_generales || ''}`)
  return `${base}&text=${title}&dates=${dates}&location=${location}&details=${details}`
}

export function generarLinkUber(rodaje: Rodaje): string | undefined {
  if (!rodaje.locacion_lat || !rodaje.locacion_lng) return undefined
  return `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${rodaje.locacion_lat}&dropoff[longitude]=${rodaje.locacion_lng}&dropoff[nickname]=${encodeURIComponent(rodaje.locacion_nombre || 'Locación')}`
}

export function estadoCitacion(citacion: RodajeCitacion): { label: string; color: 'gray' | 'yellow' | 'green' | 'red' } {
  if (citacion.confirmada === true) return { label: 'Confirmado', color: 'green' }
  if (citacion.confirmada === false) return { label: 'No puede', color: 'red' }
  if (citacion.respondida_at) return { label: 'Respondió', color: 'yellow' }
  if (citacion.whatsapp_enviado || citacion.email_enviado_at) return { label: 'Enviado', color: 'yellow' }
  return { label: 'Sin enviar', color: 'gray' }
}

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

export type TipoBloque = 'rodaje' | 'pausa' | 'traslado' | 'montaje' | 'otro'

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
  created_at: string
  updated_at: string
  hijos?: RodajeBloque[]
}

export function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

export function minutosAHora(minutos: number): string {
  const h = Math.floor(minutos / 60) % 24
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function calcularCascada(bloques: RodajeBloque[]): Array<{ id: string; inicio_min: number | undefined; fin_min: number | undefined; duracion_min: number }> {
  const result: Array<{ id: string; inicio_min: number | undefined; fin_min: number | undefined; duracion_min: number }> = []
  let cursor_fin: number | undefined = undefined
  let cursor_inicio: number | undefined = undefined
  for (const bloque of bloques) {
    const dur = bloque.duracion_min ?? 0
    let inicio: number | undefined
    if (bloque.hora_inicio_fija) {
      inicio = horaAMinutos(bloque.hora_inicio_fija)
      cursor_fin = inicio + dur
      cursor_inicio = inicio
    } else if (bloque.es_paralelo) {
      inicio = cursor_inicio
    } else {
      inicio = cursor_fin
      if (inicio !== undefined) { cursor_fin = inicio + dur; cursor_inicio = inicio }
    }
    result.push({ id: bloque.id, inicio_min: inicio, fin_min: inicio !== undefined ? inicio + dur : undefined, duracion_min: dur })
  }
  return result
}

export function aplicarCambioTiempo(bloques: RodajeBloque[], bloqueId: string, campo: 'inicio' | 'fin' | 'duracion', valorMin: number): RodajeBloque[] {
  const idx = bloques.findIndex(b => b.id === bloqueId)
  if (idx === -1) return bloques
  return bloques.map((b, i) => {
    if (i !== idx) return b
    const b2 = { ...b }
    if (campo === 'inicio') { b2.hora_inicio_fija = minutosAHora(valorMin); b2.es_anclado = true; if (b2.duracion_min) b2.hora_fin = minutosAHora(valorMin + b2.duracion_min) }
    else if (campo === 'fin') { const ini = b2.hora_inicio_fija ? horaAMinutos(b2.hora_inicio_fija) : undefined; if (ini !== undefined) { b2.duracion_min = valorMin - ini; b2.hora_fin = minutosAHora(valorMin) } }
    else if (campo === 'duracion') { b2.duracion_min = valorMin; if (b2.hora_inicio_fija) b2.hora_fin = minutosAHora(horaAMinutos(b2.hora_inicio_fija) + valorMin) }
    return b2
  })
}

export function duracionTotalDia(bloques: RodajeBloque[]): number {
  return bloques.filter(b => !b.es_paralelo && !b.padre_id).reduce((acc, b) => acc + (b.duracion_min ?? 0), 0)
}

export function uberLinkLocacion(loc: RodajeLocacion): string | undefined {
  if (!loc.lat || !loc.lng) return undefined
  return `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${loc.lat}&dropoff[longitude]=${loc.lng}&dropoff[nickname]=${encodeURIComponent(loc.nombre)}`
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
