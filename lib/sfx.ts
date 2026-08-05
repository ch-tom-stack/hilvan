// Efectos de sonido del CRM (gamificación). Web Audio API — tonos generados,
// sin archivos. Refuerzo positivo en las acciones de éxito. Se puede silenciar
// (preferencia en localStorage). Pensado para llamarse dentro de un click.

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function sfxEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem('ch_sfx') !== 'off'
}

export function setSfxEnabled(on: boolean): void {
  if (typeof window !== 'undefined') window.localStorage.setItem('ch_sfx', on ? 'on' : 'off')
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.11): void {
  const c = getCtx()
  if (!c) return
  const t0 = c.currentTime + start
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.03)
}

// Toque pequeño y satisfactorio (registrar un contacto).
export function playTick(): void {
  if (!sfxEnabled()) return
  tone(660, 0, 0.09, 'triangle', 0.09)
}

// Avance de etapa (progreso).
export function playAdvance(): void {
  if (!sfxEnabled()) return
  tone(523.25, 0, 0.12, 'sine', 0.1)
  tone(783.99, 0.07, 0.14, 'sine', 0.1)
}

// Éxito grande: arpegio ascendente alegre (confirmar un cliente).
export function playWin(): void {
  if (!sfxEnabled()) return
  const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  notes.forEach((f, i) => tone(f, i * 0.09, 0.24, 'triangle', 0.12))
}
