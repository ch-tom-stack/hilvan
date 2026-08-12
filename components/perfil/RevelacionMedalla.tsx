'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MEDALLAS, RAREZA_LABEL, type DefinicionMedalla, type Rareza } from '@/lib/crm-medallas'
import Emblema from '@/components/perfil/Emblema'
import { getPreferencias, movimientoReducido } from '@/lib/preferencias'
import { momento } from '@/lib/momentos'
import {
  Vara, Mordida, MORDIDAS, radioDe, LARGO_TOPE, GROSOR, VUELO, LINEA,
} from '@/components/ui/Pergamino'

/**
 * El momento de ganar medallas: un pergamino que se desenrolla solo.
 *
 * Reusa el mecanismo del pergamino —misma vara, misma espiral, mismo giro
 * atado a la geometría— porque un anuncio en este sistema llega enrollado y se
 * abre. Lo que cambia es quién lo abre: acá no hay manilla, lo abre el sistema.
 *
 * UNA SOLA APERTURA, aunque caigan varias medallas. Antes entraban de a una en
 * cola, y cuatro medallas juntas eran cuatro modales seguidos — para la cuarta
 * ya se cierra sin mirar. Ahora el pergamino se abre una vez y las medallas van
 * apareciendo dentro, **de menos a más significativa**, para que la última cosa
 * que se ve sea la mejor que ganaste.
 *
 * CUÁNDO SE ABRE. Sólo si entre las nuevas hay al menos una rara o legendaria.
 * Una común sola se queda con su sonido y su toast: interrumpir por algo que
 * pasa seguido es lo que enseña a odiar las notificaciones. Pero si el
 * pergamino ya se abrió por una rara, las comunes de esa misma tanda entran
 * también — ya están adentro del momento, y esconderlas sería raro.
 *
 * El sonido de cada medalla suena **cuando aparece**, no todos juntos al
 * detectarlas. Antes se disparaban en un bucle mientras la pantalla mostraba
 * otra cosa.
 */
export const EVENTO_MEDALLA = 'hilvan:medalla'

/** De menos a más significativa. */
const PESO: Record<Rareza, number> = { comun: 0, dificil: 1, rara: 2, legendaria: 3 }

const MS_ABRIR = 1100      // lo que tarda en desenrollarse
const MS_ENTRE = 900       // entre una medalla y la siguiente
const MS_ULTIMA = 3000     // cuánto se queda después de la última
const MS_CERRAR = 800

