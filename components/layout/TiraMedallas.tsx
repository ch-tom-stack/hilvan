'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ultimasMedallas, type UltimasMedallas } from '@/app/actions/medallas'
import { MEDALLAS } from '@/lib/crm-medallas'
import { EMBLEMAS, EMBLEMA_DEFECTO } from '@/lib/emblemas'

/**
 * Tus últimas medallas, arriba del pie del sidebar.
 *
 * Es la puerta de entrada a la vitrina: nadie va a `/perfil` por gusto, así que
 * sin esto el sistema sólo se ve en el instante en que ganas algo. Cuatro
 * emblemas chicos y el rango — lo justo para dar curiosidad sin competir con la
 * navegación, que es para lo que la gente vino.
 */
export default function TiraMedallas({ compacta = false }: { compacta?: boolean }) {
  const [datos, setDatos] = useState<UltimasMedallas | null>(null)

  useEffect(() => {
    let vivo = true
    ultimasMedallas(4).then(d => { if (vivo) setDatos(d) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  // Sin medallas no se muestra nada: un espacio vacío rotulado "medallas" es
  // una tarea pendiente en la cara, no una invitación.
  if (!datos || datos.claves.length === 0) return null

  return (
    <Link
      href="/perfil"
      title={`${datos.total} medallas · ${datos.rango}`}
      className={`block group ${compacta ? 'px-6 pb-2' : 'px-2 pb-2'}`}
    >
      <div className="flex items-center gap-1.5 text-ch-muted group-hover:text-ch-cream transition-colors">
        {datos.claves.map(c => {
          const rara = MEDALLAS.find(m => m.clave === c)?.rareza
          const oro = rara === 'rara' || rara === 'legendaria'
          return (
            <svg
              key={c}
              viewBox="0 0 24 24"
              className={`w-[15px] h-[15px] shrink-0 ${oro ? 'text-ch-gold' : ''}`}
              fill="none" stroke="currentColor" strokeWidth={1.6}
              strokeLinecap="square" strokeLinejoin="miter"
            >
              <path d={EMBLEMAS[c] ?? EMBLEMA_DEFECTO} />
            </svg>
          )
        })}
        <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle ml-auto tabular-nums">
          {datos.total}
        </span>
      </div>
    </Link>
  )
}
