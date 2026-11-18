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

/**
 * Hora HH:MM REAL (00:00–23:59). Antes cada endpoint tenía su copia de
 * /^\d{2}:\d{2}$/, que deja pasar "25:99": llegaba a Postgres y reventaba con
 * un 500, cuando el contrato dice que una hora inválida se ignora.
 */
export const HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

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

type Cascada = ReturnType<typeof calcularCascada>

/** Bloques de primer nivel en el orden del plan (los hijos no entran a la cascada). */
function raizOrdenada(bloques: RodajeBloque[]): RodajeBloque[] {
  return bloques.filter(b => !b.padre_id).slice().sort((a, b) => a.orden - b.orden)
}

/**
 * Desplaza `delta` minutos los bloques que siguen al que cambió, como en una
 * planilla: los que no tienen hora fija ya siguen solos; los anclados que
 * empezaban justo donde terminaba el anterior (la cadena) se corren igual, y la
 * cadena se corta en el primer hueco, que es una hora puesta a propósito
 * (almuerzo a las 14:00, por ejemplo).
 */
function correrSiguientes(
  raiz: RodajeBloque[], desde: number, antes: Cascada, finAnterior: number | undefined, delta: number,
  cambios: Map<string, Partial<RodajeBloque>>,
) {
  if (delta === 0 || finAnterior === undefined) return
  let prevFin: number | undefined = finAnterior
  for (let j = desde; j < raiz.length; j++) {
    const b = raiz[j]
    const old = antes[j]
    if (b.es_paralelo && !b.hora_inicio_fija) continue // no avanza el reloj
    if (b.hora_inicio_fija) {
      if (old.inicio_min === undefined || old.inicio_min !== prevFin) break // hueco deliberado
      const nuevoIni = old.inicio_min + delta
      const cambio: Partial<RodajeBloque> = { hora_inicio_fija: minutosAHora(nuevoIni) }
      if (b.duracion_min) cambio.hora_fin = minutosAHora(nuevoIni + b.duracion_min)
      cambios.set(b.id, cambio)
    }
    prevFin = old.fin_min
    if (prevFin === undefined) break
  }
}

/**
 * Edita inicio, fin o duración de un bloque y reacomoda el resto del día.
 *  - fin: cambia la duración (el inicio manda) y corre los bloques que siguen.
 *  - duración: ídem.
 *  - inicio: ancla el bloque. Si queda antes de su fin actual, el fin se
 *    mantiene y cambia la duración; si lo pasa, el bloque se desplaza entero y
 *    arrastra a los siguientes.
 * Para "soltar" un ancla se guarda `null` (un `undefined` no viaja al servidor
 * y la columna quedaba con la hora vieja).
 */
export function aplicarCambioTiempo(bloques: RodajeBloque[], bloqueId: string, campo: 'inicio' | 'fin' | 'duracion', valorMin: number): RodajeBloque[] {
  const objetivo = bloques.find(b => b.id === bloqueId)
  if (!objetivo) return bloques

  const raiz = raizOrdenada(bloques)
  const idx = raiz.findIndex(b => b.id === bloqueId)
  const cambios = new Map<string, Partial<RodajeBloque>>()

  if (idx === -1) {
    // Bloque hijo: no participa de la cascada, edición simple.
    const c: Partial<RodajeBloque> = {}
    if (campo === 'inicio') { c.hora_inicio_fija = minutosAHora(valorMin); c.es_anclado = true; if (objetivo.duracion_min) c.hora_fin = minutosAHora(valorMin + objetivo.duracion_min) }
    else if (campo === 'duracion') { c.duracion_min = valorMin; if (objetivo.hora_inicio_fija) c.hora_fin = minutosAHora(horaAMinutos(objetivo.hora_inicio_fija) + valorMin) }
    cambios.set(bloqueId, c)
  } else {
    const antes = calcularCascada(raiz)
    const { inicio_min: ini0, fin_min: fin0, duracion_min: dur0 } = antes[idx]
    const sigue = !objetivo.es_paralelo || Boolean(objetivo.hora_inicio_fija)

    if (campo === 'fin') {
      if (ini0 === undefined || valorMin <= ini0) return bloques
      cambios.set(bloqueId, { duracion_min: valorMin - ini0, hora_fin: minutosAHora(valorMin) })
      if (sigue) correrSiguientes(raiz, idx + 1, antes, fin0, valorMin - (fin0 ?? valorMin), cambios)
    } else if (campo === 'duracion') {
      const c: Partial<RodajeBloque> = { duracion_min: valorMin }
      if (objetivo.hora_inicio_fija) c.hora_fin = minutosAHora(horaAMinutos(objetivo.hora_inicio_fija) + valorMin)
      cambios.set(bloqueId, c)
      if (sigue && ini0 !== undefined) correrSiguientes(raiz, idx + 1, antes, fin0, valorMin - dur0, cambios)
    } else {
      if (ini0 !== undefined && fin0 !== undefined && valorMin < fin0) {
        // Mueve solo el inicio: el fin queda donde estaba y cambia la duración.
        cambios.set(bloqueId, { hora_inicio_fija: minutosAHora(valorMin), es_anclado: true, duracion_min: fin0 - valorMin, hora_fin: minutosAHora(fin0) })
      } else {
        const c: Partial<RodajeBloque> = { hora_inicio_fija: minutosAHora(valorMin), es_anclado: true }
        if (dur0) c.hora_fin = minutosAHora(valorMin + dur0)
        cambios.set(bloqueId, c)
        if (sigue && fin0 !== undefined) correrSiguientes(raiz, idx + 1, antes, fin0, valorMin + dur0 - fin0, cambios)
      }
    }
  }

  return bloques.map(b => (cambios.has(b.id) ? { ...b, ...cambios.get(b.id) } : b))
}

/**
 * Mueve un bloque a otra posición del plan (arrastrar y soltar). El bloque
 * movido suelta su hora fija para seguir a su nuevo vecino; si el que abría el
 * día tenía el llamado fijado, esa hora pasa al que queda primero.
 * `haciaIndice` es la posición final entre los bloques de primer nivel.
 */
export function moverBloque(bloques: RodajeBloque[], bloqueId: string, haciaIndice: number): RodajeBloque[] {
  const raiz = raizOrdenada(bloques)
  const desde = raiz.findIndex(b => b.id === bloqueId)
  if (desde === -1) return bloques
  const destino = Math.max(0, Math.min(raiz.length - 1, haciaIndice))
  if (destino === desde) return bloques

  const llamado = raiz[0].hora_inicio_fija ?? null
  const nuevo = raiz.slice()
  const [movido] = nuevo.splice(desde, 1)
  nuevo.splice(destino, 0, movido)

  const orden = new Map(nuevo.map((b, i) => [b.id, i]))
  return bloques.map(b => {
    const pos = orden.get(b.id)
    if (pos === undefined) return b
    let r: RodajeBloque = { ...b, orden: pos }
    // El movido y el que abría el día (si dejó de abrirlo) sueltan su hora fija.
    if (b.id === bloqueId || (b.id === raiz[0].id && pos !== 0)) r = { ...r, hora_inicio_fija: null, es_anclado: false, hora_fin: null }
    if (pos === 0 && llamado) r = { ...r, hora_inicio_fija: llamado, es_anclado: true }
    return r
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
