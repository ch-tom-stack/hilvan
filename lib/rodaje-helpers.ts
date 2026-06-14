// lib/rodaje-helpers.ts
// Helpers de rodaje (CH-3): horas, cascada de bloques, citaciones y links.
// Extraído de types/index.ts en T12 — las funciones no fueron modificadas.
import { parseFechaLocal } from '@/lib/fechas'
import type {
  RodajeEquipoTecnico,
  Rodaje,
  RodajeCitacion,
  RodajeBloque,
  RodajeLocacion,
} from '@/types'

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
    ? parseFechaLocal(rodaje.fecha).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
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
    else if (campo === 'fin') {
      // Inicio efectivo: hora fija si la hay; si no, el que resuelve la cascada
      // (el bloque parte donde termina el anterior). Así editar el "fin" ajusta
      // la duración aunque el bloque no esté anclado.
      let ini = b2.hora_inicio_fija ? horaAMinutos(b2.hora_inicio_fija) : undefined
      if (ini === undefined) ini = calcularCascada(bloques).find(c => c.id === bloqueId)?.inicio_min
      if (ini !== undefined && valorMin > ini) { b2.duracion_min = valorMin - ini; b2.hora_fin = minutosAHora(valorMin) }
    }
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

// Normaliza un texto para matching: minúsculas, sin acentos, espacios colapsados.
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Marcas/equipos/servicios/presupuesto: si el nombre contiene alguno, NO es persona.
// (Tiene prioridad sobre los positivos: "Asistente de Cámara" es persona, pero
// "Cámaras Sony" o "Postproducción de Sonido" no, aunque "camara"/"sonido" aparezcan.)
const MARCADORES_NO_PERSONA = [
  // gear / marcas
  'camaras', 'sony', 'canon', 'nikon', 'blackmagic', 'arri', 'red ', 'ronin', 'dji',
  'aputure', 'nanlite', 'godox', 'ikan', 'nisi', 'athena', 'lente', 'lentes', 'maleta',
  'monitor', 'modificador', 'tamizador', 'bandera', 'tripode', 'slider', 'gimbal',
  'luces', 'kit ', 'bateria', 'tarjeta', 'estabilizador',
  // servicios / presupuesto / logística
  'caja', 'transporte', 'catering', 'alimentacion', 'montaje', 'postproduccion',
  'post-produccion', 'post produccion', 'grade', 'exportacion', 'graficas',
  'musicalizacion', 'normalizacion', 'arriendo', 'seguro', 'combustible', 'viatico',
  'equipos ch', 'equipos', 'insumo', 'consumible', 'locacion', 'ppto',
]

// Roles de persona del crew/cast (AV chileno). Si el nombre contiene alguno (y ningún
// marcador no-persona), se trata como persona.
const MARCADORES_PERSONA = [
  'director', 'directora', 'direccion de fotografia', 'dop', 'fotografo', 'fotografa',
  'asistente', 'ayudante', 'gaffer', 'electrico', 'electricista', 'grip', 'foquista',
  'operador', 'camarografo', 'productor', 'productora', 'jefe de produccion',
  'coordinador', 'coordinadora', 'ambientador', 'ambientadora', 'utilero', 'utileria',
  'escenografo', 'set dresser', 'vestuario', 'vestuarista', 'maquillaje', 'maquillador',
  'maquillista', 'peinado', 'estilista', 'stylist', 'sonidista', 'microfonista',
  'modelo', 'actor', 'actriz', 'talento', 'extra', 'doble', 'dronista', 'piloto',
  'script', 'continuista', 'foto fija', 'fotofija', 'colorista',
]

// Heurística (mejor esfuerzo): ¿el nombre de un ítem de cotización representa una
// PERSONA del equipo (crew/cast) y no un arriendo/servicio/presupuesto?
// Se usa al sembrar un rodaje porque el campo `tipo` de la cotización no es confiable
// (se setea en bloque por cotización: unas marcan todo 'rol', otras todo 'servicio').
// El humano refina después en la UI.
export function esRolPersona(nombre: string): boolean {
  const n = normalizar(nombre)
  if (!n) return false
  if (MARCADORES_NO_PERSONA.some((m) => n.includes(m))) return false
  return MARCADORES_PERSONA.some((m) => n.includes(m))
}
