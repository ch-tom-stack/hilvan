// Motor de sonido de Hilván.
//
// Reproduce archivos desde `public/sounds/<token>.mp3` con Web Audio (latencia
// baja y control de ganancia real). Si un archivo todavía no existe, cae a un
// tono sintético equivalente — así el sistema completo se puede cablear ANTES
// de tener los assets, y cada archivo que se agrega mejora el resultado sin
// tocar el código que lo llama.
//
// Reglas de uso:
//  - Llamar SIEMPRE dentro del gesto del usuario (en el optimistic update),
//    nunca después de un `await` a servidor: sobre ~100 ms el cerebro deja de
//    leerlo como consecuencia de su acción.
//  - No llamar esto directamente desde componentes. Usar `lib/momentos.ts`,
//    que además resuelve animación y toast.
//
// Ver `docs/gamificacion/sonidos.md` para el catálogo y la dirección de arte.

import { getPreferencias, setPreferencias, FACTOR_VOLUMEN } from './preferencias'

export type TokenSfx =
  // Grupo A — imprescindibles
  | 'ui-tap' | 'ui-toggle-on' | 'ui-toggle-off'
  | 'ok-guardar' | 'ok-registrar' | 'ok-crear' | 'ok-enviar'
  | 'prog-avance'
  | 'win-cierre' | 'win-pago'
  | 'alert-error' | 'alert-atencion' | 'alert-lead'
  // Grupo B — completan el sistema
  | 'ui-panel-open' | 'ui-panel-close' | 'ui-nav'
  | 'ok-eliminar' | 'ok-upload' | 'ok-copiar'
  | 'prog-check' | 'prog-retroceso' | 'prog-barra-llena'
  | 'win-factura' | 'win-hito'
  | 'conciliar-match' | 'parse-reconocido'
  // Grupo C — carácter y marca
  | 'ch-inicio' | 'ch-claqueta' | 'ch-obturador' | 'ch-scan-qr' | 'ch-cinta'
  | 'win-rodaje-cerrado' | 'win-meta-dia' | 'ch-salida'

type Familia = 'micro' | 'confirmacion' | 'celebracion' | 'alerta'

/** Ganancia base por familia: los micro-sonidos se oyen decenas de veces al día. */
const GANANCIA: Record<Familia, number> = {
  micro: 0.40,
  confirmacion: 0.62,
  celebracion: 0.95,
  alerta: 0.72,
}

const FAMILIA: Record<TokenSfx, Familia> = {
  'ui-tap': 'micro', 'ui-toggle-on': 'micro', 'ui-toggle-off': 'micro',
  'ui-panel-open': 'micro', 'ui-panel-close': 'micro', 'ui-nav': 'micro',
  'ok-copiar': 'micro',

  'ok-guardar': 'confirmacion', 'ok-registrar': 'confirmacion', 'ok-crear': 'confirmacion',
  'ok-enviar': 'confirmacion', 'ok-eliminar': 'confirmacion', 'ok-upload': 'confirmacion',
  'prog-avance': 'confirmacion', 'prog-check': 'confirmacion', 'prog-retroceso': 'confirmacion',
  'conciliar-match': 'confirmacion', 'parse-reconocido': 'confirmacion',
  'ch-obturador': 'confirmacion', 'ch-scan-qr': 'confirmacion', 'ch-cinta': 'confirmacion',

  'win-cierre': 'celebracion', 'win-pago': 'celebracion', 'win-factura': 'celebracion',
  'win-hito': 'celebracion', 'win-rodaje-cerrado': 'celebracion', 'win-meta-dia': 'celebracion',
  'prog-barra-llena': 'celebracion', 'ch-inicio': 'celebracion', 'ch-claqueta': 'celebracion',
  'ch-salida': 'celebracion',

  'alert-error': 'alerta', 'alert-atencion': 'alerta', 'alert-lead': 'alerta',
}

// ── Contexto de audio ────────────────────────────────────────────────────────

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

// ── Carga de archivos ────────────────────────────────────────────────────────

