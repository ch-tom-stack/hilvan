// ================================================
// HILVÁN — types/index.ts
// Tipos globales canónicos — Chat 0+1+2+3
// ================================================

// ─── AUTH ────────────────────────────────────────
export type Rol = 'admin' | 'productor' | 'colaborador' | 'cliente'

export interface Profile {
  id: string
  nombre: string
  email: string
  rol: Rol
  created_at: string
}

// ─── EQUIPOS ─────────────────────────────────────
export type EstadoEquipo = 'disponible' | 'en_uso' | 'en_mantenimiento' | 'pendiente_compra'

export interface CategoriaEquipo {
  id: string
  codigo: string
  nombre: string
  created_at: string
}

export interface Equipo {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  categoria_id: string
  categoria?: CategoriaEquipo
  estado: EstadoEquipo
  precio_arriendo_dia?: number
  numero_serie?: string
  notas?: string
  foto_url?: string
  created_at: string
}

// ─── MALETAS ─────────────────────────────────────
export interface MaletaNota {
  id: string
  maleta_id: string
  texto: string
  created_at: string
}

export interface Maleta {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  foto_url?: string
  created_at: string
  items?: MaletaItem[]
  notas?: MaletaNota[]
}

export interface MaletaItem {
  id: string
  maleta_id: string
  equipo_id?: string
  equipo?: Equipo
  descripcion_manual?: string
  cantidad: number
  orden: number
}

// ─── CLIENTES Y PROYECTOS ─────────────────────────
export interface Cliente {
  id: string
  nombre: string
  empresa?: string
  email?: string
  telefono?: string
  notas?: string
  created_at: string
}

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
  cliente_id: string
  cliente?: Cliente
  estado: EstadoProyecto
  fecha_inicio?: string
  fecha_entrega?: string
  descripcion?: string
  created_at: string
}

// ─── COTIZACIONES ─────────────────────────────────
export type TipoItem = 'equipo' | 'servicio' | 'transporte' | 'otro'
export type UnidadItem = 'dia' | 'unidad' | 'hora' | 'semana'

export interface TarifaBase {
  id: string
  nombre: string
  precio: number
  unidad: UnidadItem
  tipo: TipoItem
  created_at: string
}

export type EstadoCotizacion =
  | 'borrador'
  | 'enviada'
  | 'aprobada'
  | 'rechazada'
  | 'en_produccion'
  | 'cerrada'

export type FormatoPDF = 'detallado' | 'resumido'
export type TipoDescuento = 'porcentaje' | 'monto_fijo'

export interface CotizacionGrupo {
  id: string
  proyecto_id: string
  proyecto?: Proyecto
  nombre: string
  created_at: string
  cotizaciones?: Cotizacion[]
}

export interface Cotizacion {
  id: string
  grupo_id: string
  grupo?: CotizacionGrupo
  version: number
  nombre?: string
  token: string
  estado: EstadoCotizacion
  formato_pdf: FormatoPDF
  tipo_descuento?: TipoDescuento
  descuento_valor?: number
  notas_internas?: string
  notas_cliente?: string
  created_at: string
  departamentos?: CotizacionDepartamento[]
}

export interface CotizacionDepartamento {
  id: string
  cotizacion_id: string
  nombre: string
  orden: number
  subgrupos?: CotizacionSubgrupo[]
}

export interface CotizacionSubgrupo {
  id: string
  departamento_id: string
  nombre: string
  orden: number
  items?: CotizacionItem[]
}

export interface CotizacionItem {
  id: string
  subgrupo_id: string
  tipo: TipoItem
  descripcion: string
  unidad: UnidadItem
  cantidad: number
  dias: number
  precio_unitario: number
  orden: number
}

// ─── HELPERS COTIZACIÓN ───────────────────────────
export function numeroCotizacion(grupo: CotizacionGrupo, version: number | undefined): string {
  const fecha = new Date(grupo.created_at)
  const año = fecha.getFullYear().toString().slice(2)
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const ver = version ?? 1
  return `COT-${año}${mes}-${ver.toString().padStart(2, '0')}`
}

export function calcularBruto(item: CotizacionItem): number {
  return item.precio_unitario * item.cantidad * item.dias
}

export function subtotalItem(item: CotizacionItem): number {
  return calcularBruto(item)
}

export function subtotalSubgrupo(subgrupo: CotizacionSubgrupo): number {
  return (subgrupo.items || []).reduce((acc, item) => acc + subtotalItem(item), 0)
}

export function subtotalDepartamento(depto: CotizacionDepartamento): number {
  return (depto.subgrupos || []).reduce((acc, sg) => acc + subtotalSubgrupo(sg), 0)
}

