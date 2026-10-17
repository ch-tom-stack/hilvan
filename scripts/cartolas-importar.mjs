// Importa a Hilván las cartolas y movimientos de tarjeta que se sueltan en una carpeta.
//
// Se descarga de Office Banking Santander y se deja en la carpeta (por defecto
// ~/Documents/Cartolas Santander):
//   - cartola mensual de cuenta corriente (.tx1)
//   - estado de cuenta mensual de la tarjeta de crédito (PDF EstadoCuentaTC…, se lee con
//     pdftotext de poppler: `brew install poppler`)
//   - movimientos no facturados de la tarjeta de crédito (mov_nac*.txt)
// Cada archivo se valida (RUT y cuenta de Casa Hiedra; la cartola debe cuadrar con sus
// saldos; el estado de cuenta, con sus totales), se cruza con lo que ya está en Hilván (no duplica lo que entró por los avisos
// de correo ni lo cargado a mano) y se importa. Los archivos procesados pasan a
// <carpeta>/importadas/; los que fallan se quedan donde están y se informa por qué.
//
// Uso:  npm run cartolas:importar                     (la carpeta por defecto)
//       npm run cartolas:importar -- --carpeta <ruta>
//       npm run cartolas:importar -- --dry            (lee y cruza, no envía ni mueve)
//
// Lo corre todos los días la tarea programada "santander-correos-a-hilvan".
// Env (de .env.local vía el script de npm):
//   HILVAN_AGENT_TOKEN  obligatorio
//   HILVAN_URL          default https://app.casahiedra.com
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import {
  CUENTA_EMPRESA,
  FUENTE_CC,
  FUENTE_TC,
  RUT_EMPRESA,
  filasCartola,
  leerCartola,
  leerEstadoCuentaTC,
  leerTarjeta,
  separarNuevas,
} from './cartolas/lector.mjs'

const LIMITE_LISTADO = 200 // /api/agent/movimientos devuelve hasta 200

function salir(msg, code = 1) {
  console.error(msg)
  process.exit(code)
}

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const iCarpeta = args.indexOf('--carpeta')
const carpeta = iCarpeta >= 0 ? args[iCarpeta + 1] : join(homedir(), 'Documents', 'Cartolas Santander')
if (!carpeta) salir('Uso: npm run cartolas:importar -- [--carpeta <ruta>] [--dry]')
const token = process.env.HILVAN_AGENT_TOKEN
if (!token) salir('Falta HILVAN_AGENT_TOKEN (en .env.local)')
const base = (process.env.HILVAN_URL || 'https://app.casahiedra.com').replace(/\/$/, '')

async function hilvan(metodo, ruta, cuerpo) {
  const res = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const texto = await res.text()
  let json
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error(`Hilván respondió ${res.status} sin JSON`)
  }
  if (!res.ok) throw new Error(`Hilván respondió ${res.status}: ${json?.error ?? texto.slice(0, 200)}`)
  return json
}

async function existentes(fuente, desde, hasta) {
  const qs = new URLSearchParams({ fuente, desde, hasta })
  const filas = await hilvan('GET', `/api/agent/movimientos?${qs}`)
  if (!Array.isArray(filas)) throw new Error('respuesta inesperada de /api/agent/movimientos')
  if (filas.length >= LIMITE_LISTADO) {
    throw new Error(`hay ${filas.length}+ movimientos entre ${desde} y ${hasta}: el listado está truncado y no se puede cruzar sin riesgo de duplicar`)
  }
  return filas
}

const sumar = (filas, tipo) => filas.filter((f) => f.tipo === tipo).reduce((s, f) => s + f.monto, 0)
const clp = (n) => `$${Math.round(n).toLocaleString('es-CL')}`
const desplazar = (fecha, n) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

