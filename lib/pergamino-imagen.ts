// Genera el pergamino de una medalla como imagen descargable.
//
// POR QUÉ EXISTE. Todos los símbolos del sistema viven dentro de Hilván: si no
// abres la app, no existen. Uno que se puede sacar —imprimir, mandar, poner de
// foto— pesa distinto, porque sobrevive fuera del lugar que lo otorgó.
//
// Se dibuja el mismo pergamino de la app, con las mismas constantes, para que
// lo que se baja sea reconociblemente la misma cosa y no una tarjeta genérica.

import { EMBLEMAS, EMBLEMA_DEFECTO } from '@/lib/emblemas'

const NUCLEO = 5
const GROSOR = 2
const R_VARA = 13

const TINTA = '#8e8e86'
const RELLENO = '#2a2a25'
const LINEA = '#6e6e66'
const FONDO = '#1c1c1a'
const PAPEL = '#111110'
const CREMA = '#f5f0e8'
const ORO = '#c9a84c'

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

function vara(x: number, y: number, ancho: number): string {
  const r = R_VARA
  const xTapa = ancho - r - 1
  return `
    <g transform="translate(${x} ${y})">
      <path d="M ${r} 1 H ${xTapa} A ${r} ${r} 0 0 1 ${xTapa} ${r * 2 + 1} H ${r}"
            fill="${RELLENO}" stroke="${TINTA}" stroke-width="1.4"/>
      <circle cx="${r}" cy="${r + 1}" r="${r}" fill="${RELLENO}" stroke="${TINTA}" stroke-width="1.4"/>
      <path d="${espiral(r)}" transform="translate(${r} ${r + 1})" fill="none" stroke="${TINTA}" stroke-width="1"/>
    </g>`
}

/** Las mordidas del canto, en las mismas alturas irregulares que en la app. */
function mordidas(x0: number, x1: number, alto: number): string {
  const puntos: [number, 'izq' | 'der', number, number][] = [
    [62, 'izq', 13, 9], [148, 'der', 10, 7], [231, 'izq', 8, 6],
    [316, 'der', 15, 10], [404, 'izq', 11, 8],
  ]
  return puntos
    .filter(([y]) => y < alto - 20)
    .map(([y, lado, a, h]) => {
      const x = lado === 'izq' ? x0 : x1
      const s = lado === 'izq' ? 1 : -1
      return `<path d="M ${x} ${y} L ${x + h * s} ${y + a / 2} L ${x} ${y + a} Z"
                    fill="${FONDO}" stroke="${LINEA}" stroke-width="1" stroke-linejoin="round"/>`
    })
    .join('')
}

/** Parte el texto en líneas de ~`max` caracteres, sin cortar palabras. */
function envolver(texto: string, max: number): string[] {
  const palabras = texto.split(/\s+/)
  const lineas: string[] = []
  let actual = ''
  for (const p of palabras) {
    if ((actual + ' ' + p).trim().length > max && actual) { lineas.push(actual); actual = p }
    else actual = (actual + ' ' + p).trim()
  }
  if (actual) lineas.push(actual)
  return lineas
}

export interface DatosPergamino {
  clave: string
  titulo: string
  rareza: string
  criterio: string
  persona: string
  fecha: string
}

/**
 * El SVG del pergamino.
 *
 * Las tipografías van con familias genéricas y no con las de Hilván: al
 * convertir a PNG, el lienzo no tiene acceso a las fuentes de la página y
 * caería a una cualquiera. Georgia cursiva es lo más cerca de Cormorant que
 * existe en todas las máquinas, y así lo descargado se ve igual en cualquier
 * parte en vez de bien sólo acá.
 */
