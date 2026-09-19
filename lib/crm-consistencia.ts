// lib/crm-consistencia.ts
// Etapas que no calzan con el historial.
//
// Es distinto de `datos_dudosos`: ahí la FICHA está mal (contacto de otra
// empresa) y el prospecto sale de la agenda. Acá la ficha está bien y lo que no
// cuadra es la etapa con lo que hay registrado. No se marca nada ni se mueve
// nada: se calcula al leer y se reporta, porque la explicación más común es que
// la conversación pasó por un canal que el CRM no ve.
//
// Casos que lo originaron (brief de calidad de leads, 19-sep-2026): Hooked,
// Ropero Jeans y 4women en "conversación" con 3 correos y 0 respuestas; Somos
// MODO "confirmado" sin un solo toque; @sebastiandelrealossa en "contacto"
// un mes después de un rechazo.

export type TipoInconsistencia = 'conversacion_sin_respuesta' | 'confirmado_sin_historial' | 'rechazo_sin_mover'

export interface InteraccionMin {
  fecha: string | null
  tipo?: string | null
  direccion?: string | null
  respondido?: boolean | null
  resumen?: string | null
}

export interface Inconsistencia {
  tipo: TipoInconsistencia
  detalle: string
  sugerencia: string
}

// Deliberadamente conservador: solo frases que en un RESUMEN de respuesta
// significan "no". Un falso positivo acá le propone a alguien descartar un
// prospecto vivo.
const RECHAZO = /\brechaz|\bdijo que no\b|\bno (les|le|nos) interesa|\bno est[aá]n interesad|\bdeclin|\bmantendr[aá]n? en mente|\bya (lo )?resolvieron con otr/i

export function inconsistenciasDeEtapa(etapa: string, interacciones: InteraccionMin[]): Inconsistencia[] {
  const out: Inconsistencia[] = []
  const enviados = interacciones.filter(i => i.direccion !== 'recibido')
  const recibidos = interacciones.filter(i => i.direccion === 'recibido')

  if (etapa === 'confirmado' && interacciones.length === 0) {
    out.push({
      tipo: 'confirmado_sin_historial',
      detalle: 'Está confirmado y no tiene ningún contacto registrado.',
      sugerencia: 'El cierre pasó por fuera del CRM. Pedirle a quien lo cerró una línea de cómo fue, para que quede de referencia.',
    })
  }

  if (etapa === 'conversacion') {
    // Una reunión es conversación aunque nadie haya marcado "respondido".
    const huboIdaYVuelta = recibidos.length > 0
      || enviados.some(i => i.respondido === true)
      || interacciones.some(i => i.tipo === 'reunion' || i.tipo === 'llamada')
    if (!huboIdaYVuelta) {
      out.push({
        tipo: 'conversacion_sin_respuesta',
        detalle: `Está en conversación con ${enviados.length} toque${enviados.length === 1 ? '' : 's'} enviado${enviados.length === 1 ? '' : 's'} y ninguna respuesta registrada.`,
        sugerencia: 'O la conversación ocurrió por otro canal y falta registrarla, o la etapa debería ser "contacto". Preguntar al responsable antes de proponer el cambio.',
      })
    }
  }

  if (etapa !== 'descartado' && etapa !== 'en_frio' && recibidos.length > 0) {
    const ultimo = recibidos.filter(i => i.fecha).sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))[0]
    // Solo si el rechazo es lo ÚLTIMO que pasó: si después hubo más contacto, la
    // conversación siguió y el "no" quedó atrás.
    const posterior = ultimo ? interacciones.some(i => (i.fecha ?? '') > (ultimo.fecha ?? '')) : true
    if (ultimo && !posterior && RECHAZO.test(ultimo.resumen ?? '')) {
      out.push({
        tipo: 'rechazo_sin_mover',
        detalle: `Lo último registrado (${ultimo.fecha}) es una respuesta que se lee como rechazo, y sigue en "${etapa}".`,
        sugerencia: 'Proponer en_frio (rechazo suave, "más adelante") o descartado (un no definitivo) con hilvan_mover_etapa como_propuesta, citando la respuesta como evidencia.',
      })
    }
  }
  return out
}