function textoPdf(ruta) {
  for (const bin of ['pdftotext', '/opt/homebrew/bin/pdftotext', '/usr/local/bin/pdftotext']) {
    try {
      return execFileSync(bin, ['-layout', ruta, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error(`no pude leer el PDF: ${e.message}`)
    }
  }
  throw new Error('falta pdftotext para leer PDFs (brew install poppler)')
}

async function procesar(ruta) {
  const esPdf = /\.pdf$/i.test(ruta)
  const texto = esPdf ? textoPdf(ruta) : readFileSync(ruta, 'latin1')
  const nombre = basename(ruta)
  let filas
  let etiqueta
  let fuente
  if (esPdf) {
    const e = leerEstadoCuentaTC(texto)
    if (!/MONTEALEGRE PRODUCCION/i.test(e.titular)) throw new Error(`es de otro titular ("${e.titular}")`)
    if (!e.cuadra) {
      throw new Error(`no cuadra: operaciones ${clp(e.sumaOperaciones)} vs total ${clp(e.totalOperaciones)}, cargos ${clp(e.sumaCargos)} vs ${clp(e.totalCargos)}`)
    }
    filas = e.filas
    fuente = FUENTE_TC
    etiqueta = `estado de cuenta tarjeta ${e.tarjeta} (${e.desde} → ${e.hasta}), cuadra con sus totales`
  } else if (/^\d{12}/.test(texto)) {
    const c = leerCartola(texto)
    if (c.rut !== RUT_EMPRESA || c.cuenta !== CUENTA_EMPRESA) {
      throw new Error(`es de otra cuenta (RUT ${c.rut}, cuenta ${c.cuenta}); solo se importa la cuenta corriente ${CUENTA_EMPRESA} de Casa Hiedra`)
    }
    if (!c.cuadra) {
      throw new Error(`no cuadra: saldo ${clp(c.saldoInicial)} + abonos ${clp(c.abonos)} − cargos ${clp(c.cargos)} ≠ ${clp(c.saldoFinal)}`)
    }
    filas = filasCartola(c)
    fuente = FUENTE_CC
    etiqueta = `cartola N°${c.nro} (${c.desde} → ${c.hasta}), cuadra con sus saldos`
  } else if (/^FECHA;ESTABLECIMIENTO;/im.test(texto)) {
    const t = leerTarjeta(texto)
    if (!/MONTEALEGRE PRODUCCIONES/i.test(t.empresa)) throw new Error(`es de otra empresa ("${t.empresa}")`)
    filas = t.filas
    fuente = FUENTE_TC
    etiqueta = 'movimientos no facturados de la tarjeta de crédito'
  } else {
    throw new Error('formato desconocido (no es cartola .tx1, estado de cuenta de tarjeta ni movimientos de tarjeta)')
  }
  if (!filas.length) return { nombre, etiqueta, nuevas: [], yaEstaban: [] }

  const fechas = filas.map((f) => f.fecha).sort()
  const previos = await existentes(fuente, desplazar(fechas[0], -3), desplazar(fechas.at(-1), 3))
  const { nuevas, yaEstaban } = separarNuevas(filas, previos)
  let respuesta = null
  if (!dry && nuevas.length) respuesta = await hilvan('POST', '/api/agent/importar-movimientos', { movimientos: nuevas })
  return { nombre, etiqueta, nuevas, yaEstaban, respuesta }
}

let entradas
try {
  entradas = readdirSync(carpeta)
} catch {
  if (dry) salir(`No existe la carpeta ${carpeta}`)
  mkdirSync(join(carpeta, 'importadas'), { recursive: true })
  console.log(`Creé la carpeta ${carpeta}: suelta ahí las cartolas (.tx1) y los estados de cuenta de la tarjeta (PDF).`)
  process.exit(0)
}
const archivos = entradas
  .filter((n) => !n.startsWith('.') && /\.(tx1|txt|pdf)$/i.test(n))
  .map((n) => join(carpeta, n))
  .filter((r) => statSync(r).isFile())
  .sort()

console.log(`Cartolas → Hilván · ${carpeta}${dry ? ' · DRY (no envía ni mueve)' : ` · ${base}`}`)
if (!archivos.length) {
  console.log('No hay archivos nuevos.')
  process.exit(0)
}

let fallos = 0
for (const ruta of archivos) {
  const nombre = basename(ruta)
  try {
    const r = await procesar(ruta)
    console.log(`\n✓ ${nombre}: ${r.etiqueta}`)
    console.log(`  nuevos: ${r.nuevas.length} (abonos ${clp(sumar(r.nuevas, 'abono'))}, cargos ${clp(sumar(r.nuevas, 'cargo'))}) · ya estaban: ${r.yaEstaban.length}`)
    for (const f of r.nuevas) console.log(`    + ${f.fecha} ${f.tipo} ${clp(f.monto)} ${f.descripcion}`)
    if (r.respuesta?.posibles_duplicados?.length) {
      console.log(`  Hilván avisa posibles duplicados (revisar):`)
      for (const p of r.respuesta.posibles_duplicados) console.log(`    ? ${p.fecha} ${p.tipo} ${clp(p.monto)} ${p.descripcion}`)
    }
    if (!dry) {
      const destino = join(carpeta, 'importadas')
      mkdirSync(destino, { recursive: true })
      const sello = new Date().toISOString().slice(0, 10)
      let final = join(destino, `${sello} ${nombre}`)
      for (let n = 2; existsSync(final); n++) final = join(destino, `${sello} (${n}) ${nombre}`)
      renameSync(ruta, final)
    }
  } catch (e) {
    fallos++
    console.log(`\n✗ ${nombre}: ${e.message}. No se importó nada de este archivo; queda en la carpeta.`)
  }
}
if (fallos) salir(`\n${fallos} archivo(s) con problemas.`)
