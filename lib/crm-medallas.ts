// Medallas del CRM.
//
// LA NARRATIVA. La app se llama Hilván: la puntada provisional que sostiene la
// tela antes de la costura definitiva. Captar es exactamente eso — puntadas que
// puede que se suelten, y algunas se vuelven costura.
//
// Los tres capítulos son el arco real de un prospecto, y los tres tienen doble
// sentido que le sirve a una productora:
//   I  · Hilvanar     — dar la primera puntada. También: hilvanar ideas.
//   II · La trama     — la hebra que cruza y sostiene la tela. También: la historia.
//   III· La costura   — cuando el hilván provisional se vuelve costura de verdad.
//
// CUATRO REGLAS, todas de problemas reales:
//
// 1. NINGUNA compara personas. En un equipo de cuatro que se ve entre sí,
//    comparar mide quién recibió más prospectos — el reparto, no el trabajo.
//    (docs/crm/operador-contexto.md §6)
//
// 2. Los criterios visibles se ven ANTES de ganarse. La gracia está en verlas
//    venir. Las OCULTAS son otra categoría: se anuncia que existen y cuántas
//    son, pero no cuáles — y todas se ganan trabajando normal, nunca haciendo
//    algo raro a propósito.
//
// 3. NINGUNA premia volumen en un día por encima de lo que es una jornada real.
//    Una medalla por "20 contactos en un día" es una invitación a inventar
//    toques, y el contador de la tarjeta es la única señal honesta del tablero.
//
// 4. Los porcentajes exigen piso. Un 100% de respuesta con un contacto no dice
//    nada; sin mínimo, la medalla premia no haber trabajado.

export type Capitulo = 'hilvanar' | 'trama' | 'costura' | 'taller'

/** Peso visual. Sin esto, tener veintiséis vale lo mismo que tener las fáciles. */
export type Rareza = 'comun' | 'dificil' | 'rara' | 'legendaria'

/**
 * `unica`   — primeras veces e hitos de carrera. Se gana una vez y queda.
 * `mensual` — describe un buen MES: se reinicia y acumula nivel. Sus números
 *             se leen como mensuales, no como totales de por vida.
 */
export type Alcance = 'unica' | 'mensual'

export interface DefinicionMedalla {
  clave: string
  alcance: Alcance
  titulo: string
  capitulo: Capitulo
  rareza: Rareza
  /** Qué hay que hacer. En las ocultas se revela recién al ganarla. */
  criterio: string
  /** Por qué vale. Sólo cuando no es evidente. */
  nota?: string
  /** No se anuncia: aparece como incógnita hasta que se gana. */
  oculta?: boolean
}

export const CAPITULOS: { clave: Capitulo; numero: string; titulo: string; bajada: string }[] = [
  {
    clave: 'hilvanar',
    numero: 'I',
    titulo: 'Hilvanar',
    bajada: 'La primera puntada. Sólo pide aparecer.',
  },
  {
    clave: 'trama',
    numero: 'II',
    titulo: 'La trama',
    bajada: 'La hebra que cruza y sostiene la tela. Es la parte que cuesta, y la que nadie ve.',
  },
  {
    clave: 'costura',
    numero: 'III',
    titulo: 'La costura',
    bajada: 'Cuando el hilván se vuelve costura de verdad.',
  },
  {
    clave: 'taller',
    numero: 'IV',
    titulo: 'El taller',
    bajada: 'El resto del oficio: cotizar, rodar, arrendar, atender.',
  },
]

// ── Rangos ───────────────────────────────────────────────────────────────────
// Progreso profesional, no colección. Los rangos son etapas reales de la
// costura y la última es una técnica de verdad: la puntada invisible es la más
// difícil justamente porque no se ve. Es la idea del oficio bien hecho.

const PUNTOS_POR_RAREZA: Record<Rareza, number> = {
  comun: 1, dificil: 3, rara: 6, legendaria: 12,
}

export interface Rango {
  titulo: string
  desde: number
  glosa: string
}

