'use server'

import { createClient } from '@/lib/supabase/server'
import { temperaturaDe } from '@/lib/crm-temperatura'
import { MEDALLAS, medallasCumplidas, puntosDe, rangoDe, type DatosMedallas } from '@/lib/crm-medallas'
import { DIAS_HABILES, haceDiasHabiles } from '@/lib/ritmo'

// OJO: archivo 'use server'. Todo export tiene que ser una función async —
// exportar una constante invalida el módulo entero y el build falla señalando
// archivos que no tienen nada que ver. Las constantes van en lib/crm-medallas.ts.

export interface EstadoMedallas {
  /** Acumulado de siempre. Con esto se evalúan las únicas. */
  datos: DatosMedallas
  /** Sólo el mes en curso. Con esto se evalúan las mensuales. */
  datosMes: DatosMedallas
  /** Cuántos meses ganó cada medalla y cuándo fue la última vez. */
  ganadas: { medalla: string; veces: number; ultima: string }[]
  /** Mensuales ya conseguidas en el período actual. */
  esteMes: string[]
  /** Las que se acaban de registrar en ESTA llamada: hay que celebrarlas. */
  nuevas: string[]
  periodo: string
}

const VACIO: DatosMedallas = {
  contactos: 0, diasActivos: 0, marcasTocadas: 0, canales: 0, reuniones: 0,
  marcasQueRespondieron: 0, contactosConRespuesta: 0, respuestaAlPrimerToque: 0,
  maxToquesEnUnaMarca: 0, maxEnUnDia: 0, maxDiasEnUnaSemana: 0, madrugo: false,
  cartera: 0, carteraTocada: 0, toqueFrio: false, toqueEntrante: false,
  cierres: 0, cierresFrios: 0,
  cotizaciones: 0, cotizacionesAprobadas: 0, rodajes: 0, clientes: 0,
  reservas: 0, reservasAprobadas: 0, gastosMensuales: 0, eventosClasificados: 0,
}

interface Toque {
  prospecto_id: string
  fecha: string | null
  tipo: string | null
  respondido: boolean | null
  created_at: string
}

/** Lunes de la semana de `fecha`, como clave para agrupar. */
function semanaDe(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toLocaleDateString('en-CA')
}

/** Hora en Chile de un timestamptz. Registrar a las 7 AM es 7 AM acá, no UTC. */
function horaChile(iso: string): number {
  const h = new Date(iso).toLocaleString('en-GB', {
    timeZone: 'America/Santiago', hour: '2-digit', hour12: false,
  })
  return parseInt(h, 10)
}

/** Lo que hizo la persona fuera del CRM. Cada tabla trae su propia atribución. */
interface Taller {
  cotizaciones: number
  cotizacionesAprobadas: number
  rodajes: number
  clientes: number
  reservas: number
  reservasAprobadas: number
  gastosMensuales: number
  eventosClasificados: number
}