const buffers = new Map<TokenSfx, AudioBuffer>()
const sinArchivo = new Set<TokenSfx>()
const cargando = new Set<TokenSfx>()

/**
 * Carga un token en segundo plano. Nunca lanza: si el archivo no existe, marca
 * el token como sintético y no lo vuelve a intentar.
 */
function cargar(token: TokenSfx): void {
  if (buffers.has(token) || sinArchivo.has(token) || cargando.has(token)) return
  const c = getCtx()
  if (!c) return

  cargando.add(token)
  fetch(`/sounds/${token}.mp3`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status))
      return r.arrayBuffer()
    })
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => { buffers.set(token, buf) })
    .catch(() => { sinArchivo.add(token) })
    .finally(() => { cargando.delete(token) })
}

/** Precarga un set de tokens (los que se van a usar en la pantalla actual). */
export function precargar(tokens: TokenSfx[]): void {
  tokens.forEach(cargar)
}

// ── Síntesis de respaldo ─────────────────────────────────────────────────────

function tono(freq: number, inicio: number, dur: number, tipo: OscillatorType, gain: number): void {
  const c = getCtx()
  if (!c) return
  const t0 = c.currentTime + inicio
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = tipo
  osc.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.03)
}

/** Notas de Do mayor, la tonalidad del set completo (ver sonidos.md). */
const DO = 523.25, MI = 659.25, SOL = 783.99, DO6 = 1046.5, SOL4 = 392, MI4 = 329.63

function sintetico(token: TokenSfx, vol: number): void {
  const g = GANANCIA[FAMILIA[token]] * vol
  switch (token) {
    case 'ui-tap': case 'ui-nav': case 'ok-copiar':
      tono(MI * 2, 0, 0.05, 'triangle', g * 0.5); break
    case 'ui-toggle-on': case 'prog-check':
      tono(SOL, 0, 0.07, 'triangle', g * 0.7); break
    case 'ui-toggle-off':
      tono(MI, 0, 0.07, 'triangle', g * 0.7); break
    case 'ui-panel-open':
      tono(MI, 0, 0.11, 'sine', g * 0.6); tono(SOL, 0.05, 0.12, 'sine', g * 0.5); break
    case 'ui-panel-close': case 'ok-eliminar': case 'prog-retroceso': case 'ch-salida':
      tono(SOL, 0, 0.11, 'sine', g * 0.6); tono(MI, 0.06, 0.13, 'sine', g * 0.5); break
    case 'ok-registrar':
      tono(MI * 1.5, 0, 0.09, 'triangle', g * 0.8); break
    case 'ok-guardar': case 'ok-upload':
      tono(SOL, 0, 0.16, 'sine', g * 0.8); break
    case 'ok-crear': case 'prog-avance': case 'ok-enviar':
      tono(DO, 0, 0.12, 'sine', g * 0.8); tono(SOL, 0.07, 0.15, 'sine', g * 0.8); break
    case 'conciliar-match':
      tono(SOL, 0, 0.05, 'square', g * 0.35); tono(DO6, 0.035, 0.09, 'triangle', g * 0.6); break
    case 'parse-reconocido': case 'ch-scan-qr':
      tono(SOL, 0, 0.06, 'sine', g * 0.6); tono(DO6, 0.07, 0.12, 'sine', g * 0.7); break
    case 'ch-obturador': case 'ch-claqueta': case 'ch-cinta':
      tono(MI4, 0, 0.05, 'square', g * 0.4); tono(DO, 0.03, 0.07, 'triangle', g * 0.5); break
    case 'alert-error':
      tono(MI4, 0, 0.16, 'sine', g * 0.7); break
    case 'alert-atencion':
      tono(SOL4, 0, 0.06, 'triangle', g * 0.6); tono(SOL4, 0.09, 0.07, 'triangle', g * 0.6); break
    case 'alert-lead':
      tono(SOL, 0, 0.14, 'sine', g * 0.8); tono(DO6, 0.11, 0.24, 'sine', g * 0.8); break
    case 'win-factura':
      tono(DO, 0, 0.1, 'triangle', g * 0.7); tono(SOL, 0.06, 0.22, 'triangle', g * 0.8); break
    case 'prog-barra-llena': case 'win-meta-dia':
      [DO, MI, SOL].forEach((f, i) => tono(f, i * 0.07, 0.2, 'sine', g * 0.75)); break
    case 'win-cierre': case 'ch-inicio': case 'win-rodaje-cerrado':
      [DO, MI, SOL, DO6].forEach((f, i) => tono(f, i * 0.09, 0.24, 'triangle', g * 0.8)); break
    case 'win-pago': case 'win-hito':
      [DO, MI, SOL, DO6].forEach((f, i) => tono(f, i * 0.08, 0.3, 'triangle', g * 0.9))
      tono(DO / 2, 0, 0.5, 'sine', g * 0.45)
      tono(SOL, 0.36, 0.5, 'triangle', g * 0.6)
      break
    default:
      tono(SOL, 0, 0.08, 'triangle', g * 0.6)
  }
}