// Calibrados contra los 154 puntos totales. La primera versión (0/8/22/45/80)
// dejaba a alguien en el penúltimo rango al PRIMER MES: el tope tiene que ser
// una aspiración de años, no de ocho semanas, o deja de significar algo.
export const RANGOS: Rango[] = [
  { titulo: 'Hilván suelto',     desde: 0,   glosa: 'Las primeras puntadas. Todavía se sueltan.' },
  { titulo: 'Hilván firme',      desde: 12,  glosa: 'La tela ya aguanta que la muevan.' },
  { titulo: 'Puntada segura',    desde: 35,  glosa: 'Ya no se deshace sola.' },
  { titulo: 'Costura',           desde: 70,  glosa: 'Lo provisional se volvió definitivo.' },
  { titulo: 'Puntada invisible', desde: 115, glosa: 'La más difícil: la que no se nota.' },
]

/**
 * Puntos del rango global. Cuenta medallas DISTINTAS: las repeticiones suman
 * nivel, no puntos. Si sumaran, el rango máximo llegaría solo con el tiempo y
 * dejaría de significar algo — amplitud y profundidad son ejes separados.
 */
export function puntosDe(claves: string[]): number {
  const porClave = new Map(MEDALLAS.map(m => [m.clave, m]))
  return [...new Set(claves)].reduce((t, c) => {
    const m = porClave.get(c)
    return t + (m ? PUNTOS_POR_RAREZA[m.rareza] : 0)
  }, 0)
}

export function puntosTotales(): number {
  return MEDALLAS.reduce((t, m) => t + PUNTOS_POR_RAREZA[m.rareza], 0)
}

/** Rango actual y cuánto falta para el próximo (null si ya es el último). */
export function rangoDe(puntos: number): { actual: Rango; siguiente: Rango | null; fraccion: number } {
  let i = 0
  for (let k = 0; k < RANGOS.length; k++) if (puntos >= RANGOS[k].desde) i = k
  const actual = RANGOS[i]
  const siguiente = RANGOS[i + 1] ?? null
  const fraccion = siguiente
    ? Math.max(0, Math.min(1, (puntos - actual.desde) / (siguiente.desde - actual.desde)))
    : 1
  return { actual, siguiente, fraccion }
}

