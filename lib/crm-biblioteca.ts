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
import { temperaturaDe, TEMPERATURAS } from '@/lib/crm-temperatura'

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

/**
 * Cómo se comporta un grupo de origen. Existe porque promediar fríos con
 * entrantes da un número que no describe a ninguno de los dos: un entrante
 * llega con el interés ya declarado y cierra en muchos menos toques.
 * La hipótesis de los 16 toques sólo tiene sentido medida contra los fríos.
 */
export interface TemperaturaInsight {
  temperatura: string          // frio | entrante | sin_clasificar
  prospectos: number
  promedioContactos: number
  medianaContactos: number
  tasaRespuesta: number        // 0–1
  cierre: ResumenGrupo         // confirmados de este grupo: toques al cerrar
}

export interface BibliotecaContactos {
  porEtapa: EtapaInsight[]
  porTemperatura: TemperaturaInsight[]
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
  prospectos: { id: string; etapa: string; origen?: string | null }[],
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
  const porTemp = new Map<string, { conteos: number[]; interacc: number; respond: number; cierre: number[] }>()
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

    const t = temperaturaDe(p.origen)
    const gt = porTemp.get(t) ?? { conteos: [], interacc: 0, respond: 0, cierre: [] }
    gt.conteos.push(agg.total)
    gt.interacc += agg.total
    gt.respond += agg.respondidos
    if (p.etapa === 'confirmado') gt.cierre.push(agg.total)
    porTemp.set(t, gt)

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

  const porTemperatura: TemperaturaInsight[] = TEMPERATURAS
    .filter(t => porTemp.has(t))
    .map(t => {
      const g = porTemp.get(t)!
      const nP = g.conteos.length
      return {
        temperatura: t,
        prospectos: nP,
        promedioContactos: nP ? g.interacc / nP : 0,
        medianaContactos: mediana(g.conteos),
        tasaRespuesta: g.interacc ? g.respond / g.interacc : 0,
        cierre: { n: g.cierre.length, promedio: promedio(g.cierre), mediana: mediana(g.cierre) },
      }
    })

  return {
    porEtapa,
    porTemperatura,
    cierre: { n: cierre.length, promedio: promedio(cierre), mediana: mediana(cierre) },
    frio: { n: frio.length, promedio: promedio(frio), mediana: mediana(frio) },
    tasaRespuestaGlobal: totalContactos ? totalRespond / totalContactos : 0,
    totalContactos,
    totalProspectos: prospectos.length,
  }
}
