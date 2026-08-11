// Bus de momentos de Hilván.
//
// Un "momento" es algo que le pasó al usuario y que la app debe acusar: un
// contacto registrado, una factura emitida, un pago recibido. Cada momento
// resuelve en UN solo lugar su sonido, su celebración y su toast — así el
// diseño de feedback de toda la app se ajusta editando este archivo, en vez de
// ir componente por componente.
//
// Uso desde un componente cliente:
//
//     import { momento } from '@/lib/momentos'
//
//     momento('crm.contacto')                                  // tick + toast
//     momento('pago.recibido', { monto: 4_500_000 })           // celebración escalada
//     momento('guardado', { mensaje: 'Notas guardadas' })      // toast propio
//
// CUÁNDO LLAMARLO — hay dos casos, y la diferencia importa:
//
//  1. Micro-feedback local (tap, check, copiar, avanzar una etapa con
//     optimistic update): llamar DENTRO del gesto, antes del `await`. Sobre
//     ~100 ms el sonido deja de leerse como consecuencia de la acción propia,
//     y estas acciones casi no fallan.
//
//  2. Eventos confirmados por el servidor (pago, factura, cierre): llamar
//     DESPUÉS del `await`. Celebrar algo que después falla es peor que 200 ms
//     de latencia — y como la celebración dura ~1 s, el retraso no rompe el
//     vínculo causal igual que en un tick de 40 ms. Si falla: `momento('error')`.
//
// Ver docs/gamificacion/auditoria.md (R1) y sonidos.md.

import { reproducir, type TokenSfx } from './sfx'
import { confetti, montoHero, claqueta, type Intensidad, type DatosClaqueta } from './celebrate'
import { toastOk, toastError } from './toast'

export type NombreMomento =
  // Dinero — los momentos que más le importan a la casa
  | 'pago.recibido' | 'factura.emitida' | 'cotizacion.aprobada' | 'cotizacion.enviada'
  | 'movimiento.conciliado' | 'gasto.creado' | 'gasto.pagado' | 'factura.reconocida'
  // CRM
  | 'crm.contacto' | 'crm.avance' | 'crm.retroceso' | 'crm.enfriado' | 'crm.cierre' | 'lead.entrante'
  // Rodaje
  | 'rodaje.publicado' | 'rodaje.finalizado' | 'citaciones.enviadas'
  // Equipos
  | 'qr.escaneado'
  // CH-1 Equipos y maletas. Ninguno estrena sonido: el set ya cubría estas
  // acciones, lo que faltaba era la semántica y la llamada.
  | 'equipo.creado' | 'equipo.guardado' | 'equipo.eliminado'
  | 'equipo.rentable' | 'equipo.rentable_off'
  | 'maleta.creada' | 'maleta.convertida' | 'nota.agregada'
  // Genéricos: agregar y quitar filas de una lista. Los usa Rental y sirven
  // para cotizaciones y rodaje — mejor que un par por módulo.
  | 'item.agregado' | 'item.eliminado'
  // CH-9 Rental. Tampoco estrena sonido.
  | 'rental.solicitada' | 'rental.aprobada' | 'rental.denegada' | 'rental.cotizacion'
  // Progreso personal
  | 'checklist.marcado' | 'checklist.desmarcado'
  | 'meta.cumplida' | 'hito.alcanzado'
  // Genéricos de CRUD
  | 'creado' | 'guardado' | 'eliminado' | 'enviado' | 'subido' | 'copiado'
  | 'pdf.generado' | 'sesion.inicio' | 'sesion.fin'
  // Negativos
  | 'error' | 'atencion'

type NivelToast = 'ninguno' | 'normal' | 'hito'

interface Definicion {
  sonido?: TokenSfx
  celebracion?: Intensidad
  toast?: NivelToast
  /** Mensaje por defecto; se puede sobreescribir con `opts.mensaje`. */
  mensaje?: string
}

