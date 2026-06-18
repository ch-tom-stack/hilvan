// Operaciones de imagen para stickers del plan de rodaje (server-side, sharp).
// Validadas a mano sobre imágenes variadas (fondo blanco, damero, color texturado,
// escena, ya-transparente). Sin dependencias de IA.

import sharp from 'sharp'

const dist = (d: Buffer | Uint8Array, i: number, r: number, g: number, b: number) => {
  const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

export interface ResultadoQuitarFondo {
  png: Buffer
  aplicado: boolean
  motivo?: string // si no se aplicó (ej. ya transparente, fondo complejo)
}

/**
 * Quita el fondo por chroma-key con heurística automática:
 *  - salta si ya es transparente
 *  - detecta el color de fondo (mediana del borde) y su dispersión
 *  - si la dispersión es muy alta → fondo complejo, no aplica (candidato a IA)
 *  - flood-fill desde el borde (protege colores del fondo DENTRO del sujeto)
 *  - quita bolsas de fondo encerradas (agujeros)
 *  - descontamina el borde (alfa parcial + corrección de color, sin erosionar)
 * `tolBase` permite ajuste manual (default automático).
 */
export async function quitarFondo(input: Buffer, tolBase?: number): Promise<ResultadoQuitarFondo> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height
  const N = W * H

  let trans = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] < 200) trans++
  if (trans > 0.05 * N) {
    return { png: await sharp(input).png().toBuffer(), aplicado: false, motivo: 'La imagen ya tiene transparencia' }
  }

  // Color de referencia (mediana del anillo del borde) + dispersión.
  const borde: number[][] = []
  const B = 3
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (x < B || y < B || x >= W - B || y >= H - B) {
        const i = (y * W + x) * 4
        borde.push([data[i], data[i + 1], data[i + 2]])
      }
  const med = (c: number) => {
    const s = borde.map(p => p[c]).sort((a, b) => a - b)
    return s[s.length >> 1]
  }
  const ref = [med(0), med(1), med(2)]
  let sv = 0
  for (const p of borde) sv += Math.hypot(p[0] - ref[0], p[1] - ref[1], p[2] - ref[2])
  const spread = sv / borde.length

  if (spread > 70) {
    return { png: await sharp(input).png().toBuffer(), aplicado: false, motivo: 'Fondo complejo (no es plano) — requiere recorte por IA' }
  }

  const tol = tolBase ?? Math.max(38, spread * 2.2)

  // Flood-fill 4-conexo desde todo el borde.
  const out = new Uint8Array(N)
  const st: number[] = []
  for (let x = 0; x < W; x++) { st.push(x, (H - 1) * W + x) }
  for (let y = 0; y < H; y++) { st.push(y * W, y * W + W - 1) }
  while (st.length) {
    const p = st.pop()!
    if (out[p]) continue
    const x = p % W, y = (p / W) | 0
    if (dist(data, p * 4, ref[0], ref[1], ref[2]) > tol) continue
    out[p] = 1
    if (x > 0) st.push(p - 1)
    if (x < W - 1) st.push(p + 1)
    if (y > 0) st.push(p - W)
    if (y < H - 1) st.push(p + W)
  }

  // Agujeros encerrados (color casi idéntico al fondo, no alcanzados por el flood-fill).
  const bg = Uint8Array.from(out)
  const tight = tol * 0.55
  for (let p = 0; p < N; p++) if (!out[p] && dist(data, p * 4, ref[0], ref[1], ref[2]) < tight) bg[p] = 1

  // Alfa: fondo→0, interior→255, banda de borde→alfa parcial + descontaminación.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x, i = p * 4
      if (bg[p]) { data[i + 3] = 0; continue }
      let nbBg = false
      for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= 0 && q < N && bg[q]) { nbBg = true; break }
      if (!nbBg) { data[i + 3] = 255; continue }
      const d = dist(data, i, ref[0], ref[1], ref[2])
      const a = Math.max(0, Math.min(1, d / (tol * 1.3)))
      data[i + 3] = Math.round(255 * a)
      if (a > 0.15) for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - (1 - a) * ref[c]) / a)))
    }

  const png = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
  return { png, aplicado: true }
}

/** Dilatación separable (max filter) de un canal. */
function dilata(alpha: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = 0; for (let dx = -r; dx <= r; dx++) { const nx = x + dx; if (nx < 0 || nx >= W) continue; const v = alpha[y * W + nx]; if (v > m) m = v } tmp[y * W + x] = m }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = 0; for (let dy = -r; dy <= r; dy++) { const ny = y + dy; if (ny < 0 || ny >= H) continue; const v = tmp[ny * W + x]; if (v > m) m = v } out[y * W + x] = m }
  return out
}

/** Agrega un contorno tipo sticker (color + grosor px) siguiendo la silueta alfa. */
export async function agregarBorde(input: Buffer, color: [number, number, number] = [255, 255, 255], grosor = 12): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height, N = W * H
  const a = new Uint8Array(N)
  for (let p = 0; p < N; p++) a[p] = data[p * 4 + 3]
  const da = dilata(a, W, H, Math.max(1, Math.round(grosor)))
  const res = Buffer.alloc(N * 4)
  for (let p = 0; p < N; p++) {
    const i = p * 4
    const oa = data[i + 3] / 255, ba = da[p] / 255
    const outA = oa + ba * (1 - oa)
    for (let c = 0; c < 3; c++) res[i + c] = outA ? Math.round((data[i + c] * oa + color[c] * ba * (1 - oa)) / outA) : 0
    res[i + 3] = Math.round(outA * 255)
  }
  return sharp(Buffer.from(res), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
}

/** Recorta los márgenes transparentes (auto-trim). */
export async function recortarMargenes(input: Buffer): Promise<Buffer> {
  return sharp(input).trim().png().toBuffer()
}

/** Recorte manual a un rectángulo dado en fracciones (0..1) del ancho/alto. */
export async function recortar(input: Buffer, x: number, y: number, w: number, h: number): Promise<Buffer> {
  const meta = await sharp(input).metadata()
  const W = meta.width ?? 0, H = meta.height ?? 0
  const left = Math.max(0, Math.min(W - 1, Math.round(x * W)))
  const top = Math.max(0, Math.min(H - 1, Math.round(y * H)))
  const width = Math.max(1, Math.min(W - left, Math.round(w * W)))
  const height = Math.max(1, Math.min(H - top, Math.round(h * H)))
  return sharp(input).extract({ left, top, width, height }).png().toBuffer()
}
