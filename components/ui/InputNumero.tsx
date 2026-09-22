'use client'

import { useEffect, useState } from 'react'
import { leerNumero } from '@/lib/calc-expresion'

/**
 * Campo numérico que acepta fórmulas: "3*85000", "1.200.000/4", "250000+15%".
 *
 * Mientras se escribe muestra el texto tal cual; al salir del campo (o con
 * Enter) evalúa y entrega el número. Si no se entiende, se marca en dorado y
 * conserva el valor anterior: nunca guarda basura ni un cero por accidente.
 */
export default function InputNumero({
  value, onChange, min, decimales = 0, className = '', placeholder, autoFocus, id,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  decimales?: number
  className?: string
  placeholder?: string
  autoFocus?: boolean
  id?: string
}) {
  const aTexto = (n: number) => (n === 0 && placeholder ? '' : String(n))
  const [texto, setTexto] = useState(aTexto(value))
  const [invalido, setInvalido] = useState(false)

  // Si el valor cambia desde afuera (una tarifa de la biblioteca), se refleja.
  useEffect(() => { setTexto(aTexto(value)); setInvalido(false) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const confirmar = () => {
    if (texto.trim() === '') {
      const cero = min !== undefined && min > 0 ? min : 0
      setTexto(aTexto(cero)); setInvalido(false); if (cero !== value) onChange(cero)
      return
    }
    const n = leerNumero(texto, { min, decimales })
    if (n === null) { setInvalido(true); return }
    setInvalido(false)
    setTexto(aTexto(n))
    if (n !== value) onChange(n)
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoFocus={autoFocus}
      value={texto}
      placeholder={placeholder}
      title="Acepta fórmulas: 3*85000, 1.200.000/4, 250000+15%"
      onChange={e => { setTexto(e.target.value); setInvalido(false) }}
      onBlur={confirmar}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmar() } }}
      aria-invalid={invalido || undefined}
      className={`${className} ${invalido ? '!border-ch-gold' : ''}`}
    />
  )
}