// `toast: 'ninguno'` es deliberado en las acciones muy repetidas: el elemento
// que cambia ya es el feedback, y un toast por cada una sería ruido.
const CATALOGO: Record<NombreMomento, Definicion> = {
  'pago.recibido':        { sonido: 'win-pago',       celebracion: 'hito',   toast: 'hito',   mensaje: 'Pago registrado' },
  'factura.emitida':      { sonido: 'win-factura',    celebracion: 'chico',  toast: 'normal', mensaje: 'Factura registrada' },
  'cotizacion.aprobada':  { sonido: 'win-cierre',     celebracion: 'hito',   toast: 'hito',   mensaje: 'Cotización aprobada' },
  'cotizacion.enviada':   { sonido: 'ok-enviar',     celebracion: 'micro',  toast: 'normal', mensaje: 'Cotización enviada' },
  'movimiento.conciliado':{ sonido: 'conciliar-match', celebracion: 'micro', toast: 'ninguno' },
  'gasto.creado':         { sonido: 'ok-registrar',  celebracion: 'micro',  toast: 'ninguno' },
  'gasto.pagado':         { sonido: 'ok-guardar',    celebracion: 'micro',  toast: 'normal', mensaje: 'Gasto pagado' },
  'factura.reconocida':   { sonido: 'parse-reconocido', celebracion: 'micro', toast: 'ninguno' },

  'crm.contacto':         { sonido: 'ok-registrar',  celebracion: 'micro',  toast: 'normal', mensaje: 'Contacto registrado' },
  'crm.avance':           { sonido: 'prog-avance',   celebracion: 'micro',  toast: 'normal' },
  'crm.retroceso':        { sonido: 'prog-retroceso',                        toast: 'normal' },
  // Enfriar a alguien sonaba a AVANCE: el Kanban mandaba todo lo que no fuera
  // cierre o descarte al mismo momento. Ahora tiene el suyo, con voz y con
  // variantes — es de las poquísimas acciones que se hacen lo bastante poco
  // como para que una broma no se gaste.
  'crm.enfriado':         { sonido: 'crm-enfriado',                          toast: 'normal' },
  'crm.cierre':           { sonido: 'win-cierre',     celebracion: 'hito',   toast: 'hito',   mensaje: 'Cliente confirmado' },
  'lead.entrante':        { sonido: 'alert-lead',     celebracion: 'chico',  toast: 'hito',   mensaje: 'Nuevo lead' },

  'rodaje.publicado':     { sonido: 'ch-claqueta',    celebracion: 'normal', toast: 'hito',   mensaje: 'Rodaje publicado' },
  'rodaje.finalizado':    { sonido: 'win-rodaje-cerrado', celebracion: 'normal', toast: 'hito', mensaje: 'Rodaje finalizado' },
  'citaciones.enviadas':  { sonido: 'ok-enviar',     celebracion: 'micro',  toast: 'normal', mensaje: 'Citaciones enviadas' },

  'qr.escaneado':         { sonido: 'ch-scan-qr',    celebracion: 'micro',  toast: 'ninguno' },

  // CH-1 Equipos. Crear y guardar son confirmaciones, no celebraciones: se
  // hacen a diario y celebrarlas gastaría el gesto de celebrar.
  'equipo.creado':        { sonido: 'ok-crear',      celebracion: 'micro',  toast: 'normal', mensaje: 'Equipo creado' },
  'equipo.guardado':      { sonido: 'ok-guardar',                            toast: 'normal', mensaje: 'Cambios guardados' },
  // Eliminar no lleva chispa: confirmar que se borró no es un logro.
  'equipo.eliminado':     { sonido: 'ok-eliminar',                           toast: 'normal', mensaje: 'Equipo eliminado' },
  // Par, como el checklist: activar y desactivar no pueden sonar igual o el
  // toggle deja de decirte en qué estado quedó.
  'equipo.rentable':      { sonido: 'ui-toggle-on',                          toast: 'ninguno' },
  'equipo.rentable_off':  { sonido: 'ui-toggle-off',                         toast: 'ninguno' },
  'maleta.creada':        { sonido: 'ok-crear',      celebracion: 'micro',  toast: 'normal', mensaje: 'Maleta creada' },
  'maleta.convertida':    { sonido: 'ch-cinta',      celebracion: 'micro',  toast: 'normal', mensaje: 'Convertida a bundle' },
  'nota.agregada':        { sonido: 'ok-registrar',  celebracion: 'micro',  toast: 'ninguno' },

  // Genéricos de lista. Sin toast: el ítem apareciendo o desapareciendo ya es
  // la confirmación visual, y un toast por cada línea de una cotización satura.
  'item.agregado':        { sonido: 'ok-registrar',  celebracion: 'micro',  toast: 'ninguno' },
  'item.eliminado':       { sonido: 'ok-eliminar',                          toast: 'ninguno' },

  // CH-9 Rental. Aprobar es un avance real —la reserva solo la aprueban Tomás
  // o Natalia— pero no un cierre: no lleva confeti.
  'rental.solicitada':    { sonido: 'ok-enviar',     celebracion: 'micro',  toast: 'normal', mensaje: 'Solicitud enviada' },
  'rental.aprobada':      { sonido: 'prog-avance',   celebracion: 'chico',  toast: 'normal', mensaje: 'Reserva aprobada' },
  'rental.denegada':      { sonido: 'prog-retroceso',                       toast: 'normal', mensaje: 'Reserva denegada' },
  'rental.cotizacion':    { sonido: 'ok-crear',      celebracion: 'micro',  toast: 'normal', mensaje: 'Cotización creada' },

  // Marcar suma; desmarcar es neutro, nunca un castigo.
  'checklist.marcado':    { sonido: 'prog-check',    celebracion: 'micro',  toast: 'ninguno' },
  'checklist.desmarcado': { sonido: 'ui-toggle-off',                         toast: 'ninguno' },
  'meta.cumplida':        { sonido: 'win-meta-dia',   celebracion: 'normal', toast: 'hito',   mensaje: 'Meta cumplida' },
  'hito.alcanzado':       { sonido: 'win-hito',       celebracion: 'hito',   toast: 'hito' },

  'creado':               { sonido: 'ok-crear',      celebracion: 'micro',  toast: 'normal', mensaje: 'Creado' },
  'guardado':             { sonido: 'ok-guardar',    celebracion: 'micro',  toast: 'normal', mensaje: 'Cambios guardados' },
  'eliminado':            { sonido: 'ok-eliminar',                           toast: 'normal', mensaje: 'Eliminado' },
  'enviado':              { sonido: 'ok-enviar',     celebracion: 'micro',  toast: 'normal', mensaje: 'Enviado' },
  'subido':               { sonido: 'ok-upload',     celebracion: 'micro',  toast: 'normal', mensaje: 'Archivo subido' },
  'copiado':              { sonido: 'ok-copiar',     celebracion: 'micro',  toast: 'ninguno' },
  'pdf.generado':         { sonido: 'ch-obturador',                          toast: 'ninguno' },
  'sesion.inicio':        { sonido: 'ch-inicio',                             toast: 'ninguno' },
  'sesion.fin':           { sonido: 'ch-salida',                             toast: 'ninguno' },

  'error':                { sonido: 'alert-error',                           toast: 'normal', mensaje: 'Algo salió mal' },
  'atencion':             { sonido: 'alert-atencion',                        toast: 'normal', mensaje: 'Revisa los datos' },
}