function agregar(
  toques: Toque[],
  mios: { id: string; etapa: string; origen: string | null }[],
  taller: Taller,
): DatosMedallas {
  const porMarca = new Map<string, Toque[]>()
  const porDia = new Map<string, number>()
  const porSemana = new Map<string, Set<string>>()
  const canales = new Set<string>()

  for (const t of toques) {
    const arr = porMarca.get(t.prospecto_id) ?? []
    arr.push(t)
    porMarca.set(t.prospecto_id, arr)
    if (t.tipo) canales.add(t.tipo)
    if (t.fecha) {
      porDia.set(t.fecha, (porDia.get(t.fecha) ?? 0) + 1)
      const s = semanaDe(t.fecha)
      const dias = porSemana.get(s) ?? new Set<string>()
      dias.add(t.fecha)
      porSemana.set(s, dias)
    }
  }

  // Marcas cuyo PRIMER contacto tuyo tuvo respuesta. Se ordena por fecha y, a
  // igualdad, por created_at: dos toques el mismo día necesitan desempate.
  let alPrimero = 0
  for (const arr of porMarca.values()) {
    const ordenados = [...arr].sort((a, b) =>
      (a.fecha ?? '').localeCompare(b.fecha ?? '') || a.created_at.localeCompare(b.created_at))
    if (ordenados[0]?.respondido) alPrimero++
  }

  const temps = new Set<string>()
  const porId = new Map(mios.map(p => [p.id, p]))
  for (const id of porMarca.keys()) {
    const p = porId.get(id)
    if (p) temps.add(temperaturaDe(p.origen))
  }

  const confirmados = mios.filter(p => p.etapa === 'confirmado')
  const conRespuesta = toques.filter(t => t.respondido)

  return {
    contactos: toques.length,
    diasActivos: new Set(toques.map(t => t.fecha).filter(Boolean)).size,
    marcasTocadas: porMarca.size,
    canales: canales.size,
    reuniones: toques.filter(t => t.tipo === 'reunion').length,
    marcasQueRespondieron: new Set(conRespuesta.map(t => t.prospecto_id)).size,
    contactosConRespuesta: conRespuesta.length,
    respuestaAlPrimerToque: alPrimero,
    maxToquesEnUnaMarca: porMarca.size ? Math.max(...[...porMarca.values()].map(a => a.length)) : 0,
    maxEnUnDia: porDia.size ? Math.max(...porDia.values()) : 0,
    maxDiasEnUnaSemana: porSemana.size ? Math.max(...[...porSemana.values()].map(s => s.size)) : 0,
    madrugo: toques.some(t => horaChile(t.created_at) < 8),
    cartera: mios.length,
    // Sólo cuenta la cartera propia: tocar prospectos de otro no es cobertura.
    carteraTocada: mios.filter(p => porMarca.has(p.id)).length,
    toqueFrio: temps.has('frio'),
    toqueEntrante: temps.has('entrante'),
    cierres: confirmados.length,
    cierresFrios: confirmados.filter(p => temperaturaDe(p.origen) === 'frio').length,
    ...taller,
  }
}

/**
 * Cuenta lo que la persona hizo en el resto de la app.
 *
 * Cada tabla trae su propia columna de atribución —`created_by`, `cargado_por_id`,
 * `clasificado_por`— y por eso se consulta una por una en vez de con un helper
 * genérico. `equipos` y `maletas` NO tienen atribución y no la van a tener
 * (decisión de ago 2026: el trabajo ahí es poco y no da para medir), así que
 * no hay medallas de ese módulo — ni se inventan asignándoselas a alguien.
 *
 * `head: true` con `count` no trae filas: sólo el número, que es todo lo que
 * necesitan estas medallas.
 */
async function contarTaller(
  supabase: Awaited<ReturnType<typeof createClient>>,
  uid: string,
  desde?: string,
): Promise<Taller> {
  const n = (r: { count: number | null }) => r.count ?? 0
  const c = (tabla: string, col: string, extra?: (q: any) => any) => {
    let q = supabase.from(tabla).select('*', { count: 'exact', head: true }).eq(col, uid)
    // `desde` acota al mes en curso, para evaluar las medallas mensuales.
    if (desde) q = q.gte('created_at', inicioChile(desde))
    if (extra) q = extra(q)
    return q
  }

  const [cot, cotAp, rod, cli, res, resAp, gas, eve] = await Promise.all([
    c('cotizaciones', 'created_by'),
    c('cotizaciones', 'created_by', q => q.eq('estado', 'aprobada')),
    c('rodajes', 'created_by'),
    c('clientes', 'created_by'),
    c('rental_reservas', 'created_by'),
    c('rental_reservas', 'aprobada_por'),
    c('rendicion_mensual_gastos', 'cargado_por_id'),
    c('eventos_calendario', 'clasificado_por'),
  ])

  return {
    cotizaciones: n(cot),
    cotizacionesAprobadas: n(cotAp),
    rodajes: n(rod),
    clientes: n(cli),
    reservas: n(res),
    reservasAprobadas: n(resAp),
    gastosMensuales: n(gas),
    eventosClasificados: n(eve),
  }
}

