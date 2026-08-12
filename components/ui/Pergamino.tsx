'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { movimientoReducido } from '@/lib/preferencias'

/**
 * Un pergamino que se enrolla y desenrolla.
 *
 * El movimiento no es un acordeón con adornos: sale de la geometría de un
 * rollo real. Todo el papel arranca enrollado en la vara de abajo, y al
 * desenrollar esa longitud sale del rollo —así que el rollo adelgaza y la vara
 * viaja—.
 *
 *   El papel enrollado ocupa un área anular:  L·t = π(r² − r₀²)
 *   de donde                                   r = √(r₀² + t·L/π)
 *   y las vueltas dadas son las capas soltadas: (r_max − r)/t
 *
 * De ahí sale que la vara **gire más rápido al final**: con el rollo delgado
 * cada vuelta suelta menos papel. Ese detalle es lo que se ve mecánico y no
 * animado, y no lo produce ningún easing.
 *
 * La vara de arriba es el resto de la hoja: radio constante y sin giro, porque
 * no suelta ni recoge. Girarla sería movimiento sin causa.
 */

const NUCLEO = 5      // radio de la vara desnuda
const GROSOR = 2      // "espesor" del papel: define cuántas capas caben
const VUELO = 20      // cuánto sobresale el rollo a la izquierda del papel
const R_ARRIBA = 12   // el rollo que sobra arriba, constante
const TINTA = '#8e8e86'
const RELLENO = '#2a2a25'
const LINEA = '#6e6e66'

const radioDe = (enrollado: number) =>
  Math.sqrt(NUCLEO ** 2 + (GROSOR * Math.max(0, enrollado)) / Math.PI)

/** Espiral de Arquímedes: el corte del rollo visto de canto. */
function espiral(rExt: number): string {
  const capas = Math.max(0, (rExt - NUCLEO) / GROSOR)
  const pasos = Math.max(8, Math.ceil(capas * 36))
  let d = ''
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos
    const ang = t * capas * Math.PI * 2
    const rad = NUCLEO + t * (rExt - NUCLEO)
    d += (i ? 'L' : 'M') + (Math.cos(ang) * rad).toFixed(2) + ' ' + (Math.sin(ang) * rad).toFixed(2)
  }
  return d
}

/**
 * Una vara. El extremo izquierdo muestra el corte enrollado; el derecho, la
 * misma silueta redondeada **sin** el perfil del rollo — de ese lado se mira la
 * vara de canto, no el corte.
 */
function Vara({ ancho, r, giro }: { ancho: number; r: number; giro: number }) {
  if (ancho <= 0) return null
  const xTapa = Math.max(r, ancho - r - 1)
  return (
    <svg width={ancho} height={r * 2 + 2} className="block shrink-0" aria-hidden>
      <path
        d={`M ${r} 1 H ${xTapa} A ${r} ${r} 0 0 1 ${xTapa} ${r * 2 + 1} H ${r}`}
        fill={RELLENO} stroke={TINTA} strokeWidth={1.4}
      />
      <circle cx={r} cy={r + 1} r={r} fill={RELLENO} stroke={TINTA} strokeWidth={1.4} />
      <g transform={`translate(${r} ${r + 1}) rotate(${giro})`}>
        <path d={espiral(r)} fill="none" stroke={TINTA} strokeWidth={1} />
      </g>
    </svg>
  )
}

/**
 * Las mordidas del canto.
 *
 * Cada una es un triángulo del color del fondo que se come el papel, más una V
 * trazada que continúa la línea del canto hacia adentro. El énfasis lo da la
 * V: sin ella la mordedura es solo un cambio de relleno y no se ve.
 *
 * Alturas y tamaños irregulares a propósito — parejas se leerían como un
 * patrón decorativo y no como papel viejo.
 */
const MORDIDAS: [number, 'izq' | 'der', number, number][] = [
  [62, 'izq', 13, 9], [148, 'der', 10, 7], [231, 'izq', 8, 6], [316, 'der', 15, 10],
  [404, 'izq', 11, 8], [487, 'der', 9, 6], [560, 'izq', 14, 9], [648, 'der', 12, 8],
  [741, 'izq', 9, 7], [829, 'der', 13, 9],
]

function Mordida({ y, lado, alto, hondo }: { y: number; lado: 'izq' | 'der'; alto: number; hondo: number }) {
  const v = `M0 0 L${hondo} ${alto / 2} L0 ${alto}`
  return (
    <svg
      width={hondo} height={alto} viewBox={`0 0 ${hondo} ${alto}`}
      className="absolute z-[3] pointer-events-none block"
      style={{ top: y, ...(lado === 'izq' ? { left: 0 } : { right: 0 }) }}
      aria-hidden
    >
      <g transform={lado === 'der' ? `translate(${hondo} 0) scale(-1 1)` : undefined}>
        {/* El hueco va del color del fondo de la página, no del papel. */}
        <path d={`${v} Z`} fill="var(--color-ch-dark)" />
        <path d={v} fill="none" stroke={LINEA} strokeWidth={1} strokeLinejoin="round" />
      </g>
    </svg>
  )
}

