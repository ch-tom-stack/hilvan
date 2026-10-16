// Lee un período del SII con la CLI `sii` y lo manda a Hilván. Lo comparten el
// comando manual (scripts/sii-importar.mjs) y el trabajador del Mac
// (scripts/sii/trabajador.mjs). Solo módulos de Node: el trabajador corre una
// copia de esta carpeta fuera del repo (ver docs/sii/trabajador-mac.md).
//
// Ante CUALQUIER error del SII o de la sesión lanza ErrorSii y no envía nada:
// nunca reintenta (el SII bloquea cuentas por intentos repetidos).
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const LADOS = ['compras', 'ventas', 'bhe']

/** Error de la CLI del SII. `codigo` = exit code (2 sin sesión, 3 login rechazado). */
export class ErrorSii extends Error {
  constructor(mensaje, codigo) {
    super(mensaje)
    this.codigo = codigo
  }
}

/** Error al hablar con Hilván. */
export class ErrorHilvan extends Error {}

/** `2026-09` / `202609` → `2026-09`; inválido → null. */
export function periodoCli(v) {
  const m = String(v ?? '').trim().match(/^(\d{4})-?(\d{2})$/)
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null
  return `${m[1]}-${m[2]}`
}

/** Ruta del binario `sii`: SII_CLI, o el de ~/sii-ensayo, o el del PATH. */
export function binSii() {
  if (process.env.SII_CLI) return process.env.SII_CLI
  const local = join(homedir(), 'sii-ensayo', 'node_modules', '.bin', 'sii')
  return existsSync(local) ? local : 'sii'
}

/** Corre la CLI y devuelve su JSON. `log` recibe una línea por comando. */
export async function sii(bin, cmd, log = () => {}) {
  const etiqueta = `sii ${cmd.join(' ')}`
  const t0 = Date.now()
  try {
    // 120 s de techo por comando: la CLI corta cada consulta a los 30 s.
    const { stdout } = await run(bin, cmd, { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 })
    log(`· ${etiqueta} … ok (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
    return JSON.parse(stdout)
  } catch (e) {
    log(`· ${etiqueta} … FALLÓ`)
    if (e.code === 'ENOENT') throw new ErrorSii(`No encuentro la CLI \`sii\` (${bin}). Instálala o define SII_CLI.`, 127)
    let detalle = String(e.stdout || e.stderr || e.message || '').trim()
    try {
      detalle = JSON.parse(e.stdout).error ?? detalle
    } catch {}
    const codigo = typeof e.code === 'number' ? e.code : 1
    throw new ErrorSii(`${etiqueta} terminó con error (código ${e.code ?? e.signal}): ${detalle}`, codigo)
  }
}

export async function versionSii(bin) {
  const { stdout } = await run(bin, ['--version']).catch(() => ({ stdout: '' }))
  return `sii-cli ${stdout.trim() || '?'}`
}

/** Lee del SII los lados pedidos de un período. */
export async function leerPeriodo(bin, periodo, lados, log) {
  const cuerpo = { periodo, herramienta: await versionSii(bin) }
  if (lados.includes('compras')) {
    cuerpo.compras = {
      resumen: await sii(bin, ['rcv', 'summary', periodo], log),
      detalle: await sii(bin, ['rcv', 'all', periodo], log),
    }
  }
  if (lados.includes('ventas')) {
    cuerpo.ventas = {
      resumen: await sii(bin, ['rcv', 'summary', periodo, '--venta'], log),
      detalle: await sii(bin, ['rcv', 'all', periodo, '--venta'], log),
    }
  }
  if (lados.includes('bhe')) cuerpo.bhe = await sii(bin, ['bte', 'list', periodo, '--recibidas'], log)
  return cuerpo
}

/** POST JSON autenticado a Hilván; devuelve el JSON o lanza ErrorHilvan. */
export async function postHilvan(base, token, ruta, cuerpo) {
  let res
  try {
    res = await fetch(`${base}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
    })
  } catch (e) {
    throw new ErrorHilvan(`No se pudo conectar con Hilván (${base}): ${e.message}`)
  }
  const texto = await res.text()
  let json
  try {
    json = JSON.parse(texto)
  } catch {
    throw new ErrorHilvan(`Hilván respondió HTTP ${res.status} sin JSON: ${texto.slice(0, 200)}`)
  }
  if (!res.ok) throw new ErrorHilvan(`Hilván respondió HTTP ${res.status}: ${json.error ?? texto.slice(0, 200)}`)
  return json
}

/** Lee y envía. Devuelve `resultado` de /api/agent/sii-importar ({ lado: {estado, documentos, errores} }). */
export async function importarPeriodo({ periodo, lados, bin, base, token, log }) {
  const cuerpo = await leerPeriodo(bin, periodo, lados, log)
  const json = await postHilvan(base, token, '/api/agent/sii-importar', cuerpo)
  return json.resultado ?? {}
}