/**
 * Estado de medallas del usuario en sesión. Registra las que acaba de cumplir
 * y devuelve cuáles son nuevas, para celebrarlas una sola vez.
 *
 * Idempotente: el índice único (profile_id, medalla) hace que llamarla en cada
 * carga no duplique ni vuelva a celebrar.
 */
export async function revisarMedallas(): Promise<EstadoMedallas> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  const periodo = hoy.slice(0, 7)                 // YYYY-MM
  const inicioMes = `${periodo}-01`

  const vacio = { datos: VACIO, datosMes: VACIO, ganadas: [], esteMes: [], nuevas: [], periodo }
  if (!user) return vacio

  const [{ data: toques }, { data: mios }, tallerVida, tallerMes] = await Promise.all([
    // Sólo los contactos que registró ESTA persona. Los anteriores a la columna
    // tienen registrado_por NULL y no cuentan para nadie.
    supabase
      .from('crm_interacciones')
      .select('prospecto_id, fecha, tipo, respondido, created_at')
      .eq('registrado_por', user.id),
    supabase
      .from('prospectos')
      .select('id, etapa, origen')
      .eq('responsable_id', user.id),
    contarTaller(supabase, user.id),
    contarTaller(supabase, user.id, inicioMes),
  ])

  const todos = (toques ?? []) as Toque[]
  const delMes = todos.filter(t => (t.fecha ?? '').startsWith(periodo))

  const datos = agregar(todos, mios ?? [], tallerVida)
  // La cartera del mes es la misma cartera; lo que cambia es cuánto de ella
  // tocaste ESTE mes. Cubrir el 80% en un mes es un logro distinto a haberlo
  // cubierto alguna vez.
  const datosMes = agregar(delMes, mios ?? [], tallerMes)

  const { data: filas } = await supabase
    .from('crm_medallas')
    .select('medalla, ganada_en, periodo')
    .eq('profile_id', user.id)

  const previas = filas ?? []
  const alguna = new Set(previas.map(f => f.medalla))
  const delPeriodo = new Set(previas.filter(f => f.periodo === periodo).map(f => f.medalla))

  // Cada alcance se evalúa contra su propia ventana y su propia condición de
  // "ya la tengo": las únicas miran si existe cualquier fila, las mensuales si
  // existe una de este período.
  const cumpleVida = new Set(medallasCumplidas(datos))
  const cumpleMes = new Set(medallasCumplidas(datosMes))
  const nuevas = MEDALLAS.filter(m =>
    m.alcance === 'unica'
      ? cumpleVida.has(m.clave) && !alguna.has(m.clave)
      : cumpleMes.has(m.clave) && !delPeriodo.has(m.clave),
  ).map(m => m.clave)

  if (nuevas.length > 0) {
    const { error } = await supabase
      .from('crm_medallas')
      .upsert(
        nuevas.map(medalla => ({ profile_id: user.id, medalla, periodo })),
        { onConflict: 'profile_id,medalla,periodo', ignoreDuplicates: true },
      )
    if (error) {
      console.error('[medallas] no se pudieron registrar:', error.message)
      return { ...vacio, datos, datosMes, ganadas: resumir(previas), esteMes: [...delPeriodo] }
    }
  }

  const { data: finales } = await supabase
    .from('crm_medallas')
    .select('medalla, ganada_en, periodo')
    .eq('profile_id', user.id)

  const listas = finales ?? previas
  return {
    datos,
    datosMes,
    ganadas: resumir(listas),
    esteMes: listas.filter(f => f.periodo === periodo).map(f => f.medalla),
    nuevas,
    periodo,
  }
}

