// Importa un período del SII a Hilván — corre en el Mac, NO en Vercel.
//
// Uso:  npm run sii:importar -- 2026-09            (compras, ventas y honorarios)
//       npm run sii:importar -- 2026-09 --solo bhe   (compras | ventas | bhe, separados por coma)
//       npm run sii:importar -- 2026-09 --dry        (lee el SII y muestra el resumen, no envía)
//
// Lee el SII con la CLI `sii` (albertomarturelo/sii) usando la sesión guardada en
// ~/.sii (la de Casa Hiedra: `sii auth login`, una vez por sesión). La clave
// tributaria nunca pasa por acá ni por Hilván. Manda lo leído, tal cual, a
// /api/agent/sii-importar, que lo guarda en sii_documentos y deja registrado si
// cada lado llegó completo.
//
// Ante CUALQUIER error del SII o de la sesión se detiene sin enviar nada y sin
// reintentar (el SII bloquea cuentas por intentos repetidos).
//
// Env (de .env.local vía el script de npm):
//   HILVAN_AGENT_TOKEN  obligatorio
//   HILVAN_URL          default https://app.casahiedra.com (http://localhost:3000 para probar)
//   SII_CLI             ruta al binario `sii`; default ~/sii-ensayo/node_modules/.bin/sii o `sii` del PATH
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

function salir(msg, code = 1) {
  console.error(msg)
  process.exit(code)
}

// ── Argumentos ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const m = (args.find((a) => !a.startsWith('--')) ?? '').match(/^(\d{4})-?(\d{2})$/)
if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
  salir('Uso: npm run sii:importar -- AAAA-MM [--solo compras,ventas,bhe] [--dry]')
}
const periodo = `${m[1]}-${m[2]}`
const dry = args.includes('--dry')
const iSolo = args.indexOf('--solo')
const lados = iSolo >= 0 ? (args[iSolo + 1] ?? '').split(',').map((s) => s.trim()) : ['compras', 'ventas', 'bhe']
if (!lados.length || lados.some((l) => !['compras', 'ventas', 'bhe'].includes(l))) {
  salir('--solo acepta compras, ventas y/o bhe separados por coma')
}

const token = process.env.HILVAN_AGENT_TOKEN
if (!dry && !token) salir('Falta HILVAN_AGENT_TOKEN (en .env.local)')
const base = (process.env.HILVAN_URL || 'https://app.casahiedra.com').replace(/\/$/, '')

const local = join(homedir(), 'sii-ensayo', 'node_modules', '.bin', 'sii')
const bin = process.env.SII_CLI || (existsSync(local) ? local : 'sii')

// ── CLI del SII ────────────────────────────────────────────────────────────
async function sii(...cmd) {
  const etiqueta = `sii ${cmd.join(' ')}`
  process.stdout.write(`· ${etiqueta} … `)
  const t0 = Date.now()
  try {
    // 120 s de techo por comando: la CLI corta cada consulta a los 30 s.
    const { stdout } = await run(bin, cmd, { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 })
    console.log(`ok (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
    return JSON.parse(stdout)
  } catch (e) {
    console.log('FALLÓ')
    if (e.code === 'ENOENT') salir(`No encuentro la CLI \`sii\` (${bin}). Instálala o define SII_CLI.`)
    let detalle = (e.stdout || e.stderr || e.message || '').trim()
    try {
      detalle = JSON.parse(e.stdout).error ?? detalle
    } catch {}
    const sesion = e.code === 2
      ? '\nNo hay sesión válida del SII. Corre `sii auth login` UNA vez (si el SII rechaza la clave, NO reintentes) y vuelve a importar.'
      : ''
    salir(`\n${etiqueta} terminó con error (código ${e.code ?? e.signal}):\n  ${detalle}${sesion}\nNo se envió nada a Hilván.`)
  }
}

const { stdout: version } = await run(bin, ['--version']).catch(() => ({ stdout: '' }))
const herramienta = `sii-cli ${version.trim() || '?'}`

console.log(`SII → Hilván · ${periodo} · ${lados.join(', ')}${dry ? ' · DRY (no envía)' : ` · ${base}`}`)
const cuerpo = { periodo, herramienta }
if (lados.includes('compras')) {
  cuerpo.compras = { resumen: await sii('rcv', 'summary', periodo), detalle: await sii('rcv', 'all', periodo) }
}
if (lados.includes('ventas')) {
  cuerpo.ventas = {
    resumen: await sii('rcv', 'summary', periodo, '--venta'),
    detalle: await sii('rcv', 'all', periodo, '--venta'),
  }
}
if (lados.includes('bhe')) cuerpo.bhe = await sii('bte', 'list', periodo, '--recibidas')

if (dry) {
  if (cuerpo.compras) console.log(`compras: ${cuerpo.compras.detalle.docs.length} documentos (rechazados: ${cuerpo.compras.detalle.rejectedTypes.join(', ') || 'ninguno'})`)
  if (cuerpo.ventas) console.log(`ventas: ${cuerpo.ventas.detalle.docs.length} documentos (rechazados: ${cuerpo.ventas.detalle.rejectedTypes.join(', ') || 'ninguno'})`)
  if (cuerpo.bhe) console.log(`bhe: ${cuerpo.bhe.boletas.length} de ${cuerpo.bhe.totalBoletas ?? '?'} boletas`)
  process.exit(0)
}

// ── Envío a Hilván ─────────────────────────────────────────────────────────
let res
try {
  res = await fetch(`${base}/api/agent/sii-importar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo),
  })
} catch (e) {
  salir(`No se pudo conectar con Hilván (${base}): ${e.message}`)
}
const texto = await res.text()
let json
try {
  json = JSON.parse(texto)
} catch {
  salir(`Hilván respondió HTTP ${res.status} sin JSON: ${texto.slice(0, 200)}`)
}
if (!res.ok) salir(`Hilván rechazó la importación (HTTP ${res.status}): ${json.error ?? texto.slice(0, 200)}`)

let incompleto = false
for (const [lado, r] of Object.entries(json.resultado ?? {})) {
  console.log(`${r.estado === 'completo' ? '✓' : '✗'} ${lado}: ${r.estado} · ${r.documentos} documentos`)
  for (const err of r.errores ?? []) console.log(`    - ${err}`)
  if (r.estado !== 'completo') incompleto = true
}
if (incompleto) {
  salir('\nAlgún lado quedó INCOMPLETO: el agente lo verá como error hasta que se reimporte completo.')
}
console.log('\nListo. El agente ya puede usar hilvan_sii_sync / hilvan_sii_sync_ventas para este período.')