export default function RevelacionMedalla() {
  const [tanda, setTanda] = useState<DefinicionMedalla[]>([])
  const [reveladas, setReveladas] = useState(0)
  const [p, setP] = useState(0)                 // 0 enrollado · 1 abierto
  // El valor vivo de `p`, para que el cierre no arranque desde un valor viejo.
  // `cerrar` lo dispara un setTimeout agendado al abrir: si leyera el `p` de
  // esa closure leería 0 —el pergamino todavía cerrado— y animaría de 0 a 0,
  // o sea desaparecería de golpe en vez de enrollarse.
  const pVivo = useRef(0)

  const interior = useRef<HTMLDivElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const anim = useRef<number | null>(null)
  const relojes = useRef<number[]>([])
  const [ancho, setAncho] = useState(0)
  const [largo, setLargo] = useState(0)

  const limpiarRelojes = () => { relojes.current.forEach(clearTimeout); relojes.current = [] }

  const animarHasta = useCallback((hasta: number, dur: number, alTerminar?: () => void) => {
    if (anim.current) cancelAnimationFrame(anim.current)
    if (movimientoReducido()) { setP(hasta); pVivo.current = hasta; alTerminar?.(); return }
    const desde = pVivo.current
    const t0 = performance.now()
    const suave = (x: number) => 1 - Math.pow(1 - x, 3)
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / dur)
      const v = desde + (hasta - desde) * suave(k)
      pVivo.current = v
      setP(v)
      if (k < 1) anim.current = requestAnimationFrame(paso)
      else { anim.current = null; alTerminar?.() }
    }
    anim.current = requestAnimationFrame(paso)
  }, [])

  const cerrar = useCallback(() => {
    limpiarRelojes()
    animarHasta(0, MS_CERRAR, () => { setTanda([]); setReveladas(0) })
  }, [animarHasta])

  // ── Escucha ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const oir = (e: Event) => {
      if (!getPreferencias().medallas) return
      const claves = (e as CustomEvent<{ claves?: string[] }>).detail?.claves ?? []
      const defs = claves
        .map(c => MEDALLAS.find(m => m.clave === c))
        .filter((d): d is DefinicionMedalla => !!d)
      if (defs.length === 0) return

      const excepcional = defs.some(d => d.rareza === 'rara' || d.rareza === 'legendaria')
      if (!excepcional) {
        // Nada que detenga la pantalla: cada una con su sonido y su toast.
        defs.forEach(d => momento(`medalla.${d.rareza}` as never, { mensaje: `Medalla: ${d.titulo}` }))
        return
      }

      setTanda(defs.slice().sort((a, b) => PESO[a.rareza] - PESO[b.rareza]))
      setReveladas(0)
    }
    window.addEventListener(EVENTO_MEDALLA, oir)
    return () => window.removeEventListener(EVENTO_MEDALLA, oir)
  }, [])

  // ── Medición ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tanda.length === 0) return
    const medir = () => {
      if (caja.current) setAncho(caja.current.clientWidth)
      if (interior.current) setLargo(interior.current.scrollHeight)
    }
    medir()
    const obs = new ResizeObserver(medir)
    if (interior.current) obs.observe(interior.current)
    return () => obs.disconnect()
  }, [tanda])

  // ── La secuencia ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (tanda.length === 0 || largo === 0) return
    limpiarRelojes()

    // Se abre entero de una: el papel ya tiene el alto de todas, y las medallas
    // aparecen dentro. Abrir de a poco por cada una haría saltar la vara.
    animarHasta(1, MS_ABRIR)

    tanda.forEach((def, i) => {
      relojes.current.push(window.setTimeout(() => {
        setReveladas(i + 1)
        momento(`medalla.${def.rareza}` as never, { mensaje: `Medalla: ${def.titulo}` })
      }, MS_ABRIR * 0.55 + i * MS_ENTRE))
    })

    relojes.current.push(window.setTimeout(
      cerrar, MS_ABRIR * 0.55 + (tanda.length - 1) * MS_ENTRE + MS_ULTIMA,
    ))

    return limpiarRelojes
    // `cerrar` y `animarHasta` cambian con `p` en cada cuadro: incluirlos
    // reiniciaría la secuencia sesenta veces por segundo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanda, largo])

  useEffect(() => () => {
    limpiarRelojes()
    if (anim.current) cancelAnimationFrame(anim.current)
  }, [])

  if (tanda.length === 0) return null

  const alto = p * largo
  const largoRollo = Math.min(largo, LARGO_TOPE)
  const r = radioDe((1 - p) * largoRollo)
  const giro = largoRollo > 0 ? ((radioDe(largoRollo) - r) / GROSOR) * 360 : 0
  const anchoVara = Math.max(0, ancho - VUELO)

  return (
    <div
      onClick={cerrar}
      className="fixed inset-0 z-[60] bg-ch-black/80 flex items-center justify-center p-6 ch-modal-fondo cursor-pointer"
      role="dialog" aria-live="polite"
    >
      <div ref={caja} className="relative w-full max-w-md text-ch-muted">
        <Vara ancho={anchoVara} r={12} giro={0} />

        <div className="relative z-[2] overflow-hidden bg-ch-black mx-[34px]" style={{ height: alto }}>
          <span className="absolute top-0 bottom-0 left-0 w-px z-[2]" style={{ background: LINEA }} />
          <span className="absolute top-0 bottom-0 right-0 w-px z-[2]" style={{ background: LINEA }} />
          {MORDIDAS.filter(([y]) => y < largo).map(([y, lado, a, h]) => (
            <Mordida key={`${y}-${lado}`} y={y} lado={lado} alto={a} hondo={h} />
          ))}
          <div className="absolute inset-x-0 top-0 h-4 z-[3] pointer-events-none"
               style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,.6), transparent)' }} />
          <div className="absolute inset-x-0 bottom-0 h-4 z-[3] pointer-events-none"
               style={{ background: 'linear-gradient(to top, rgba(0,0,0,.6), transparent)' }} />

          <div ref={interior} className="px-8 py-8 text-center">
            {tanda.map((def, i) => {
              const visible = i < reveladas
              const oro = def.rareza === 'legendaria' || def.rareza === 'rara'
              return (
                <div
                  key={def.clave}
                  className={`transition-all duration-500 ease-out ${i > 0 ? 'mt-8 pt-8 border-t border-ch-border' : ''} ${
                    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                  }`}
                >
                  {RAREZA_LABEL[def.rareza] && (
                    <p className={`font-body text-[9px] tracking-[0.45em] uppercase mb-4 ${oro ? 'text-ch-gold' : 'text-ch-green'}`}>
                      {RAREZA_LABEL[def.rareza]}
                    </p>
                  )}
                  <div className={`flex justify-center mb-4 ${oro ? 'text-ch-gold' : 'text-ch-cream'}`}>
                    <Emblema clave={def.clave} nueva={visible} className="w-16 h-16" />
                  </div>
                  <p className={`font-display italic text-2xl leading-tight ${oro ? 'text-ch-gold' : 'text-ch-cream'}`}>
                    {def.titulo}
                  </p>
                  <p className="font-body text-xs text-ch-muted leading-relaxed mt-2">{def.criterio}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ marginLeft: VUELO }}>
          <Vara ancho={anchoVara} r={r} giro={giro} />
        </div>
      </div>
    </div>
  )
}
