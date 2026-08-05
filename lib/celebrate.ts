// Celebraciones visuales auto-contenidas (sin dependencias). Colores de marca.
// Se limpian solas al terminar y respetan `prefers-reduced-motion`.

import { getPreferencias, movimientoReducido } from './preferencias'

const COLORS = ['#7a9e7e', '#c9a84c', '#E5462F', '#74CDE4', '#f5f0e8']

export type Intensidad = 'micro' | 'chico' | 'normal' | 'hito'

/**
 * Chispa: micro-celebración anclada al elemento que se tocó.
 *
 * Es el escalón que faltaba. Las acciones recurrentes —registrar un contacto,
 * cargar un gasto, marcar un ítem— ocurren cada 30–60 s de uso real y hasta
 * ahora solo tenían un tick y un toast. El confeti sería desproporcionado y
 * cansaría; esto dura 500 ms, ocupa 40 px y no interrumpe nada.
 *
 * Se dispara desde el punto del click (ver `ultimoPuntero`), no desde el
 * centro de la pantalla: la recompensa aparece donde estaba mirando el ojo.
 */
export function chispa(originX?: number, originY?: number): void {
  if (typeof document === 'undefined') return
  if (!getPreferencias().celebraciones || movimientoReducido()) return

  // Las operaciones masivas (importar 40 gastos, cargar una cartola) llaman
  // esto en ráfaga. Sin tope se volvería un espectáculo de fuegos artificiales
  // y perdería justamente lo que la hace tolerable: que sea discreta.
  const ahora = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (ahora - _ultimaChispa < 140) return
  _ultimaChispa = ahora

  const p = ultimoPuntero()
  const cx = originX ?? p.x
  const cy = originY ?? p.y

  const cont = document.createElement('div')
  cont.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9998;overflow:hidden'
  document.body.appendChild(cont)

  const N = 9
  const partes: { el: HTMLDivElement; x: number; y: number; vx: number; vy: number }[] = []
  for (let i = 0; i < N; i++) {
    const el = document.createElement('div')
    const size = 3 + Math.random() * 2
    // Verde y dorado: los acentos de la marca, sin el resto de la paleta.
    const color = i % 3 === 0 ? '#c9a84c' : '#7a9e7e'
    el.style.cssText = `position:absolute;top:0;left:0;width:${size}px;height:${size}px;background:${color};will-change:transform,opacity`
    cont.appendChild(el)
    // Abanico hacia arriba: se lee como "sube", no como explosión.
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.9
    const vel = 2.2 + Math.random() * 2.6
    partes.push({ el, x: cx, y: cy, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel })
  }

  let frame = 0
  const paso = () => {
    frame++
    const op = Math.max(0, 1 - frame / 30)
    for (const q of partes) {
      q.vy += 0.16
      q.x += q.vx
      q.y += q.vy
      q.el.style.transform = `translate(${q.x}px, ${q.y}px)`
      q.el.style.opacity = String(op)
    }
    if (op > 0) requestAnimationFrame(paso)
    else cont.remove()
  }
  requestAnimationFrame(paso)
}

// Última posición del puntero, para anclar la chispa donde el usuario tocó.
let _px = 0, _py = 0, _rastreando = false
// Marca de tiempo de la última chispa (tope de ritmo en ráfagas).
let _ultimaChispa = 0

export function rastrearPuntero(): void {
  if (_rastreando || typeof window === 'undefined') return
  _rastreando = true
  window.addEventListener('pointerdown', (e) => { _px = e.clientX; _py = e.clientY }, { passive: true })
}

function ultimoPuntero(): { x: number; y: number } {
  if (_px || _py) return { x: _px, y: _py }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
}

const PARTICULAS: Record<Intensidad, number> = { micro: 9, chico: 40, normal: 90, hito: 190 }
const FUERZA: Record<Intensidad, number> = { micro: 0.5, chico: 0.75, normal: 1, hito: 1.35 }
const CUADROS: Record<Intensidad, number> = { micro: 30, chico: 90, normal: 120, hito: 170 }

/**
 * Confeti. `intensidad` escala partículas, fuerza y duración — se usa para que
 * un pago de $5M no se celebre igual que uno de $50k.
 *
 * En 'hito' dispara en OLEADAS escalonadas en vez de un solo estallido: es la
 * lección de las tragamonedas —la recompensa se despliega en el tiempo, no de
 * golpe— aplicada sobre un evento real. Ver docs/gamificacion/sonidos.md.
 */