/** Agrupa las filas por medalla: cuántos meses y cuál fue el último. */
function resumir(filas: { medalla: string; ganada_en: string }[]) {
  const m = new Map<string, { veces: number; ultima: string }>()
  for (const f of filas) {
    const a = m.get(f.medalla) ?? { veces: 0, ultima: f.ganada_en }
    a.veces++
    if (f.ganada_en > a.ultima) a.ultima = f.ganada_en
    m.set(f.medalla, a)
  }
  return [...m.entries()].map(([medalla, v]) => ({ medalla, ...v }))
}


// ── Ritmo del período ────────────────────────────────────────────────────────

export interface EstadoRitmo {
  /** Actividad en los últimos DIAS_HABILES días hábiles. */
  actividad: number
  /** La misma ventana, corrida un período hacia atrás. */
  anterior: number
  desde: string
  detalle: { etiqueta: string; n: number }[]
}

/**
 * Instante UTC que corresponde a las 00:00 de Chile en `fecha`.
 *
 * `created_at` es un timestamp y las ventanas son fechas planas. Comparar
 * contra 'YYYY-MM-DD' pelado lo interpreta como medianoche UTC, que en Chile
 * son las 20:00 o 21:00 del día ANTERIOR — la ventana se corre y cuenta
 * actividad que no corresponde. Y el desfase no es fijo: Chile cambia de hora.
 *
 * El offset se saca con formatToParts y NO con
 * `new Date(fecha.toLocaleString('en-US', { timeZone }))`, que es el truco de
 * siempre y está mal: ese string se re-parsea en la zona del PROCESO, así que
 * da correcto sólo si el servidor corre en UTC. En Vercel corre en UTC y en un
 * equipo chileno no — habría dado bien en producción y mal en desarrollo, que
 * es la peor forma de estar roto.
 *
 * LÍMITE CONOCIDO: el día que Chile adelanta la hora (primer domingo de
 * septiembre) la medianoche no existe — el reloj salta de 00:00 a 01:00 — y el
 * borde cae en las 23:00 del día anterior. Es una hora de más en un extremo de
 * una ventana de diez días hábiles, dos veces al año. Corregirlo cuesta más de
 * lo que arregla.
 */
const FMT_CHILE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Santiago', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function inicioChile(fecha: string): string {
  // Mediodía para sondear el offset sin caer en el salto de horario.
  const sonda = new Date(fecha + 'T12:00:00Z')
  const p: Record<string, string> = {}
  for (const x of FMT_CHILE.formatToParts(sonda)) p[x.type] = x.value
  // La hora de pared de Chile, leída COMO SI fuera UTC.
  const pared = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  const offset = pared - sonda.getTime()          // negativo: Chile va detrás
  const [a, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d) - offset).toISOString()
}

/** Tablas que cuentan como actividad, con su columna de atribución. */
const FUENTES: { tabla: string; col: string; etiqueta: string }[] = [
  { tabla: 'crm_interacciones',        col: 'registrado_por',  etiqueta: 'contactos' },
  { tabla: 'cotizaciones',             col: 'created_by',      etiqueta: 'cotizaciones' },
  { tabla: 'rodajes',                  col: 'created_by',      etiqueta: 'rodajes' },
  { tabla: 'rental_reservas',          col: 'created_by',      etiqueta: 'reservas' },
  { tabla: 'clientes',                 col: 'created_by',      etiqueta: 'clientes' },
  { tabla: 'rendicion_mensual_gastos', col: 'cargado_por_id',  etiqueta: 'gastos' },
  { tabla: 'eventos_calendario',       col: 'clasificado_por', etiqueta: 'eventos' },
]

/**
 * Ritmo de trabajo del período. Cuenta actividad en TODA la app, no sólo
 * captación: una semana de rodaje daría cero si midiera contactos, y la
 * persona estaría trabajando a full.
 */