export const MEDALLAS: DefinicionMedalla[] = [
  // ── I · Hilvanar ──────────────────────────────────────────────────────────
  { clave: 'primer_contacto', alcance: 'unica', titulo: 'La primera puntada', capitulo: 'hilvanar', rareza: 'comun',
    criterio: 'Registrar tu primer contacto.' },
  { clave: 'diez_marcas', alcance: 'mensual', titulo: 'Diez telas', capitulo: 'hilvanar', rareza: 'comun',
    criterio: 'Tocar 10 marcas distintas.',
    nota: 'Cuentan las marcas, no los toques: diez contactos a una sola marca no es esto.' },
  { clave: 'cuatro_canales', alcance: 'mensual', titulo: 'Todas las agujas', capitulo: 'hilvanar', rareza: 'comun',
    criterio: 'Usar los cuatro canales: correo, llamada, mensaje y reunión.' },
  { clave: 'primera_reunion', alcance: 'unica', titulo: 'Cara a cara', capitulo: 'hilvanar', rareza: 'dificil',
    criterio: 'Registrar tu primera reunión.' },
  { clave: 'primer_frio', alcance: 'unica', titulo: 'Sin red', capitulo: 'hilvanar', rareza: 'comun',
    criterio: 'Tocar tu primer prospecto nacido en frío.',
    nota: 'Nadie levantó la mano: escribes tú primero.' },

  // ── II · La trama ─────────────────────────────────────────────────────────
  { clave: 'diez_contactos', alcance: 'mensual', titulo: 'Mano firme', capitulo: 'trama', rareza: 'comun',
    criterio: 'Registrar 10 contactos.' },
  { clave: 'cincuenta_contactos', alcance: 'mensual', titulo: 'Cincuenta', capitulo: 'trama', rareza: 'dificil',
    criterio: 'Registrar 50 contactos.' },
  { clave: 'cien_contactos', alcance: 'unica', titulo: 'Cien puntadas', capitulo: 'trama', rareza: 'rara',
    criterio: 'Registrar 100 contactos.',
    nota: 'La constancia es la parte difícil, no el arranque.' },
  { clave: 'quinientos_contactos', alcance: 'unica', titulo: 'Tejedora', capitulo: 'trama', rareza: 'legendaria',
    criterio: 'Registrar 500 contactos.' },
  { clave: 'veinte_dias', alcance: 'mensual', titulo: 'Veinte jornadas', capitulo: 'trama', rareza: 'dificil',
    criterio: 'Registrar algo en 20 días distintos.',
    nota: 'No tienen que ser seguidos. Faltar no rompe nada.' },
  { clave: 'cincuenta_dias', alcance: 'unica', titulo: 'Cincuenta jornadas', capitulo: 'trama', rareza: 'rara',
    criterio: 'Registrar algo en 50 días distintos.' },
  { clave: 'no_soltar', alcance: 'unica', titulo: 'No soltar', capitulo: 'trama', rareza: 'dificil',
    criterio: 'Llevar una marca hasta el contacto 16.',
    nota: 'El tope del mapa de calor de la tarjeta.' },
  { clave: 'treinta_marcas', alcance: 'mensual', titulo: 'Treinta telas', capitulo: 'trama', rareza: 'dificil',
    criterio: 'Tocar 30 marcas distintas.' },
  { clave: 'cobertura', alcance: 'mensual', titulo: 'Nadie olvidado', capitulo: 'trama', rareza: 'rara',
    criterio: 'Tener al menos un contacto registrado en el 80% de tu cartera.',
    nota: 'Mide cobertura, no volumen: se gana atendiendo a todos, no insistiéndole a pocos.' },
  { clave: 'ambas_temperaturas', alcance: 'mensual', titulo: 'Frío y tibio', capitulo: 'trama', rareza: 'comun',
    criterio: 'Tocar prospectos nacidos en frío y prospectos entrantes.' },

  // ── III · La costura ──────────────────────────────────────────────────────
  { clave: 'primera_respuesta', alcance: 'unica', titulo: 'Del otro lado', capitulo: 'costura', rareza: 'comun',
    criterio: 'Que una marca responda a un contacto tuyo.' },
  { clave: 'cinco_responden', alcance: 'mensual', titulo: 'Cinco voces', capitulo: 'costura', rareza: 'dificil',
    criterio: 'Que 5 marcas distintas te respondan.' },
  { clave: 'quince_responden', alcance: 'unica', titulo: 'Quince voces', capitulo: 'costura', rareza: 'rara',
    criterio: 'Que 15 marcas distintas te respondan.' },
  { clave: 'tasa_veinte', alcance: 'mensual', titulo: 'Uno de cinco', capitulo: 'costura', rareza: 'dificil',
    criterio: '20% de tus contactos con respuesta, sobre al menos 20 contactos.',
    nota: 'Porcentual: mejora escribiendo mejor, no escribiendo más.' },
  { clave: 'tasa_treinta', alcance: 'mensual', titulo: 'Uno de tres', capitulo: 'costura', rareza: 'legendaria',
    criterio: '33% de respuesta, sobre al menos 30 contactos.' },
  { clave: 'primer_cierre', alcance: 'unica', titulo: 'Costura firme', capitulo: 'costura', rareza: 'rara',
    criterio: 'Que un prospecto tuyo llegue a Confirmado.' },
  { clave: 'tres_cierres', alcance: 'unica', titulo: 'Tres costuras', capitulo: 'costura', rareza: 'legendaria',
    criterio: 'Cerrar 3 prospectos.' },
  { clave: 'frio_a_cierre', alcance: 'unica', titulo: 'De la nada', capitulo: 'costura', rareza: 'legendaria',
    criterio: 'Cerrar un prospecto que había nacido en frío.',
    nota: 'Lo más difícil del módulo: nadie había levantado la mano.' },

  // ── IV · El taller ────────────────────────────────────────────────────────
  // Todas se atribuyen por `created_by` de su tabla, salvo las que se indican.
  { clave: 'primera_cotizacion', alcance: 'unica', titulo: 'El primer número', capitulo: 'taller', rareza: 'comun',
    criterio: 'Crear tu primera cotización.' },
  { clave: 'diez_cotizaciones', alcance: 'unica', titulo: 'Diez presupuestos', capitulo: 'taller', rareza: 'dificil',
    criterio: 'Crear 10 cotizaciones.' },
  { clave: 'cotizacion_aprobada', alcance: 'unica', titulo: 'Aprobada', capitulo: 'taller', rareza: 'rara',
    criterio: 'Que una cotización tuya sea aprobada.' },
  { clave: 'primer_rodaje', alcance: 'unica', titulo: 'Acción', capitulo: 'taller', rareza: 'comun',
    criterio: 'Crear tu primer rodaje.' },
  { clave: 'cinco_rodajes', alcance: 'unica', titulo: 'Cinco claquetas', capitulo: 'taller', rareza: 'dificil',
    criterio: 'Crear 5 rodajes.' },
  { clave: 'primer_cliente', alcance: 'unica', titulo: 'Casa nueva', capitulo: 'taller', rareza: 'comun',
    criterio: 'Dar de alta un cliente.' },
  { clave: 'primera_reserva', alcance: 'unica', titulo: 'Salió del rack', capitulo: 'taller', rareza: 'comun',
    criterio: 'Crear tu primera reserva de rental.' },
  { clave: 'reserva_aprobada', alcance: 'unica', titulo: 'Con tu firma', capitulo: 'taller', rareza: 'dificil',
    criterio: 'Aprobar una reserva de rental.' },
  { clave: 'primera_rendicion', alcance: 'unica', titulo: 'Cuentas claras', capitulo: 'taller', rareza: 'comun',
    criterio: 'Cargar tu primer gasto en la rendición mensual.' },
  { clave: 'calendario_limpio', alcance: 'mensual', titulo: 'Todo en su lugar', capitulo: 'taller', rareza: 'dificil',
    criterio: 'Clasificar 20 eventos del calendario.' },
  { clave: 'oficio_completo', alcance: 'unica', titulo: 'El oficio completo', capitulo: 'taller', rareza: 'legendaria',
    criterio: 'Haber hecho algo en CRM, cotizaciones, rodaje y rental.',
    nota: 'La única que no se gana especializándose.' },

  // ── Sorpresas ─────────────────────────────────────────────────────────────
  // Todas se ganan trabajando normal. Ninguna pide hacer algo raro a propósito,
  // y ninguna premia inflar el contador.
  { clave: 'madrugar', alcance: 'mensual', titulo: 'Antes que nadie', capitulo: 'trama', rareza: 'dificil', oculta: true,
    criterio: 'Registrar un contacto antes de las 8 de la mañana.' },
  { clave: 'jornada_llena', alcance: 'mensual', titulo: 'Buena mañana', capitulo: 'trama', rareza: 'comun', oculta: true,
    criterio: 'Registrar 5 contactos en un mismo día.' },
  { clave: 'a_la_primera', alcance: 'mensual', titulo: 'A la primera', capitulo: 'costura', rareza: 'rara', oculta: true,
    criterio: 'Que una marca responda a tu primer contacto con ella.' },
  { clave: 'una_semana_viva', alcance: 'mensual', titulo: 'Semana entera', capitulo: 'trama', rareza: 'dificil', oculta: true,
    criterio: 'Registrar algo cinco días distintos dentro de una misma semana.' },
]

