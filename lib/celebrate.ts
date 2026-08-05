// Confeti auto-contenido (sin dependencias) para celebrar un éxito grande.
// Colores de la marca. Se limpia solo al terminar.

const COLORS = ['#7a9e7e', '#c9a84c', '#E5462F', '#74CDE4', '#f5f0e8']

export function confetti(originX?: number, originY?: number): void {
  if (typeof document === 'undefined') return

  const cx = originX ?? window.innerWidth / 2
  const cy = originY ?? window.innerHeight / 3

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden'
  document.body.appendChild(container)

  const N = 90
  const parts: { el: HTMLDivElement; x: number; y: number; vx: number; vy: number; rot: number; vr: number }[] = []

  for (let i = 0; i < N; i++) {
    const el = document.createElement('div')
    const size = 6 + Math.random() * 6
    el.style.cssText = `position:absolute;top:0;left:0;width:${size}px;height:${size * 0.55}px;background:${COLORS[i % COLORS.length]};will-change:transform,opacity`
    container.appendChild(el)
    const ang = Math.random() * Math.PI * 2
    const speed = 4 + Math.random() * 8
    parts.push({
      el, x: cx, y: cy,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 5,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 22,
    })
  }

  let frame = 0
  const step = () => {
    frame++
    let alive = false
    const op = Math.max(0, 1 - frame / 90)
    for (const p of parts) {
      p.vy += 0.28          // gravedad
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`
      p.el.style.opacity = String(op)
    }
    if (op > 0) alive = true
    if (alive && frame < 120) requestAnimationFrame(step)
    else container.remove()
  }
  requestAnimationFrame(step)
}