export async function getRitmo(): Promise<EstadoRitmo> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  const desde = haceDiasHabiles(hoy, DIAS_HABILES)
  const desdeAnterior = haceDiasHabiles(desde, DIAS_HABILES)

  if (!user) return { actividad: 0, anterior: 0, desde, detalle: [] }

  const contar = (tabla: string, col: string, a: string, b?: string) => {
    let q = supabase.from(tabla).select('*', { count: 'exact', head: true })
      .eq(col, user.id)
      .gte('created_at', inicioChile(a))
    if (b) q = q.lt('created_at', inicioChile(b))
    return q
  }

  const [actuales, previos] = await Promise.all([
    Promise.all(FUENTES.map(f => contar(f.tabla, f.col, desde))),
    Promise.all(FUENTES.map(f => contar(f.tabla, f.col, desdeAnterior, desde))),
  ])

  const detalle = FUENTES
    .map((f, i) => ({ etiqueta: f.etiqueta, n: actuales[i].count ?? 0 }))
    .filter(d => d.n > 0)

  return {
    actividad: actuales.reduce((t, r) => t + (r.count ?? 0), 0),
    anterior: previos.reduce((t, r) => t + (r.count ?? 0), 0),
    desde,
    detalle,
  }
}


// ── Tira del sidebar ─────────────────────────────────────────────────────────

export interface UltimasMedallas {
  claves: string[]
  total: number
  rango: string
  /** Avance hacia el rango siguiente, 0–1. En el último rango es 1. */
  fraccion: number
}

/**
 * Las últimas medallas y el rango, para la tira del sidebar.
 *
 * Consulta aparte y liviana: el sidebar está en todas las páginas y no puede
 * pagar el costo de `revisarMedallas`, que recorre siete tablas.
 */
export async function ultimasMedallas(cuantas = 4): Promise<UltimasMedallas> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claves: [], total: 0, rango: '', fraccion: 0 }

  const { data } = await supabase
    .from('crm_medallas')
    .select('medalla, ganada_en')
    .eq('profile_id', user.id)
    .order('ganada_en', { ascending: false })

  const filas = data ?? []
  const distintas = [...new Set(filas.map(f => f.medalla))]
  const r = rangoDe(puntosDe(distintas))
  return {
    claves: distintas.slice(0, cuantas),
    total: distintas.length,
    rango: r.actual.titulo,
    fraccion: r.fraccion,
  }
}

// ── Resumen: día, semana y mes ───────────────────────────────────────────────

export type Ventana = 'dia' | 'semana' | 'mes'

export interface Resumen {
  ventana: Ventana
  desde: string
  total: number
  detalle: { etiqueta: string; n: number }[]
}

/**
 * Qué hiciste hoy, esta semana o este mes.
 *
 * El ritmo responde "¿cómo vengo?" sobre diez días hábiles; esto responde
 * "¿qué hice?" sobre una ventana que la persona elige. Son preguntas distintas
 * y por eso no se fusionaron: una es tendencia, la otra es inventario.
 */
export async function getResumen(ventana: Ventana): Promise<Resumen> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })

  let desde = hoy
  if (ventana === 'semana') {
    const d = new Date(hoy + 'T12:00:00')
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))    // lunes
    desde = d.toLocaleDateString('en-CA')
  } else if (ventana === 'mes') {
    desde = hoy.slice(0, 7) + '-01'
  }

  if (!user) return { ventana, desde, total: 0, detalle: [] }

  const res = await Promise.all(FUENTES.map(f =>
    supabase.from(f.tabla).select('*', { count: 'exact', head: true })
      .eq(f.col, user.id)
      .gte('created_at', inicioChile(desde)),
  ))

  const detalle = FUENTES
    .map((f, i) => ({ etiqueta: f.etiqueta, n: res[i].count ?? 0 }))
    .filter(d => d.n > 0)

  return { ventana, desde, total: res.reduce((t, r) => t + (r.count ?? 0), 0), detalle }
}