export function calcularTotales(cotizacion: Cotizacion): {
  subtotal: number
  descuento: number
  total: number
} {
  const subtotal = (cotizacion.departamentos || []).reduce(
    (acc, d) => acc + subtotalDepartamento(d),
    0
  )
  let descuento = 0
  if (cotizacion.tipo_descuento === 'porcentaje' && cotizacion.descuento_valor) {
    descuento = subtotal * (cotizacion.descuento_valor / 100)
  } else if (cotizacion.tipo_descuento === 'monto_fijo' && cotizacion.descuento_valor) {
    descuento = cotizacion.descuento_valor
  }
  return { subtotal, descuento, total: subtotal - descuento }
}

export function formatCLP(valor: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(valor)
}

// ─── RODAJE ───────────────────────────────────────
export type EstadoRodaje = 'borrador' | 'confirmado' | 'completado'
export type VisibilidadPlan = 'ninguna' | 'completo' | 'segmento'

export interface Rodaje {
  id: string
  nombre: string
  fecha?: string                    // DATE — puede ser null si aún no está definida
  fecha_confirmada: boolean
  proyecto_id?: string
  proyecto?: Proyecto
  cotizacion_id?: string
  cotizacion?: Cotizacion
  locacion_nombre?: string
  locacion_direccion?: string
  locacion_lat?: number
  locacion_lng?: number
  hora_llamado_general?: string     // TIME en formato "HH:mm"
  estado: EstadoRodaje
  visibilidad_plan: VisibilidadPlan
  notas_generales?: string
  chiste_texto?: string
  chiste_imagen_url?: string
  created_by?: string
  created_at: string
  // relaciones cargadas opcionalmente
  departamentos?: RodajeDepartamento[]
  equipo_tecnico?: RodajeEquipoTecnico[]
  escenas?: RodajeEscena[]
}

export interface RodajeDepartamento {
  id: string
  rodaje_id: string
  nombre: string
  hora_llamado?: string             // TIME en formato "HH:mm"
  orden: number
  // relaciones
  miembros?: RodajeEquipoTecnico[]
}

export interface Colaborador {
  id: string
  nombre: string
  email?: string
  telefono?: string
  rol_habitual?: string
  notas?: string
  created_at: string
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
  hora_llamado_individual?: string  // TIME en formato "HH:mm"
  created_at: string
  // relaciones
  citacion?: RodajeCitacion
}

export interface RodajeEscena {
  id: string
  rodaje_id: string
  orden: number
  titulo: string
  descripcion?: string
  hora_estimada?: string            // TIME en formato "HH:mm"
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
  // relación con el rodaje completo (para portal público)
  rodaje?: Rodaje
}

// ─── HELPERS RODAJE ───────────────────────────────

/**
 * Resuelve la hora de llamado efectiva de una persona
 * en cascada: individual → departamento → general del rodaje
 */
export function resolverHoraLlamado(
  persona: RodajeEquipoTecnico,
  rodaje: Rodaje
): string | undefined {
  if (persona.hora_llamado_individual) return persona.hora_llamado_individual
  if (persona.departamento?.hora_llamado) return persona.departamento.hora_llamado
  return rodaje.hora_llamado_general
}

/**
 * Formatea un TIME "HH:mm:ss" o "HH:mm" a "HH:mm"
 */
export function formatHora(hora?: string): string {
  if (!hora) return '—'
  return hora.slice(0, 5)
}

/**
 * Genera el texto de citación para copiar/WhatsApp
 */
