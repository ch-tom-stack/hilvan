#!/usr/bin/env node
// Arma el prompt pegable del agente operador del CRM.
//
// Las sesiones de Cowork no tienen el repo montado: si se pega solo el prompt,
// el agente no puede leer las reglas y termina clasificando a ciegas. Este
// script concatena el prompt con las tres reglas vigentes.
//
// Se GENERA, no se mantiene a mano: cada regla vive en un solo archivo, y este
// comando produce la copia que se pega. Así no hay dos versiones que diverjan.
//
//   npm run brief:crm              → imprime (para copiar)
//   npm run brief:crm > brief.md   → a un archivo

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(RAIZ, 'docs', 'crm')

const PROMPT = 'AGENTE-CRM.md'
const REGLAS = ['reglas-correos.md', 'reglas-cadencia.md', 'reglas-reparto.md']

function leer(nombre) {
  try {
    return readFileSync(join(DOCS, nombre), 'utf8').trimEnd()
  } catch {
    console.error(`\n✗ Falta docs/crm/${nombre} — el pegable quedaría incompleto.\n`)
    process.exit(1)
  }
}

// El encabezado del prompt son instrucciones para quien lo genera, no para el
// agente: se recorta hasta el primer separador para que no las lea como suyas.
const prompt = leer(PROMPT)
const cuerpo = prompt.includes('\n---\n')
  ? prompt.slice(prompt.indexOf('\n---\n') + 5).trimStart()
  : prompt

const partes = [
  cuerpo,
  '',
  '---',
  '',
  '# Las reglas, completas',
  '',
  '*Copiadas desde el repo de Hilván en el momento de generar este mensaje.*',
  '',
  ...REGLAS.map(r => `${leer(r)}\n\n---\n`),
]

console.log(partes.join('\n'))
