'use client'

import { useEffect, useState } from 'react'
import { MEDALLAS, RAREZA_LABEL, type DefinicionMedalla } from '@/lib/crm-medallas'
import Emblema from '@/components/perfil/Emblema'
import { getPreferencias } from '@/lib/preferencias'

/**
 * El momento de desbloquear una medalla rara o legendaria.
 *
 * Interrumpe la pantalla, y es el ÚNICO lugar del sistema donde eso se
 * justifica: una legendaria pasa una vez cada varios meses. Las comunes y
 * difíciles se quedan con el toast — interrumpir por algo que ocurre seguido
 * es lo que enseña a la gente a odiar las notificaciones.
 *
 * Se dispara por evento y no por prop porque quien detecta la medalla es
 * `lib/medallas-cliente.ts`, llamado desde cuatro componentes distintos del
 * CRM. Un evento evita cablear el overlay a los cuatro.
 */
export const EVENTO_MEDALLA = 'hilvan:medalla'

export default function RevelacionMedalla() {
  const [cola, setCola] = useState<DefinicionMedalla[]>([])

  useEffect(() => {
    const oir = (e: Event) => {
      if (!getPreferencias().medallas) return
      const clave = (e as CustomEvent<{ clave: string }>).detail?.clave
      const def = MEDALLAS.find(m => m.clave === clave)
      if (def) setCola(c => (c.some(x => x.clave === def.clave) ? c : [...c, def]))
    }
    window.addEventListener(EVENTO_MEDALLA, oir)
    return () => window.removeEventListener(EVENTO_MEDALLA, oir)
  }, [])

  const actual = cola[0]

  // Se cierra sola. Si ganaste dos de una, la siguiente entra al terminar esta:
  // apilarlas en pantalla las convertiría en un obstáculo.
  useEffect(() => {
    if (!actual) return
    const t = window.setTimeout(() => setCola(c => c.slice(1)), 3800)
    return () => window.clearTimeout(t)
  }, [actual])

  if (!actual) return null

  const oro = actual.rareza === 'legendaria'

  return (
    <div
      onClick={() => setCola(c => c.slice(1))}
      className="fixed inset-0 z-[60] bg-ch-black/80 flex items-center justify-center p-6 ch-modal-fondo cursor-pointer"
    >
      <div className={`border bg-ch-dark px-8 py-9 text-center max-w-sm ch-modal-panel ${
        oro ? 'border-ch-gold' : 'border-ch-green/50'
      }`}>
        <p className={`font-body text-[9px] tracking-[0.45em] uppercase mb-5 ${oro ? 'text-ch-gold' : 'text-ch-green'}`}>
          {RAREZA_LABEL[actual.rareza] || 'Medalla'}
        </p>

        <div className={`flex justify-center mb-5 ${oro ? 'text-ch-gold' : 'text-ch-cream'}`}>
          <Emblema clave={actual.clave} nueva className="w-20 h-20" />
        </div>

        <p className={`font-display italic text-3xl leading-tight ${oro ? 'text-ch-gold' : 'text-ch-cream'}`}>
          {actual.titulo}
        </p>
        <p className="font-body text-xs text-ch-muted leading-relaxed mt-3">{actual.criterio}</p>
        {actual.nota && (
          <p className="font-body text-[11px] text-ch-subtle italic mt-2 leading-relaxed">{actual.nota}</p>
        )}

        <p className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-subtle mt-6">
          Toca para cerrar
        </p>
      </div>
    </div>
  )
}
