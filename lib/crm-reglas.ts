// Sirve las reglas del CRM al agente, leyéndolas del repo.
//
// Por qué existe: las sesiones de Cowork no tienen el repo montado. La primera
// solución fue pegarle las reglas al agente en el prompt, pero eso crea una
// copia que envejece — la misma fragilidad que el Repertorio ya había resuelto
// sirviéndose por MCP en vez de quemarse a mano. Acá se aplica ese patrón: el
// repo sigue siendo la única fuente de verdad y el agente lee la versión
// vigente en cada corrida.
//
// Los .md se incluyen en el bundle serverless vía `outputFileTracingIncludes`
// en next.config.ts; sin eso el endpoint funciona en local y falla en Vercel.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const DOCS_REGLAS = {
  correos:     'reglas-correos.md',
  cadencia:    'reglas-cadencia.md',
  reparto:     'reglas-reparto.md',
  misiones:    'reglas-misiones.md',
  negociacion: 'reglas-negociacion.md',
} as const

export type ClaveRegla = keyof typeof DOCS_REGLAS

export const CLAVES_REGLA = Object.keys(DOCS_REGLAS) as ClaveRegla[]

export interface Regla {
  clave: ClaveRegla
  archivo: string
  contenido: string
}

function rutaDoc(archivo: string): string {
  return join(process.cwd(), 'docs', 'crm', archivo)
}

/**
 * Lee una regla. Devuelve null si el archivo no está disponible — el endpoint
 * lo reporta como hueco explícito en vez de responder reglas a medias, que es
 * peor: el agente creería que esa regla no existe.
 */
export function leerRegla(clave: ClaveRegla): Regla | null {
  try {
    const archivo = DOCS_REGLAS[clave]
    return { clave, archivo, contenido: readFileSync(rutaDoc(archivo), 'utf8').trimEnd() }
  } catch {
    return null
  }
}

export function leerReglas(claves: ClaveRegla[] = CLAVES_REGLA): {
  reglas: Regla[]
  faltantes: ClaveRegla[]
} {
  const reglas: Regla[] = []
  const faltantes: ClaveRegla[] = []
  for (const c of claves) {
    const r = leerRegla(c)
    if (r) reglas.push(r)
    else faltantes.push(c)
  }
  return { reglas, faltantes }
}