export function generarMensajeCitacion(
  persona: RodajeEquipoTecnico,
  rodaje: Rodaje,
  linkCitacion: string
): string {
  const hora = formatHora(resolverHoraLlamado(persona, rodaje))
  const fecha = rodaje.fecha
    ? new Date(rodaje.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : 'fecha por confirmar'

  return `Hola ${persona.nombre}! 👋

Te citamos para el rodaje *${rodaje.nombre}*.

📅 ${fecha}
⏰ Hora de llegada: *${hora}*
📍 ${rodaje.locacion_nombre || 'Locación por confirmar'}${
    rodaje.locacion_direccion ? `\n${rodaje.locacion_direccion}` : ''
  }

Por favor confirma tu asistencia y déjanos saber si tienes restricciones alimentarias:
${linkCitacion}

¡Nos vemos! 🎬`
}

/**
 * Genera link de Google Calendar para el rodaje
 */
export function generarLinkCalendar(rodaje: Rodaje): string {
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
  const title = encodeURIComponent(`Rodaje: ${rodaje.nombre}`)
  const fecha = rodaje.fecha ? rodaje.fecha.replace(/-/g, '') : ''
  const dates = fecha ? `${fecha}/${fecha}` : ''
  const location = encodeURIComponent(rodaje.locacion_direccion || rodaje.locacion_nombre || '')
  const details = encodeURIComponent(
    `Hora de llamado general: ${formatHora(rodaje.hora_llamado_general)}\n${rodaje.notas_generales || ''}`
  )
  return `${base}&text=${title}&dates=${dates}&location=${location}&details=${details}`
}

/**
 * Genera link de Uber deep link para la locación
 */
export function generarLinkUber(rodaje: Rodaje): string | undefined {
  if (!rodaje.locacion_lat || !rodaje.locacion_lng) return undefined
  const nombre = encodeURIComponent(rodaje.locacion_nombre || 'Locación')
  return `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${rodaje.locacion_lat}&dropoff[longitude]=${rodaje.locacion_lng}&dropoff[nickname]=${nombre}`
}

/**
 * Estado de envío de una citación (para UI)
 */
export function estadoCitacion(citacion: RodajeCitacion): {
  label: string
  color: 'gray' | 'yellow' | 'green' | 'red'
} {
  if (citacion.confirmada === true) return { label: 'Confirmado', color: 'green' }
  if (citacion.confirmada === false) return { label: 'No puede', color: 'red' }
  if (citacion.respondida_at) return { label: 'Respondió', color: 'yellow' }
  if (citacion.whatsapp_enviado || citacion.email_enviado_at)
    return { label: 'Enviado', color: 'yellow' }
  return { label: 'Sin enviar', color: 'gray' }
}

// ─── LOCACIONES ───────────────────────────────────────────────────────────────

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
}

// ─── BLOQUES DEL PLAN ─────────────────────────────────────────────────────────

export type TipoBloque = 'rodaje' | 'pausa' | 'traslado' | 'montaje' | 'otro'

export interface RodajeBloque {
  id: string
  rodaje_id: string
  padre_id?: string
  orden: number

  // Contenido
  titulo: string
  tipo: TipoBloque
  scenes_label?: string           // etiqueta visual izquierda (ej: "JESU C, INSERTOS")
  scenes_color?: string           // color hex del label
  character_num?: string          // CHARACTER # (texto libre)
  dia_noche?: 'D' | 'N'
  interior_exterior?: 'I' | 'E' | '-'
  locacion_id?: string
  locacion?: RodajeLocacion
  descripcion?: string
  nota_previa?: string

  // Tiempo
  hora_inicio_fija?: string       // TIME "HH:mm" — si está, no se mueve con cascada (anclado)
  hora_fin?: string               // TIME "HH:mm" — calculado o manual
  duracion_min?: number
  es_paralelo: boolean            // mismo INICIO que el bloque anterior, no suma al total
  es_anclado: boolean             // INICIO fijo, inmune a cascada

  // Visibilidad
  visible_equipo: boolean
  visible_catering: boolean
  visible_extras: boolean
  visible_cliente: boolean

  created_at: string

  // relaciones cargadas
  hijos?: RodajeBloque[]
}

// ─── HELPERS BLOQUES ──────────────────────────────────────────────────────────

/**
 * Convierte "HH:mm" o "HH:mm:ss" a minutos desde medianoche
 */
export function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/**
 * Formatea minutos desde medianoche a "HH:mm"
 */
