// lib/crm-cruce.ts
// Origen × tamaño: ¿qué tamaño de cliente trae cada canal?
//
// Nació del brief de calidad de leads (19-sep-2026): el sitio traía 75% de
// marcas chicas y el canal saliente 87% de medianas y grandes. El sitio
// respondió mostrando los precios "desde" antes del formulario. Para saber si
// eso movió algo hay que poder repetir EL MISMO cruce más adelante, acotado a
// los leads que entraron después del cambio — de ahí `desde`.

import { temperaturaDe, type Temperatura } from '@/lib/crm-temperatura'

export interface ProspectoCruce {
  origen?: string | null
  tamano?: string | null
  etapa: string
  created_at?: string | null
  datos_dudosos?: boolean | null
}

export interface FilaCruce {
  total: number
  chica: number
  mediana: number
  grande: number
  sin_tamano: number
  /** Sobre los que SÍ tienen tamaño: sin clasificar no es chico ni grande. */
  pct_chica: number | null
  pct_mediana_grande: number | null
  confirmados: number
  descartados: number
}

const vacia = (): FilaCruce => ({
  total: 0, chica: 0, mediana: 0, grande: 0, sin_tamano: 0,
  pct_chica: null, pct_mediana_grande: null, confirmados: 0, descartados: 0,
})

/**
 * `desde` (YYYY-MM-DD) deja solo los prospectos creados ese día o después.
 * Las fichas marcadas como dudosas se excluyen: son en su mayoría bots y
 * capturas basura, y contarlas ensucia justo al canal entrante.
 */
export function cruceOrigenTamano(
  prospectos: ProspectoCruce[],
  desde?: string | null,
): { desde: string | null; considerados: number; excluidos_dudosos: number; por_canal: Record<Temperatura, FilaCruce> } {
  const por_canal: Record<Temperatura, FilaCruce> = { entrante: vacia(), frio: vacia(), sin_clasificar: vacia() }
  let considerados = 0
  let excluidos = 0

  for (const p of prospectos) {
    if (desde && (p.created_at ?? '').slice(0, 10) < desde) continue
    if (p.datos_dudosos) { excluidos++; continue }
    considerados++
    const f = por_canal[temperaturaDe(p.origen)]
    f.total++
    if (p.tamano === 'chica') f.chica++
    else if (p.tamano === 'mediana') f.mediana++
    else if (p.tamano === 'grande') f.grande++
    else f.sin_tamano++
    if (p.etapa === 'confirmado') f.confirmados++
    if (p.etapa === 'descartado') f.descartados++
  }

  for (const f of Object.values(por_canal)) {
    const conTamano = f.chica + f.mediana + f.grande
    if (conTamano > 0) {
      f.pct_chica = Math.round((f.chica / conTamano) * 100)
      f.pct_mediana_grande = Math.round(((f.mediana + f.grande) / conTamano) * 100)
    }
  }
  return { desde: desde ?? null, considerados, excluidos_dudosos: excluidos, por_canal }
}