export default function Pergamino({
  titulo, meta, children, abierto: abiertoInicial = true,
}: {
  titulo: string
  meta?: string
  children: React.ReactNode
  abierto?: boolean
}) {
  const caja = useRef<HTMLElement>(null)
  const interior = useRef<HTMLDivElement>(null)
  const anim = useRef<number | null>(null)

  const [ancho, setAncho] = useState(0)
  const [largo, setLargo] = useState(0)          // alto real del contenido
  const [p, setP] = useState(abiertoInicial ? 1 : 0)

  // Se mide el contenido, no un valor fijo: así el rollo nace más gordo cuando
  // hay más que leer, que es lo que haría un pergamino de verdad.
  const medir = useCallback(() => {
    if (!caja.current || !interior.current) return
    setAncho(caja.current.clientWidth)
    setLargo(interior.current.scrollHeight)
  }, [])

  useEffect(() => {
    medir()
    const obs = new ResizeObserver(medir)
    if (caja.current) obs.observe(caja.current)
    if (interior.current) obs.observe(interior.current)
    return () => { obs.disconnect(); if (anim.current) cancelAnimationFrame(anim.current) }
  }, [medir])

  const alternar = () => {
    const hasta = p > 0.5 ? 0 : 1
    if (movimientoReducido()) { setP(hasta); return }
    if (anim.current) cancelAnimationFrame(anim.current)
    const desde = p
    const t0 = performance.now()
    const DUR = 1100
    const suave = (x: number) => 1 - Math.pow(1 - x, 3)
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / DUR)
      setP(desde + (hasta - desde) * suave(k))
      if (k < 1) anim.current = requestAnimationFrame(paso)
      else anim.current = null
    }
    anim.current = requestAnimationFrame(paso)
  }

  const alto = p * largo
  const r = radioDe(largo - alto)
  const giro = largo > 0 ? ((radioDe(largo) - r) / GROSOR) * 360 : 0
  const anchoVara = Math.max(0, ancho - VUELO)

  return (
    <section ref={caja} className="relative text-ch-muted">
      {/* El rollo que sobra: enrollado hacia la izquierda, sin girar. */}
      <Vara ancho={anchoVara} r={R_ARRIBA} giro={0} />

      {/* El rótulo es la manilla. Vive FUERA del papel: adentro se iría con él
          al enrollar y el pergamino quedaría cerrado sin nada que tocar. */}
      <button
        onClick={alternar}
        aria-expanded={p > 0.5}
        className="ch-press w-full flex items-baseline gap-3 px-[34px] pt-2.5 pb-2 group text-left"
      >
        <span className="font-body text-[9px] tracking-[0.5em] uppercase text-ch-subtle group-hover:text-ch-cream transition-colors">
          {titulo}
        </span>
        {meta && (
          <span className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle ml-auto tabular-nums">
            {meta}
          </span>
        )}
      </button>

      {/* El papel se REVELA hacia abajo: el contenido queda anclado arriba y lo
          que crece es el alto del contenedor. Comprimirlo lo deformaría. */}
      <div
        className="relative z-[2] overflow-hidden bg-ch-black mx-[34px]"
        style={{ height: alto }}
      >
        {/* La línea exterior del canto. Va acá dentro y no como `border`
            porque el overflow recortaría las mordidas puestas sobre el borde. */}
        <span className="absolute top-0 bottom-0 left-0 w-px z-[2] pointer-events-none" style={{ background: LINEA }} />
        <span className="absolute top-0 bottom-0 right-0 w-px z-[2] pointer-events-none" style={{ background: LINEA }} />
        {MORDIDAS.filter(([y]) => y < largo).map(([y, lado, a, h]) => (
          <Mordida key={`${y}-${lado}`} y={y} lado={lado} alto={a} hondo={h} />
        ))}

        {/* El papel curvándose al entrar y salir de los rollos */}
        <div className="absolute inset-x-0 top-0 h-4 z-[3] pointer-events-none"
             style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,.6), transparent)' }} />
        <div className="absolute inset-x-0 bottom-0 h-4 z-[3] pointer-events-none"
             style={{ background: 'linear-gradient(to top, rgba(0,0,0,.6), transparent)' }} />

        <div ref={interior} className="px-6 pt-5 pb-6">{children}</div>
      </div>

      {/* La vara que viaja: adelgaza y gira según lo que soltó. */}
      <div style={{ marginLeft: VUELO }}>
        <Vara ancho={anchoVara} r={r} giro={giro} />
      </div>
    </section>
  )
}
