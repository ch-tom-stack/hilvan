'use server'

import { createClient } from '@/lib/supabase/server'
import { temperaturaDe } from '@/lib/crm-temperatura'
import { medallasCumplidas, type DatosMedallas } from '@/lib/crm-medallas'

// OJO: archivo 'use server'. Todo export tiene que ser una función async —
// exportar una constante invalida el módulo entero y el build falla señalando
// archivos que no tienen nada que ver. Las constantes van en lib/crm-medallas.ts.

export interface EstadoMedallas {
  datos: DatosMedallas
  ganadas: { medalla: string; ganada_en: string }[]
  /** Las que se acaban de registrar en ESTA llamada: hay que celebrarlas. */
  nuevas: string[]
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
 * genérico. `equipos` y `maletas` NO tienen atribución: no hay medallas de
 * equipos, y no se inventa una asignándoselas a alguien.
 *
 * `head: true` con `count` no trae filas: sólo el número, que es todo lo que
 * necesitan estas medallas.
 */
async function contarTaller(
  supabase: Awaited<ReturnType<typeof createClient>>,
  uid: string,
): Promise<Taller> {
  const n = (r: { count: number | null }) => r.count ?? 0
  const c = (tabla: string, col: string, extra?: (q: any) => any) => {
    let q = supabase.from(tabla).select('*', { count: 'exact', head: true }).eq(col, uid)
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
  if (!user) return { datos: VACIO, ganadas: [], nuevas: [] }

  const [{ data: toques }, { data: mios }, taller] = await Promise.all([
    // Sólo los contactos que registró ESTA persona. Los anteriores a la columna
    // tienen registrado_por NULL y no cuentan para nadie — atribuirlos sería
    // inventar el dato.
    supabase
      .from('crm_interacciones')
      .select('prospecto_id, fecha, tipo, respondido, created_at')
      .eq('registrado_por', user.id),
    // Los cierres y la cobertura se atribuyen por responsable: el prospecto ES suyo.
    supabase
      .from('prospectos')
      .select('id, etapa, origen')
      .eq('responsable_id', user.id),
    contarTaller(supabase, user.id),
  ])

  const datos = agregar((toques ?? []) as Toque[], mios ?? [], taller)

  const { data: yaTiene } = await supabase
    .from('crm_medallas')
    .select('medalla, ganada_en')
    .eq('profile_id', user.id)

  const registradas = new Set((yaTiene ?? []).map(m => m.medalla))
  const nuevas = medallasCumplidas(datos).filter(m => !registradas.has(m))

  if (nuevas.length > 0) {
    const { error } = await supabase
      .from('crm_medallas')
      .upsert(
        nuevas.map(medalla => ({ profile_id: user.id, medalla })),
        { onConflict: 'profile_id,medalla', ignoreDuplicates: true },
      )
    if (error) {
      console.error('[medallas] no se pudieron registrar:', error.message)
      return { datos, ganadas: yaTiene ?? [], nuevas: [] }
    }
  }

  const { data: finales } = await supabase
    .from('crm_medallas')
    .select('medalla, ganada_en')
    .eq('profile_id', user.id)
    .order('ganada_en', { ascending: false })

  return { datos, ganadas: finales ?? [], nuevas }
}
