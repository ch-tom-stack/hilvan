'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ultimasMedallas, revisarMedallas, type UltimasMedallas } from '@/app/actions/medallas'
import { MEDALLAS } from '@/lib/crm-medallas'
import { EMBLEMAS, EMBLEMA_DEFECTO } from '@/lib/emblemas'
import { getPreferencias } from '@/lib/preferencias'

/**
 * El pie del sidebar: quién eres y cómo vas, en un solo link a `/perfil`.
 *
 * Antes eran dos superficies clicleables pegadas —la tira de medallas arriba de
 * la línea y el bloque de nombre abajo— que iban al mismo lugar sin decir a qué.
 * Además la tira se escondía sin medallas, así que el pie cambiaba de forma
 * según la persona. Un solo bloque arregla las dos cosas.
 *
 * Sin medallas (o con las medallas apagadas en preferencias) cae al bloque de
 * siempre: nombre y rol. Nunca un espacio vacío rotulado "medallas" — eso es una
 * tarea pendiente en la cara, no una invitación.
 */
const CLAVE_REVISION = 'ch_medallas_revisadas'

export default function PiePerfil({
  nombre, email, rol, compacto = false, onNavegar,
}: {
  nombre?: string
  email?: string
  rol?: string
  /** Drawer móvil: más aire lateral y área de toque más alta. */
  compacto?: boolean
  onNavegar?: () => void
}) {
  const pathname = usePathname()
  const [datos, setDatos] = useState<UltimasMedallas | null>(null)

  useEffect(() => {
    if (!getPreferencias().medallas) return
    let vivo = true

    // Ceba el sistema una vez por sesión.
    //
    // Las medallas sólo se conceden al usar el CRM o al abrir /perfil. Quien no
    // hace ninguna de las dos cosas no gana nada aunque el trabajo esté hecho, y
    // entonces este pie —que es por donde el sistema se descubre solo— nunca se
    // enciende. `revisarMedallas` recorre siete tablas, así que no puede correr
    // en cada carga: una vez por pestaña es una pasada por persona por día.
    const yaRevisado = typeof window !== 'undefined'
      && window.sessionStorage.getItem(CLAVE_REVISION) === '1'

    const traer = () => ultimasMedallas(4).then(d => { if (vivo) setDatos(d) })

    if (yaRevisado) {
      traer().catch(() => {})
    } else {
      // Se marca ANTES de esperar: si el usuario navega mientras corre, el
      // segundo montaje no debe lanzar otra revisión.
      window.sessionStorage.setItem(CLAVE_REVISION, '1')
      // Primero se pinta lo que ya hay —el pie no espera a las siete tablas— y
      // después se refresca con lo que la revisión haya concedido.
      traer().catch(() => {})
      revisarMedallas().then(() => { if (vivo) traer().catch(() => {}) }).catch(() => {})
    }

    return () => { vivo = false }
  }, [])

  if (!nombre && !email) return null

  const conMedallas = !!datos && datos.claves.length > 0
  const activo = pathname.startsWith('/perfil')

  return (
    <Link
      href="/perfil"
      onClick={onNavegar}
      title={conMedallas ? `${datos.total} medallas · ${datos.rango}` : 'Tu perfil'}
      // Sin `opacity-70` global, que era del bloque de usuario viejo: aplicada
      // aquí apagaría al 70% el único verde del sidebar. El peso lo dan los
      // tokens —el nombre en ch-muted pesa lo mismo que un ítem inactivo— y el
      // fondo marca cuál está activo.
      className={`ch-press block border-t border-ch-border group transition-colors ${
        compacto ? 'px-6 pt-4 shrink-0' : 'px-2 pt-4'
      } ${activo ? 'bg-ch-surface/40' : ''}`}
      // El drawer llega hasta el borde inferior de la pantalla: sin el área
      // segura, el rango queda debajo de la barra de inicio del iPhone.
      style={compacto ? { paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' } : undefined}
    >
      <div className="flex items-baseline gap-2">
        <p className="font-body text-xs text-ch-muted truncate group-hover:text-ch-cream transition-colors">
          {nombre || email}
        </p>
        {conMedallas && (
          <span className="font-body text-[9px] tracking-[0.2em] text-ch-subtle ml-auto shrink-0 tabular-nums">
            {datos.total}
          </span>
        )}
      </div>

      {conMedallas ? (
        <>
          {/* Las cuatro últimas. Las raras y legendarias en oro: si todas se
              vieran igual, la más difícil parecería la más fácil. */}
          <div className="flex items-center gap-1.5 mt-2 text-ch-muted group-hover:text-ch-cream transition-colors">
            {datos.claves.map(c => {
              const rareza = MEDALLAS.find(m => m.clave === c)?.rareza
              const oro = rareza === 'rara' || rareza === 'legendaria'
              return (
                <svg
                  key={c}
                  viewBox="0 0 24 24"
                  className={`w-[15px] h-[15px] shrink-0 ${oro ? 'text-ch-gold' : ''}`}
                  fill="none" stroke="currentColor" strokeWidth={1.6}
                  strokeLinecap="square" strokeLinejoin="miter"
                  aria-hidden
                >
                  <path d={EMBLEMAS[c] ?? EMBLEMA_DEFECTO} />
                </svg>
              )
            })}
          </div>

          {/* Avance al rango siguiente. En el último rango la fracción es 1 y la
              barra queda llena, que es exactamente lo que hay que leer. */}
          <div className="h-[2px] bg-ch-surface mt-2.5" aria-hidden>
            <div
              className="h-full bg-ch-green transition-[width] duration-700 ease-out"
              style={{ width: `${Math.round(datos.fraccion * 100)}%` }}
            />
          </div>
          <p className="font-body text-[9px] tracking-[0.18em] uppercase text-ch-green mt-1.5 truncate">
            {datos.rango}
          </p>
        </>
      ) : (
        rol && <p className="font-body text-xs text-ch-subtle capitalize mt-0.5">{rol}</p>
      )}
    </Link>
  )
}