// ── Reproducción ─────────────────────────────────────────────────────────────

const ultimaVez = new Map<TokenSfx, number>()
const GAP_MINIMO_MS = 45 // evita el "ametrallamiento" en cargas masivas

/**
 * Reproduce un token. Silencioso si el usuario apagó el sonido.
 * @param intensidad multiplicador 0–1.5 sobre la ganancia (para escalar la
 *   celebración según la magnitud real del evento; ver `momentos.ts`).
 */
export function reproducir(token: TokenSfx, intensidad = 1): void {
  const prefs = getPreferencias()
  if (!prefs.sonido) return

  const ahora = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const previa = ultimaVez.get(token)
  if (previa !== undefined && ahora - previa < GAP_MINIMO_MS) return
  ultimaVez.set(token, ahora)

  const vol = FACTOR_VOLUMEN[prefs.volumen] * Math.max(0, Math.min(1.5, intensidad))
  const c = getCtx()
  if (!c) return

  const buf = buffers.get(token)
  if (buf) {
    const src = c.createBufferSource()
    const g = c.createGain()
    g.gain.value = Math.min(1, GANANCIA[FAMILIA[token]] * vol)
    src.buffer = buf
    src.connect(g)
    g.connect(c.destination)
    src.start()
    return
  }

  // Sin archivo (todavía): suena el sintético AHORA — nunca se espera la
  // descarga — y se deja el archivo cargando para la próxima vez.
  sintetico(token, vol)
  cargar(token)
}

// ── Desbloqueo del audio ─────────────────────────────────────────────────────

let desbloqueado = false

/**
 * Los navegadores no dejan sonar hasta que hay un gesto del usuario. Esto se
 * engancha al primer click/tecla, resume el contexto y precarga los sonidos
 * más frecuentes para que el primero no llegue tarde.
 */
export function desbloquearAudio(): void {
  if (desbloqueado || typeof window === 'undefined') return
  desbloqueado = true
  const alPrimerGesto = () => {
    getCtx()
    precargar(['ui-tap', 'ok-registrar', 'ok-guardar', 'prog-avance', 'alert-error'])
    window.removeEventListener('pointerdown', alPrimerGesto)
    window.removeEventListener('keydown', alPrimerGesto)
  }
  window.addEventListener('pointerdown', alPrimerGesto, { once: true })
  window.addEventListener('keydown', alPrimerGesto, { once: true })
}

// ── Compatibilidad con el CRM (API original) ─────────────────────────────────
// Se mantienen para no romper PipelineCRM y FichaProspecto. Código nuevo:
// usar `momento()` de lib/momentos.ts.

export function sfxEnabled(): boolean {
  return getPreferencias().sonido
}

export function setSfxEnabled(on: boolean): void {
  setPreferencias({ sonido: on })
}

export function playTick(): void { reproducir('ok-registrar') }
export function playAdvance(): void { reproducir('prog-avance') }
export function playWin(): void { reproducir('win-cierre') }