export function svgPergamino(d: DatosPergamino): string {
  const ANCHO = 640
  const MARGEN = 34
  const oro = d.rareza === 'rara' || d.rareza === 'legendaria'
  const color = oro ? ORO : CREMA

  const criterio = envolver(d.criterio, 52)
  const ALTO_PAPEL = 300 + criterio.length * 22
  const yPapel = R_VARA * 2 + 6
  const ALTO = yPapel + ALTO_PAPEL + R_VARA * 2 + 6

  const emblema = EMBLEMAS[d.clave] ?? EMBLEMA_DEFECTO
  const cx = ANCHO / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
  <rect width="${ANCHO}" height="${ALTO}" fill="${FONDO}"/>

  ${vara(0, 0, ANCHO - 20)}

  <rect x="${MARGEN}" y="${yPapel}" width="${ANCHO - MARGEN * 2}" height="${ALTO_PAPEL}" fill="${PAPEL}"/>
  <line x1="${MARGEN}" y1="${yPapel}" x2="${MARGEN}" y2="${yPapel + ALTO_PAPEL}" stroke="${LINEA}" stroke-width="1"/>
  <line x1="${ANCHO - MARGEN}" y1="${yPapel}" x2="${ANCHO - MARGEN}" y2="${yPapel + ALTO_PAPEL}" stroke="${LINEA}" stroke-width="1"/>
  <g transform="translate(0 ${yPapel})">${mordidas(MARGEN, ANCHO - MARGEN, ALTO_PAPEL)}</g>

  <g transform="translate(${cx} ${yPapel + 74}) scale(3.2) translate(-12 -12)">
    <path d="${emblema}" fill="none" stroke="${color}" stroke-width="1.4"
          stroke-linecap="square" stroke-linejoin="miter"/>
  </g>

  ${d.rareza !== 'comun' ? `<text x="${cx}" y="${yPapel + 154}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="11" letter-spacing="5"
        fill="${oro ? ORO : '#7a9e7e'}">${d.rareza.toUpperCase()}</text>` : ''}

  <text x="${cx}" y="${yPapel + 200}" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="34"
        fill="${color}">${escapar(d.titulo)}</text>

  ${criterio.map((l, i) => `<text x="${cx}" y="${yPapel + 240 + i * 22}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="14" fill="${TINTA}">${escapar(l)}</text>`).join('')}

  <line x1="${cx - 60}" y1="${yPapel + ALTO_PAPEL - 74}" x2="${cx + 60}" y2="${yPapel + ALTO_PAPEL - 74}"
        stroke="${LINEA}" stroke-width="1"/>
  <text x="${cx}" y="${yPapel + ALTO_PAPEL - 48}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="13" fill="${CREMA}">${escapar(d.persona)}</text>
  <text x="${cx}" y="${yPapel + ALTO_PAPEL - 26}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="10" letter-spacing="2.5"
        fill="#8c8c86">CASA HIEDRA · ${escapar(d.fecha.toUpperCase())}</text>

  ${vara(20, yPapel + ALTO_PAPEL, ANCHO - 20)}
</svg>`
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Descarga el pergamino como PNG.
 *
 * Se pasa por canvas al doble de escala: un PNG a 1x se ve blando apenas se
 * imprime o se usa de foto de perfil, que son los dos usos que tiene esto.
 */
export async function descargarPergamino(d: DatosPergamino): Promise<void> {
  const svg = svgPergamino(d)
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const img = new Image()
    await new Promise<void>((ok, falla) => {
      img.onload = () => ok()
      img.onerror = () => falla(new Error('no se pudo dibujar'))
      img.src = url
    })

    const escala = 2
    const lienzo = document.createElement('canvas')
    lienzo.width = img.width * escala
    lienzo.height = img.height * escala
    const ctx = lienzo.getContext('2d')
    if (!ctx) throw new Error('sin canvas')
    ctx.scale(escala, escala)
    ctx.drawImage(img, 0, 0)

    const png = await new Promise<Blob | null>(r => lienzo.toBlob(r, 'image/png'))
    if (!png) throw new Error('sin png')

    const a = document.createElement('a')
    a.href = URL.createObjectURL(png)
    a.download = `medalla-${d.clave}.png`
    a.click()
    URL.revokeObjectURL(a.href)
  } finally {
    URL.revokeObjectURL(url)
  }
}
