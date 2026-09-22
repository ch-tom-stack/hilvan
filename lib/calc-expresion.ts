// lib/calc-expresion.ts
// Aritmética en los campos de precio y cantidad: "3*85000", "1.200.000/4",
// "250000+15%"… Sin `eval`: un parser recursivo que solo entiende números,
// + - * / %, paréntesis y signo. Cualquier otra cosa devuelve null y el campo
// no se toca.
//
// Números a la chilena: el punto es separador de miles ("250.000") y la coma
// es decimal ("2,5"). Un punto seguido de exactamente tres dígitos es de miles;
// "2.5" (un punto con menos de tres dígitos después) se lee como decimal, que
// es lo que alguien acostumbrado al teclado numérico espera.

export function evaluarExpresion(texto: string): number | null {
  const src = texto.replace(/\s+/g, '').replace(/\$/g, '')
  if (!src) return null
  let i = 0

  const peek = () => src[i]
  const numero = (): number | null => {
    // Primero miles a la chilena (grupos de exactamente 3), después decimal.
    const m = /^(\d{1,3}(?:\.\d{3})+(?:,\d+)?(?!\d)|\d+(?:[.,]\d+)?|[.,]\d+)/.exec(src.slice(i))
    if (!m) return null
    i += m[0].length
    let s = m[0]
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '')
    s = s.replace(',', '.')
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  const factor = (): number | null => {
    const c = peek()
    if (c === '-') { i++; const v = factor(); return v === null ? null : -v }
    if (c === '(') {
      i++
      const v = expr()
      if (v === null || peek() !== ')') return null
      i++
      return porcentajeSufijo(v)
    }
    const n = numero()
    return n === null ? null : porcentajeSufijo(n)
  }

  // "15%" suelto vale 0.15; "a + 15%" se resuelve en term/expr como a * 1.15.
  const porcentajeSufijo = (v: number): number => {
    if (peek() === '%') { i++; return v / 100 }
    return v
  }

  const term = (): number | null => {
    let v = factor()
    if (v === null) return null
    while (peek() === '*' || peek() === '/') {
      const op = src[i++]
      const r = factor()
      if (r === null) return null
      if (op === '/') { if (r === 0) return null; v = v / r } else v = v * r
    }
    return v
  }

  const expr = (): number | null => {
    let v: number | null = term()
    if (v === null) return null
    while (peek() === '+' || peek() === '-') {
      const op = src[i++]
      const inicio = i
      const r = term()
      if (r === null) return null
      // "250000 + 15%" → el porcentaje es DEL valor de la izquierda.
      const fuePorcentaje = src[i - 1] === '%' && /^[\d.,()]+%$/.test(src.slice(inicio, i))
      const base: number = v
      const delta: number = fuePorcentaje ? base * r : r
      v = op === '+' ? base + delta : base - delta
    }
    return v
  }

  const v = expr()
  if (v === null || i !== src.length || !Number.isFinite(v)) return null
  return v
}

/** Lo que un campo numérico guarda: la expresión evaluada, o null si no se entiende. */
export function leerNumero(texto: string, opts: { min?: number; decimales?: number } = {}): number | null {
  const v = evaluarExpresion(texto)
  if (v === null) return null
  const dec = opts.decimales ?? 0
  const r = Math.round(v * 10 ** dec) / 10 ** dec
  if (opts.min !== undefined && r < opts.min) return null
  return r
}
