// Trabajador del SII en el Mac de Tomás — corre en segundo plano con launchd
// cada 5 minutos (docs/sii/trabajador-mac.md). La sesión y la clave del SII
// viven solo en este Mac: la clave en el Llavero de macOS (servicio "sii").
//
// Cada corrida:
//   1. Pregunta a Hilván si hay pedidos (y deja un latido). Si no hay, termina.
//   2. Si está BLOQUEADO (el SII rechazó un login), no hace nada.
//   3. `sii auth login --keyring`: si la sesión sigue viva no usa la clave; si
//      murió, hace UN intento headless. Si el SII lo rechaza → bloquea y avisa.
//   4. Importa cada pedido y reporta hecha / fallida.
//
// Uso:  node --env-file=.env trabajador.mjs             (lo que corre launchd)
//       node --env-file=.env trabajador.mjs --liberar   (tras corregir la clave del Llavero)
//
// Env (.env junto a este archivo, chmod 600):
//   HILVAN_AGENT_TOKEN  obligatorio
//   HILVAN_URL          default https://app.casahiedra.com
//   SII_RUT             default 77151117-1 (la cuenta del Llavero)
//   SII_CLI             ruta al binario `sii` (default ~/sii-ensayo/node_modules/.bin/sii)
import { ErrorSii, binSii, importarPeriodo, periodoCli, postHilvan, sii, versionSii } from './importar.mjs'

const token = process.env.HILVAN_AGENT_TOKEN
const base = (process.env.HILVAN_URL || 'https://app.casahiedra.com').replace(/\/$/, '')
const rut = process.env.SII_RUT || '77151117-1'
const bin = binSii()

const log = (l) => console.log(`${new Date().toISOString()} ${l}`)
const hilvan = (cuerpo) => postHilvan(base, token, '/api/agent/sii-trabajador', cuerpo)

if (!token) {
  log('Falta HILVAN_AGENT_TOKEN en .env')
  process.exit(1)
}

if (process.argv.includes('--liberar')) {
  await hilvan({ accion: 'liberar' })
  log('Trabajador liberado: la próxima corrida vuelve a intentar el login (UNA vez).')
  process.exit(0)
}

const { bloqueado, motivo_bloqueo, solicitudes } = await hilvan({ accion: 'tomar', version: await versionSii(bin) })
if (bloqueado) {
  // Silencioso a propósito: corre cada 5 min. El agente ve el bloqueo en Hilván.
  process.exit(0)
}
if (!solicitudes.length) process.exit(0)

log(`${solicitudes.length} pedido(s): ${solicitudes.map((s) => s.periodo).join(', ')}`)
const fallarTodas = async (error) => {
  for (const s of solicitudes) await hilvan({ accion: 'reportar', id: s.id, estado: 'fallida', error })
}

// ── Sesión: el login con Llavero primero revisa si la sesión sigue viva ──────
try {
  const r = await sii(bin, ['auth', 'login', '--keyring', '--rut', rut], log)
  log(`sesión: ${r.reason}`)
} catch (e) {
  if (e instanceof ErrorSii && e.codigo === 3) {
    // El SII rechazó la clave (o el login no terminó). No se vuelve a intentar.
    const motivo = e.message.slice(0, 400)
    await hilvan({ accion: 'bloquear', motivo })
    await fallarTodas(`El SII rechazó el login; el trabajador quedó bloqueado. ${motivo}`)
    log(`BLOQUEADO: ${motivo}`)
  } else {
    await fallarTodas(`No se pudo abrir sesión en el SII: ${e.message.slice(0, 400)}`)
    log(`sin sesión: ${e.message}`)
  }
  process.exit(1)
}

// ── Pedidos ────────────────────────────────────────────────────────────────
let fallas = 0
for (const s of solicitudes) {
  const periodo = periodoCli(s.periodo)
  try {
    const resultado = await importarPeriodo({ periodo, lados: s.lados, bin, base, token, log })
    const incompletos = Object.entries(resultado).filter(([, r]) => r.estado !== 'completo')
    if (incompletos.length) {
      fallas++
      const error = incompletos.map(([lado, r]) => `${lado}: ${(r.errores ?? []).join('; ')}`).join(' | ')
      await hilvan({ accion: 'reportar', id: s.id, estado: 'fallida', resultado, error: `Importación incompleta. ${error}` })
      log(`${periodo}: INCOMPLETA ${error}`)
    } else {
      await hilvan({ accion: 'reportar', id: s.id, estado: 'hecha', resultado })
      log(`${periodo}: hecha ${Object.entries(resultado).map(([l, r]) => `${l} ${r.documentos}`).join(', ')}`)
    }
  } catch (e) {
    fallas++
    await hilvan({ accion: 'reportar', id: s.id, estado: 'fallida', error: e.message.slice(0, 1500) })
    log(`${periodo}: FALLÓ ${e.message}`)
  }
}
process.exit(fallas ? 1 : 0)
