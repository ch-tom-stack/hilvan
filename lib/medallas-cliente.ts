// Detección de medallas desde donde ocurre el trabajo.
//
// POR QUÉ EXISTE. La vitrina vive en /perfil, pero si la revisión ocurriera
// sólo ahí, las medallas serían invisibles: alguien trabaja toda la semana sin
// enterarse, y al entrar a su perfil le explotan siete celebraciones juntas por
// cosas que hizo hace días. Una celebración desacoplada de la acción que la
// causó no se lee como logro, se lee como ruido.
//
// Como el sistema se anuncia solo —sin correo, sin banner— este aviso ES el
// mecanismo de descubrimiento. Tiene que llegar en el momento.

import { revisarMedallas } from '@/app/actions/medallas'
import { MEDALLAS } from '@/lib/crm-medallas'
import { momento } from '@/lib/momentos'
import { getPreferencias } from '@/lib/preferencias'
import { EVENTO_MEDALLA } from '@/components/perfil/RevelacionMedalla'

/**
 * Ventana mínima entre revisiones. Bajar una columna registrando de a uno
 * dispararía una revisión por click —tres consultas cada una— y las medallas
 * no cambian tan rápido. Doce segundos alcanza para que el aviso siga
 * sintiéndose parte de la acción.
 */
const ESPERA_MS = 12_000

let ultima = 0
let enVuelo = false
let pendiente: number | null = null

async function revisar(): Promise<void> {
  if (enVuelo) return
  enVuelo = true
  ultima = Date.now()
  try {
    const { nuevas } = await revisarMedallas()
    for (const clave of nuevas) {
      const def = MEDALLAS.find(m => m.clave === clave)
      if (!def) continue
      // El sonido y la celebración escalan con la rareza.
      momento(`medalla.${def.rareza}` as never, { mensaje: `Medalla: ${def.titulo}` })
      // Sólo lo excepcional detiene la pantalla. Interrumpir por algo frecuente
      // es lo que enseña a odiar las notificaciones.
      if (def.rareza === 'rara' || def.rareza === 'legendaria') {
        window.dispatchEvent(new CustomEvent(EVENTO_MEDALLA, { detail: { clave } }))
      }
    }
  } catch {
    // Quedarse sin el aviso no puede romper el registro del contacto, que es
    // lo que la persona vino a hacer.
  } finally {
    enVuelo = false
  }
}

/**
 * Revisa medallas después de registrar algo. Silenciosa si no hay nada nuevo.
 *
 * Con ráfagas de clicks corre una vez al principio y otra al final: la del
 * final es la que importa, porque es la que ve el estado ya completo.
 */
export function revisarMedallasSuave(): void {
  if (typeof window === 'undefined') return
  if (!getPreferencias().medallas) return

  const desde = Date.now() - ultima
  if (desde >= ESPERA_MS && !enVuelo) {
    void revisar()
    return
  }

  // Dentro de la ventana: se agenda UNA revisión al final de la ráfaga.
  if (pendiente !== null) return
  pendiente = window.setTimeout(() => {
    pendiente = null
    void revisar()
  }, Math.max(ESPERA_MS - desde, 1_500))
}