export function minutosAHora(minutos: number): string {
  const h = Math.floor(minutos / 60) % 24
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Recalcula todas las horas de inicio/fin de una lista de bloques raíz en orden.
 *
 * Reglas:
 * - Bloque anclado (es_anclado=true o tiene hora_inicio_fija): INICIO fijo, no se mueve.
 * - Bloque paralelo (es_paralelo=true): INICIO = INICIO del bloque anterior (no FIN).
 *   No suma al total — el siguiente bloque se encadena al anterior a este.
 * - Bloque normal: INICIO = FIN del bloque anterior.
 *
 * Devuelve array con {id, inicio_min, fin_min} para cada bloque.
 */
export function calcularCascada(bloques: RodajeBloque[]): Array<{
  id: string
  inicio_min: number | undefined
  fin_min: number | undefined
  duracion_min: number
}> {
  const result: Array<{
    id: string
    inicio_min: number | undefined
    fin_min: number | undefined
    duracion_min: number
  }> = []

  let cursor_fin: number | undefined = undefined   // FIN del último bloque no-paralelo
  let cursor_inicio: number | undefined = undefined // INICIO del último bloque

  for (const bloque of bloques) {
    const dur = bloque.duracion_min ?? 0

    let inicio: number | undefined

    if (bloque.hora_inicio_fija) {
      // Anclado con hora fija — no se mueve nunca
      inicio = horaAMinutos(bloque.hora_inicio_fija)
      cursor_fin = inicio + dur
      cursor_inicio = inicio
    } else if (bloque.es_anclado && bloque.hora_inicio_fija) {
      inicio = horaAMinutos(bloque.hora_inicio_fija)
      cursor_fin = inicio + dur
      cursor_inicio = inicio
    } else if (bloque.es_paralelo) {
      // Paralelo: mismo INICIO que el bloque anterior
      inicio = cursor_inicio
      // No actualizamos cursor_fin — el siguiente se encadena al bloque antes del paralelo
    } else {
      // Encadenado normal: INICIO = FIN del anterior
      inicio = cursor_fin
      if (inicio !== undefined) {
        cursor_fin = inicio + dur
        cursor_inicio = inicio
      }
    }

    const fin = inicio !== undefined ? inicio + dur : undefined

    result.push({ id: bloque.id, inicio_min: inicio, fin_min: fin, duracion_min: dur })
  }

  return result
}

/**
 * Dado un bloque modificado y la lista completa, recalcula toda la cascada
 * y devuelve los bloques actualizados con sus nuevas horas.
 */
export function aplicarCambioTiempo(
  bloques: RodajeBloque[],
  bloqueId: string,
  campo: 'inicio' | 'fin' | 'duracion',
  valorMin: number
): RodajeBloque[] {
  const idx = bloques.findIndex(b => b.id === bloqueId)
  if (idx === -1) return bloques

  const actualizados = bloques.map((b, i) => {
    if (i !== idx) return b
    const b2 = { ...b }
    if (campo === 'inicio') {
      b2.hora_inicio_fija = minutosAHora(valorMin)
      b2.es_anclado = true
      if (b2.duracion_min) b2.hora_fin = minutosAHora(valorMin + b2.duracion_min)
    } else if (campo === 'fin') {
      const inicioActual = b2.hora_inicio_fija ? horaAMinutos(b2.hora_inicio_fija) : undefined
      if (inicioActual !== undefined) {
        b2.duracion_min = valorMin - inicioActual
        b2.hora_fin = minutosAHora(valorMin)
      }
    } else if (campo === 'duracion') {
      b2.duracion_min = valorMin
      if (b2.hora_inicio_fija) {
        b2.hora_fin = minutosAHora(horaAMinutos(b2.hora_inicio_fija) + valorMin)
      }
    }
    return b2
  })

  return actualizados
}

/**
 * Duración total del día (suma de bloques no-paralelos)
 */
export function duracionTotalDia(bloques: RodajeBloque[]): number {
  return bloques
    .filter(b => !b.es_paralelo && !b.padre_id)
    .reduce((acc, b) => acc + (b.duracion_min ?? 0), 0)
}

/**
 * Genera link Uber para una locación
 */
export function uberLinkLocacion(loc: RodajeLocacion): string | undefined {
  if (!loc.lat || !loc.lng) return undefined
  return `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${loc.lat}&dropoff[longitude]=${loc.lng}&dropoff[nickname]=${encodeURIComponent(loc.nombre)}`
}

// ─── PLANTILLAS DE BLOQUES ────────────────────────────────────────────────────

export const PLANTILLAS_BLOQUES: Array<{
  label: string
  titulo: string
  tipo: TipoBloque
  duracion_min: number
  scenes_color: string
  dia_noche: 'D' | 'N'
  interior_exterior: 'I' | 'E' | '-'
}> = [
  { label: 'CALL',        titulo: 'Call equipo completo',   tipo: 'otro',     duracion_min: 0,  scenes_color: '#353135', dia_noche: 'D', interior_exterior: '-' },
  { label: 'PRE SET',     titulo: 'Preparación de set',     tipo: 'montaje',  duracion_min: 40, scenes_color: '#353135', dia_noche: 'D', interior_exterior: 'I' },
  { label: 'DESAYUNO',    titulo: 'Desayuno equipo',        tipo: 'pausa',    duracion_min: 30, scenes_color: '#353135', dia_noche: 'D', interior_exterior: '-' },
  { label: 'SNACK',       titulo: 'Snack equipo',           tipo: 'pausa',    duracion_min: 15, scenes_color: '#353135', dia_noche: 'D', interior_exterior: '-' },
  { label: 'ALMUERZO',    titulo: 'Almuerzo equipo',        tipo: 'pausa',    duracion_min: 45, scenes_color: '#353135', dia_noche: 'D', interior_exterior: '-' },
  { label: 'TRASLADO',    titulo: 'Traslado a locación',    tipo: 'traslado', duracion_min: 30, scenes_color: '#353135', dia_noche: 'D', interior_exterior: '-' },
  { label: 'DESMONTAJE',  titulo: 'Desmontaje de set',      tipo: 'montaje',  duracion_min: 30, scenes_color: '#353135', dia_noche: 'D', interior_exterior: 'I' },
  { label: 'CIERRE',      titulo: 'Cierre jornada',         tipo: 'otro',     duracion_min: 0,  scenes_color: '#353135', dia_noche: 'D', interior_exterior: '-' },
]