/**
 * Meses ganados a los que el emblema gana presencia. Veinte son casi dos años
 * ganando la misma medalla todos los meses: el último nivel tiene que ser algo
 * que casi nadie tenga, o deja de decir nada.
 */
export const HITOS_NIVEL = [5, 10, 20]

export function nivelDe(veces: number): 0 | 1 | 2 | 3 {
  if (veces >= 20) return 3
  if (veces >= 10) return 2
  if (veces >= 5) return 1
  return 0
}

export function esMensual(clave: string): boolean {
  return MEDALLAS.find(m => m.clave === clave)?.alcance === 'mensual'
}

export const RAREZA_LABEL: Record<Rareza, string> = {
  comun:      '',           // lo común no se anuncia
  dificil:    'Difícil',
  rara:       'Rara',
  legendaria: 'Legendaria',
}

/** Datos con los que se evalúa todo. Se arman una vez por persona en la acción. */
export interface DatosMedallas {
  contactos: number
  diasActivos: number
  marcasTocadas: number
  /** Canales distintos usados (correo, llamada, mensaje, reunion). */
  canales: number
  reuniones: number
  /** Marcas distintas que respondieron. */
  marcasQueRespondieron: number
  /** Contactos con respuesta, para la tasa. */
  contactosConRespuesta: number
  /** Marcas cuyo PRIMER contacto tuyo tuvo respuesta. */
  respuestaAlPrimerToque: number
  maxToquesEnUnaMarca: number
  /** Contactos en el día más cargado. */
  maxEnUnDia: number
  /** Días distintos dentro de la mejor semana. */
  maxDiasEnUnaSemana: number
  /** Registró algo antes de las 8 AM alguna vez. */
  madrugo: boolean
  /** Prospectos a su cargo. Denominador de la cobertura. */
  cartera: number
  /** De su cartera, cuántos tienen al menos un contacto registrado por él. */
  carteraTocada: number
  toqueFrio: boolean
  toqueEntrante: boolean
  cierres: number
  cierresFrios: number

