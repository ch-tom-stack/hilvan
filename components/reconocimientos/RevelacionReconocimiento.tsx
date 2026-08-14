'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getReconocimientosSinVer, marcarVisto, type Reconocimiento } from '@/app/actions/reconocimientos'
import { movimientoReducido } from '@/lib/preferencias'
import { momento } from '@/lib/momentos'
import {
  Vara, Mordida, MORDIDAS, radioDe, LARGO_TOPE, GROSOR, VUELO, LINEA,
} from '@/components/ui/Pergamino'

/**
 * Una mención que llega: el pergamino se abre solo, una vez, PARA TODOS.
 *
 * Reconocer a alguien delante de los demás es la mitad del gesto: en privado
 * sería un mensaje, no un reconocimiento. Así que el pergamino no se le abre
 * sólo a quien la recibe — se le abre a todo el equipo, y cada uno lo marca
 * visto por su cuenta.
 *
 * No se cierra sola, a diferencia de las medallas. Una medalla la concede un
 * umbral y se entiende de un vistazo; una mención hay que leerla, y cerrarla
 * por reloj sería quitársela a alguien de las manos mientras la lee.
 *
 * Se marca vista al abrirla, no al cerrarla: si alguien recarga a mitad de
 * lectura, no queremos que le vuelva a saltar encima cada vez.
 */
const MS_ABRIR = 1300
const MS_CERRAR = 800

export default function RevelacionReconocimiento() {
  const [cola, setCola] = useState<Reconocimiento[]>([])
  const [p, setP] = useState(0)
  const pVivo = useRef(0)
  const interior = useRef<HTMLDivElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const anim = useRef<number | null>(null)
  const [ancho, setAncho] = useState(0)
  const [largo, setLargo] = useState(0)

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
    animarHasta(0, MS_CERRAR, () => setCola([]))
  }, [animarHasta])

  useEffect(() => {
    let vivo = true
    getReconocimientosSinVer()
      .then(rs => {
        if (!vivo || rs.length === 0) return
        setCola(rs)
        // Vista al abrir: si recarga a mitad de lectura no debe saltarle otra vez.
        void marcarVisto(rs.map(r => r.id))
      })
      .catch(() => {})
    return () => { vivo = false; if (anim.current) cancelAnimationFrame(anim.current) }
  }, [])

  useEffect(() => {
    if (cola.length === 0) return
    const medir = () => {
      if (caja.current) setAncho(caja.current.clientWidth)
      if (interior.current) setLargo(interior.current.scrollHeight)
    }
    medir()
    const obs = new ResizeObserver(medir)
    if (interior.current) obs.observe(interior.current)
    return () => obs.disconnect()
  }, [cola])

  useEffect(() => {
    if (cola.length === 0 || largo === 0) return
    animarHasta(1, MS_ABRIR)
    momento('hito.alcanzado', { mensaje: 'Tienes una mención' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cola, largo])

  if (cola.length === 0) return null

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
      <div ref={caja} className="relative w-full max-w-lg text-ch-muted">
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

          <div ref={interior} className="px-9 py-9">
            {cola.map((r, i) => (
              <div key={r.id} className={i > 0 ? 'mt-9 pt-9 border-t border-ch-border' : ''}>
                <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-gold mb-4">
                  Una mención {r.persona ? `para ${r.persona}` : ''}
                </p>
                <p className="font-display italic text-3xl text-ch-cream leading-tight">
                  {r.titulo}
                </p>
                <p className="font-body text-sm text-ch-muted leading-relaxed mt-4">
                  {r.texto}
                </p>
                {r.imagen_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={r.imagen_url} alt=""
                    className="mt-6 max-h-72 w-auto border border-ch-border -rotate-1"
                  />
                )}
                <p className="font-body text-[9px] tracking-[0.25em] uppercase text-ch-subtle mt-6">
                  {r.otorgado_por_nombre}
                </p>
              </div>
            ))}
            <p className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-subtle mt-8 text-center">
              Toca para cerrar
            </p>
          </div>
        </div>

        <div style={{ marginLeft: VUELO }}>
          <Vara ancho={anchoVara} r={r} giro={giro} />
        </div>
      </div>
    </div>
  )
}