export interface OpcionesMomento {
  /** Reemplaza el mensaje por defecto del toast. */
  mensaje?: string
  /**
   * Monto real del evento en CLP. Escala la celebración: un pago de $5M no
   * suena ni se ve igual que uno de $50k. Solo se usa donde tiene sentido.
   */
  monto?: number
  /** Texto ya formateado del monto, para la animación `montoHero`. */
  montoTexto?: string
  /** Origen del confeti (por ejemplo, el botón que se apretó). */
  origen?: { x: number; y: number }
  /** Fuerza una intensidad, ignorando el cálculo por monto. */
  intensidad?: Intensidad
  /**
   * Datos del Plan de Rodaje para la claqueta. Solo lo usa
   * `rodaje.publicado`; sin esto el momento suena y celebra igual, pero no
   * muestra la pizarra.
   */
  claqueta?: DatosClaqueta
}

/** Umbrales de escalado por monto (CLP). Ajustables sin tocar el resto. */
function intensidadPorMonto(monto: number): Intensidad {
  if (monto >= 3_000_000) return 'hito'
  if (monto >= 500_000) return 'normal'
  return 'chico'
}

const PESO: Record<Intensidad, number> = { micro: 0.7, chico: 0.8, normal: 1, hito: 1.25 }

/**
 * Dispara un momento: sonido + celebración + toast, resueltos por el catálogo.
 * Es seguro llamarlo en el servidor (no hace nada) y nunca lanza.
 */
export function momento(nombre: NombreMomento, opts: OpcionesMomento = {}): void {
  if (typeof window === 'undefined') return

  const def = CATALOGO[nombre]
  if (!def) return

  try {
    // La intensidad explícita manda; si no, la define el monto real; si no, la
    // que declara el catálogo.
    const intensidad: Intensidad =
      opts.intensidad ??
      (typeof opts.monto === 'number' && Number.isFinite(opts.monto)
        ? intensidadPorMonto(opts.monto)
        : def.celebracion ?? 'normal')

    if (def.sonido) reproducir(def.sonido, PESO[intensidad])

    // La claqueta reemplaza al confeti: es la celebración de ese momento.
    if (opts.claqueta) claqueta(opts.claqueta)
    else if (def.celebracion) {
      confetti(opts.origen?.x, opts.origen?.y, intensidad)
      if (opts.montoTexto && typeof opts.monto === 'number') {
        montoHero(opts.montoTexto, opts.monto, intensidad)
      }
    }

    const mensaje = opts.mensaje ?? def.mensaje
    if (def.toast !== 'ninguno' && mensaje) {
      if (nombre === 'error' || nombre === 'atencion') toastError(mensaje)
      else toastOk(mensaje, def.toast === 'hito' ? 5000 : undefined)
    }
  } catch {
    // El feedback nunca puede tumbar la operación que lo disparó.
  }
}