  // ── El taller: el resto de la app ──────────────────────────────────────────
  cotizaciones: number
  cotizacionesAprobadas: number
  rodajes: number
  clientes: number
  reservas: number
  reservasAprobadas: number
  gastosMensuales: number
  eventosClasificados: number
}

const CANALES_TOTALES = 4

/** Claves que la persona YA cumple, se hayan registrado o no. */
export function medallasCumplidas(d: DatosMedallas): string[] {
  const g: string[] = []
  const si = (cond: boolean, clave: string) => { if (cond) g.push(clave) }
  const tasa = d.contactos > 0 ? d.contactosConRespuesta / d.contactos : 0

  si(d.contactos >= 1, 'primer_contacto')
  si(d.marcasTocadas >= 10, 'diez_marcas')
  si(d.canales >= CANALES_TOTALES, 'cuatro_canales')
  si(d.reuniones >= 1, 'primera_reunion')
  si(d.toqueFrio, 'primer_frio')

  si(d.contactos >= 10, 'diez_contactos')
  si(d.contactos >= 50, 'cincuenta_contactos')
  si(d.contactos >= 100, 'cien_contactos')
  si(d.contactos >= 500, 'quinientos_contactos')
  si(d.diasActivos >= 20, 'veinte_dias')
  si(d.diasActivos >= 50, 'cincuenta_dias')
  si(d.maxToquesEnUnaMarca >= 16, 'no_soltar')
  si(d.marcasTocadas >= 30, 'treinta_marcas')
  // Piso de cartera: con 3 prospectos, "80% cubierto" no es un logro.
  si(d.cartera >= 10 && d.carteraTocada / d.cartera >= 0.8, 'cobertura')
  si(d.toqueFrio && d.toqueEntrante, 'ambas_temperaturas')

  si(d.marcasQueRespondieron >= 1, 'primera_respuesta')
  si(d.marcasQueRespondieron >= 5, 'cinco_responden')
  si(d.marcasQueRespondieron >= 15, 'quince_responden')
  si(d.contactos >= 20 && tasa >= 0.20, 'tasa_veinte')
  si(d.contactos >= 30 && tasa >= 1 / 3, 'tasa_treinta')
  si(d.cierres >= 1, 'primer_cierre')
  si(d.cierres >= 3, 'tres_cierres')
  si(d.cierresFrios >= 1, 'frio_a_cierre')

  si(d.cotizaciones >= 1, 'primera_cotizacion')
  si(d.cotizaciones >= 10, 'diez_cotizaciones')
  si(d.cotizacionesAprobadas >= 1, 'cotizacion_aprobada')
  si(d.rodajes >= 1, 'primer_rodaje')
  si(d.rodajes >= 5, 'cinco_rodajes')
  si(d.clientes >= 1, 'primer_cliente')
  si(d.reservas >= 1, 'primera_reserva')
  si(d.reservasAprobadas >= 1, 'reserva_aprobada')
  si(d.gastosMensuales >= 1, 'primera_rendicion')
  si(d.eventosClasificados >= 20, 'calendario_limpio')
  si(d.contactos >= 1 && d.cotizaciones >= 1 && d.rodajes >= 1 && d.reservas >= 1, 'oficio_completo')

  si(d.madrugo, 'madrugar')
  si(d.maxEnUnDia >= 5, 'jornada_llena')
  si(d.respuestaAlPrimerToque >= 1, 'a_la_primera')
  si(d.maxDiasEnUnaSemana >= 5, 'una_semana_viva')

  return g
}

