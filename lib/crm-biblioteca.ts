// Biblioteca de contactos (CH-10): agrega cómo se comportan los contactos por
// etapa del Kanban. Data empírica para mejorar recomendaciones (¿a qué toque
// cierran los confirmados?, ¿a cuál se enfrían?, ¿tasa de respuesta?).
// Lógica PURA reutilizable por la UI (session) y el endpoint de agente (admin).

import {
  ETAPAS_PIPELINE_ACTIVAS,
  ETAPAS_CAJON,
  ETAPA_PROSPECTO_LABELS,
  type EtapaProspecto,
} from '@/types'

export interface EtapaInsight {
  etapa: EtapaProspecto
  label: string
  prospectos: number
  promedioContactos: number
  medianaContactos: number
  tasaRespuesta: number       // 0–1
}

export interface ResumenGrupo {
  n: number
  promedio: number
  mediana: number
}

export interface BibliotecaContactos {
  porEtapa: EtapaInsight[]
  cierre: ResumenGrupo         // confirmados: toques al cerrar
  frio: ResumenGrupo           // en_frio: toques antes de enfriarse
  tasaRespuestaGlobal: number  // 0–1
  totalContactos: number
  totalProspectos: number
}

function mediana(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function promedio(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

export function agregarBiblioteca(
  prospectos: { id: string; etapa: string }[],
  interacciones: { prospecto_id: string; respondido: boolean | null }[],
): BibliotecaContactos {
  // Conteo de contactos y respuestas por prospecto.
  const porProspecto = new Map<string, { total: number; respondidos: number }>()
  for (const i of interacciones) {
    const cur = porProspecto.get(i.prospecto_id) ?? { total: 0, respondidos: 0 }
    cur.total++
    if (i.respondido) cur.respondidos++
    porProspecto.set(i.prospecto_id, cur)
  }

  const grupos = new Map<string, { conteos: number[]; interacc: number; respond: number }>()
  const cierre: number[] = []
  const frio: number[] = []
  let totalContactos = 0
  let totalRespond = 0

  for (const p of prospectos) {
    const agg = porProspecto.get(p.id) ?? { total: 0, respondidos: 0 }
    totalContactos += agg.total
    totalRespond += agg.respondidos

    const g = grupos.get(p.etapa) ?? { conteos: [], interacc: 0, respond: 0 }
    g.conteos.push(agg.total)
    g.interacc += agg.total
    g.respond += agg.respondidos
    grupos.set(p.etapa, g)

    if (p.etapa === 'confirmado') cierre.push(agg.total)
    if (p.etapa === 'en_frio') frio.push(agg.total)
  }

  const porEtapa: EtapaInsight[] = [...ETAPAS_PIPELINE_ACTIVAS, ...ETAPAS_CAJON].map(etapa => {
    const g = grupos.get(etapa) ?? { conteos: [], interacc: 0, respond: 0 }
    const nP = g.conteos.length
    return {
      etapa,
      label: ETAPA_PROSPECTO_LABELS[etapa],
      prospectos: nP,
      promedioContactos: nP ? g.interacc / nP : 0,
      medianaContactos: mediana(g.conteos),
      tasaRespuesta: g.interacc ? g.respond / g.interacc : 0,
    }
  })

  return {
    porEtapa,
    cierre: { n: cierre.length, promedio: promedio(cierre), mediana: mediana(cierre) },
    frio: { n: frio.length, promedio: promedio(frio), mediana: mediana(frio) },
    tasaRespuestaGlobal: totalContactos ? totalRespond / totalContactos : 0,
    totalContactos,
    totalProspectos: prospectos.length,
  }
}