export function confetti(originX?: number, originY?: number, intensidad: Intensidad = 'normal'): void {
  if (typeof document === 'undefined') return
  if (!getPreferencias().celebraciones || movimientoReducido()) return

  if (intensidad === 'micro') { chispa(originX, originY); return }

  if (intensidad === 'hito') {
    // Tres oleadas: el estallido principal y dos réplicas laterales.
    estallido(originX, originY, 'hito')
    setTimeout(() => estallido((originX ?? window.innerWidth / 2) - 140, originY, 'normal'), 220)
    setTimeout(() => estallido((originX ?? window.innerWidth / 2) + 140, originY, 'normal'), 400)
    return
  }
  estallido(originX, originY, intensidad)
}

function estallido(originX: number | undefined, originY: number | undefined, intensidad: Intensidad): void {
  const cx = originX ?? window.innerWidth / 2
  const cy = originY ?? window.innerHeight / 3

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden'
  document.body.appendChild(container)

  const N = PARTICULAS[intensidad]
  const fuerza = FUERZA[intensidad]
  const maxCuadros = CUADROS[intensidad]
  const parts: { el: HTMLDivElement; x: number; y: number; vx: number; vy: number; rot: number; vr: number }[] = []

  for (let i = 0; i < N; i++) {
    const el = document.createElement('div')
    const size = 6 + Math.random() * 6
    el.style.cssText = `position:absolute;top:0;left:0;width:${size}px;height:${size * 0.55}px;background:${COLORS[i % COLORS.length]};will-change:transform,opacity`
    container.appendChild(el)
    const ang = Math.random() * Math.PI * 2
    const speed = (4 + Math.random() * 8) * fuerza
    parts.push({
      el, x: cx, y: cy,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 5 * fuerza,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 22,
    })
  }

  let frame = 0
  const step = () => {
    frame++
    const op = Math.max(0, 1 - frame / (maxCuadros * 0.75))
    for (const p of parts) {
      p.vy += 0.28          // gravedad
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`
      p.el.style.opacity = String(op)
    }
    if (op > 0 && frame < maxCuadros) requestAnimationFrame(step)
    else container.remove()
  }
  requestAnimationFrame(step)
}

/** Datos que la claqueta toma del Plan de Rodaje. Todo menos `nombre` es opcional. */
export interface DatosClaqueta {
  nombre: string
  /** ISO `YYYY-MM-DD`. Se formatea sin `new Date()` para no correrse un día por UTC. */
  fecha?: string | null
  locacion?: string | null
  /** `HH:MM` o `HH:MM:SS` — la base devuelve segundos. */
  llamado?: string | null
  /** Bloques de tipo rodaje. La app no usa escenas numeradas. */
  secuencias?: number | null
  equipo?: number | null
  direccion?: string | null
}

const K = 'font-size:6.5px;letter-spacing:.2em;color:#8c8c86;text-transform:uppercase;line-height:1.5'
const V = 'font-size:10px;color:#f5f0e8;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
const CAJA = 'border:1px solid #4a4a46;padding:3px 5px;overflow:hidden'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function fechaCorta(iso?: string | null): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return a && m && d ? `${d}·${m}·${a.slice(2)}` : '—'
}

/**
 * La claqueta de Casa Hiedra: el brazo baja, golpea y la pizarra tiembla.
 *
 * Se rellena con el Plan de Rodaje real. Los campos sin dato NO se muestran —
 * un rodaje sin equipo cargado no debe enseñar un "0" que parece un error.
 */
export function claqueta(datos: DatosClaqueta): void {
  if (typeof document === 'undefined') return
  if (!getPreferencias().celebraciones) return

  // Fila inferior adaptativa: solo lo que tiene dato.
  const campos: [string, string][] = []
  if (datos.llamado) campos.push(['llamado', datos.llamado.slice(0, 5)])
  if (typeof datos.secuencias === 'number' && datos.secuencias > 0)
    campos.push(['secuencias', String(datos.secuencias)])
  if (typeof datos.equipo === 'number' && datos.equipo > 0)
    campos.push(['equipo', String(datos.equipo)])
  if (datos.direccion) campos.push(['dirección', datos.direccion])

  const cont = document.createElement('div')
  cont.style.cssText =
    'position:fixed;inset:0;z-index:10000;pointer-events:none;display:flex;' +
    'align-items:center;justify-content:center;background:rgba(17,17,16,.55)'
  cont.innerHTML = `
    <div id="ch-slate" style="width:min(300px,82vw)">
      <div style="position:relative;height:34px;margin-bottom:3px">
        <div id="ch-stick" style="position:absolute;bottom:0;left:0;width:100%;height:28px;
          transform-origin:8px 100%;transform:rotate(-26deg);
          background:repeating-linear-gradient(115deg,#f5f0e8 0 19px,#111110 19px 38px);
          border:1px solid #f5f0e8"></div>
      </div>
      <div style="border:1px solid #f5f0e8;background:#242422;padding:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding-bottom:6px">
          <div style="min-width:0">
            <div style="${K}">producción</div>
            <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:14px;color:#f5f0e8;line-height:1.15">Casa Hiedra</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="${K}">fecha</div>
            <div style="${V};font-size:11px">${fechaCorta(datos.fecha)}</div>
          </div>
        </div>
        <div style="${CAJA}"><div style="${K}">rodaje</div><div style="${V}">${esc(datos.nombre)}</div></div>
        ${datos.locacion ? `<div style="${CAJA};margin-top:4px"><div style="${K}">locación</div><div style="${V}">${esc(datos.locacion)}</div></div>` : ''}
        ${campos.length ? `<div style="display:grid;grid-template-columns:repeat(${Math.min(campos.length, 3)},1fr);gap:4px;margin-top:4px">
          ${campos.map(([k, v]) => `<div style="${CAJA}"><div style="${K}">${k}</div><div style="${V}">${esc(v)}</div></div>`).join('')}
        </div>` : ''}
      </div>
    </div>`
  document.body.appendChild(cont)

  const salir = (ms: number) => window.setTimeout(() => {
    cont.style.transition = 'opacity .4s'
    cont.style.opacity = '0'
    window.setTimeout(() => cont.remove(), 420)
  }, ms)

  const pizarra = cont.querySelector<HTMLElement>('#ch-slate')
  const brazo = cont.querySelector<HTMLElement>('#ch-stick')

  // Sin movimiento: la pizarra se muestra cerrada y quieta.
  if (movimientoReducido() || !brazo || !pizarra) {
    if (brazo) brazo.style.transform = 'rotate(0deg)'
    salir(1600)
    return
  }

  brazo.style.transition = 'transform .16s cubic-bezier(0.16, 1, 0.3, 1)'
  window.setTimeout(() => { brazo.style.transform = 'rotate(0deg)' }, 140)
  // El temblor al impacto es lo que le da peso al golpe.
  window.setTimeout(() => { pizarra.animate(
    [{ transform: 'translate(0,0)' }, { transform: 'translate(-2px,1px)' },
     { transform: 'translate(2px,-1px)' }, { transform: 'translate(0,0)' }],
    { duration: 120, iterations: 2 },
  ) }, 290)
  salir(1700)
}

/**
 * El monto sube al centro, cuenta desde cero y se disuelve. El "rolling"
 * proporcional de las tragamonedas, pero sobre una cifra real: mientras más
 * grande el monto, más larga la cuenta (ver sonidos.md).
 */
export function montoHero(texto: string, valor: number, intensidad: Intensidad = 'normal'): void {
  if (typeof document === 'undefined') return
  if (!getPreferencias().celebraciones) return

  const el = document.createElement('div')
  el.style.cssText =
    'position:fixed;top:34%;left:50%;transform:translate(-50%,-50%);z-index:10000;pointer-events:none;' +
    "font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;color:#f5f0e8;" +
    'font-size:clamp(2.6rem,9vw,5.4rem);line-height:1;text-align:center;opacity:0'
  document.body.appendChild(el)

  // Con movimiento reducido se muestra el valor final, sin conteo ni escala.
  if (movimientoReducido()) {
    el.textContent = texto
    el.style.opacity = '1'
    setTimeout(() => el.remove(), 1400)
    return
  }

  const dur = intensidad === 'hito' ? 1400 : intensidad === 'chico' ? 700 : 1000
  const t0 = performance.now()
  const formatear = (n: number) =>
    texto.replace(/[\d.,]+/, Math.round(n).toLocaleString('es-CL'))

  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / dur)
    const suave = 1 - Math.pow(1 - p, 3)           // desaceleración
    el.textContent = formatear(valor * suave)
    el.style.opacity = String(p < 0.85 ? 1 : (1 - p) / 0.15)
    el.style.transform = `translate(-50%,-50%) scale(${0.94 + suave * 0.06})`
    if (p < 1) requestAnimationFrame(step)
    else {
      el.textContent = texto
      setTimeout(() => el.remove(), 520)
      el.style.transition = 'opacity .5s'
      el.style.opacity = '0'
    }
  }
  requestAnimationFrame(step)
}