/**
 * Progreso hacia una medalla no ganada. Devuelve null en las que no son de
 * conteo — un "60% de que te respondan" no significa nada, y fingir precisión
 * es peor que no mostrar.
 */
export function progresoMedalla(
  clave: string,
  d: DatosMedallas,
): { fraccion: number; texto: string } | null {
  const p = (hecho: number, meta: number, unidad: string) => ({
    fraccion: Math.max(0, Math.min(1, hecho / meta)),
    texto: `${Math.min(Math.round(hecho), meta)} de ${meta} ${unidad}`,
  })
  const tasa = d.contactos > 0 ? d.contactosConRespuesta / d.contactos : 0

  switch (clave) {
    case 'primer_contacto':      return p(d.contactos, 1, 'contactos')
    case 'diez_marcas':          return p(d.marcasTocadas, 10, 'marcas')
    case 'treinta_marcas':       return p(d.marcasTocadas, 30, 'marcas')
    case 'cuatro_canales':       return p(d.canales, CANALES_TOTALES, 'canales')
    case 'diez_contactos':       return p(d.contactos, 10, 'contactos')
    case 'cincuenta_contactos':  return p(d.contactos, 50, 'contactos')
    case 'cien_contactos':       return p(d.contactos, 100, 'contactos')
    case 'quinientos_contactos': return p(d.contactos, 500, 'contactos')
    case 'veinte_dias':          return p(d.diasActivos, 20, 'días')
    case 'cincuenta_dias':       return p(d.diasActivos, 50, 'días')
    case 'no_soltar':            return p(d.maxToquesEnUnaMarca, 16, 'contactos')
    case 'cinco_responden':      return p(d.marcasQueRespondieron, 5, 'marcas')
    case 'quince_responden':     return p(d.marcasQueRespondieron, 15, 'marcas')
    case 'tres_cierres':         return p(d.cierres, 3, 'cierres')
    case 'diez_cotizaciones':    return p(d.cotizaciones, 10, 'cotizaciones')
    case 'cinco_rodajes':        return p(d.rodajes, 5, 'rodajes')
    case 'calendario_limpio':    return p(d.eventosClasificados, 20, 'eventos')
    case 'cobertura':
      // Antes del piso se muestra el avance HACIA el piso: si no, alguien con
      // 4 prospectos todos tocados vería 100% y la medalla no llegaría nunca.
      if (d.cartera < 10) return p(d.cartera, 10, 'en cartera')
      return { fraccion: Math.min(1, (d.carteraTocada / d.cartera) / 0.8), texto: `${Math.round((d.carteraTocada / d.cartera) * 100)}% de 80%` }
    case 'tasa_veinte':
      if (d.contactos < 20) return p(d.contactos, 20, 'contactos')
      return { fraccion: Math.min(1, tasa / 0.20), texto: `${Math.round(tasa * 100)}% de 20%` }
    case 'tasa_treinta':
      if (d.contactos < 30) return p(d.contactos, 30, 'contactos')
      return { fraccion: Math.min(1, tasa / (1 / 3)), texto: `${Math.round(tasa * 100)}% de 33%` }
    default:                     return null
  }
}

/** Las que se anuncian. Las ocultas viven aparte hasta ganarse. */
export function visiblesDe(capitulo: Capitulo): DefinicionMedalla[] {
  return MEDALLAS.filter(m => m.capitulo === capitulo && !m.oculta)
}

export function ocultas(): DefinicionMedalla[] {
  return MEDALLAS.filter(m => m.oculta)
}
