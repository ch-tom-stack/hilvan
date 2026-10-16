// Importa un período del SII a Hilván a mano, desde el Mac.
//
// Lo normal es que lo haga solo el trabajador del Mac (scripts/sii/trabajador.mjs,
// a pedido del operador o del cron de los lunes). Esto queda para importar a mano.
//
// Uso:  npm run sii:importar -- 2026-09            (compras, ventas y honorarios)
//       npm run sii:importar -- 2026-09 --solo bhe   (compras | ventas | bhe, separados por coma)
//       npm run sii:importar -- 2026-09 --dry        (lee el SII y muestra el resumen, no envía)
//
// Usa la sesión guardada en ~/.sii (la de Casa Hiedra). Si no hay sesión: `sii auth
// login` UNA vez. Ante cualquier error del SII se detiene sin enviar nada.
//
// Env (de .env.local vía el script de npm):
//   HILVAN_AGENT_TOKEN  obligatorio
//   HILVAN_URL          default https://app.casahiedra.com (http://localhost:3000 para probar)
//   SII_CLI             ruta al binario `sii`; default ~/sii-ensayo/node_modules/.bin/sii o `sii` del PATH
import { ErrorSii, LADOS, binSii, importarPeriodo, leerPeriodo, periodoCli } from './sii/importar.mjs'

function salir(msg, code = 1) {
  console.error(msg)
  process.exit(code)
}

const args = process.argv.slice(2)
const periodo = periodoCli(args.find((a) => !a.startsWith('--')))
if (!periodo) salir('Uso: npm run sii:importar -- AAAA-MM [--solo compras,ventas,bhe] [--dry]')
const dry = args.includes('--dry')
const iSolo = args.indexOf('--solo')
const lados = iSolo >= 0 ? (args[iSolo + 1] ?? '').split(',').map((s) => s.trim()) : LADOS
if (!lados.length || lados.some((l) => !LADOS.includes(l))) salir('--solo acepta compras, ventas y/o bhe separados por coma')

const token = process.env.HILVAN_AGENT_TOKEN
if (!dry && !token) salir('Falta HILVAN_AGENT_TOKEN (en .env.local)')
const base = (process.env.HILVAN_URL || 'https://app.casahiedra.com').replace(/\/$/, '')
const bin = binSii()
const log = (l) => console.log(l)

console.log(`SII → Hilván · ${periodo} · ${lados.join(', ')}${dry ? ' · DRY (no envía)' : ` · ${base}`}`)
try {
  if (dry) {
    const c = await leerPeriodo(bin, periodo, lados, log)
    if (c.compras) console.log(`compras: ${c.compras.detalle.docs.length} documentos (rechazados: ${c.compras.detalle.rejectedTypes.join(', ') || 'ninguno'})`)
    if (c.ventas) console.log(`ventas: ${c.ventas.detalle.docs.length} documentos (rechazados: ${c.ventas.detalle.rejectedTypes.join(', ') || 'ninguno'})`)
    if (c.bhe) console.log(`bhe: ${c.bhe.boletas.length} de ${c.bhe.totalBoletas ?? '?'} boletas`)
    process.exit(0)
  }
  const resultado = await importarPeriodo({ periodo, lados, bin, base, token, log })
  let incompleto = false
  for (const [lado, r] of Object.entries(resultado)) {
    console.log(`${r.estado === 'completo' ? '✓' : '✗'} ${lado}: ${r.estado} · ${r.documentos} documentos`)
    for (const err of r.errores ?? []) console.log(`    - ${err}`)
    if (r.estado !== 'completo') incompleto = true
  }
  if (incompleto) salir('\nAlgún lado quedó INCOMPLETO: el agente lo verá como error hasta que se reimporte completo.')
  console.log('\nListo. El agente ya puede usar hilvan_sii_sync / hilvan_sii_sync_ventas para este período.')
} catch (e) {
  const sesion = e instanceof ErrorSii && e.codigo === 2
    ? '\nNo hay sesión válida del SII. Corre `sii auth login` UNA vez (si el SII rechaza la clave, NO reintentes).'
    : ''
  salir(`\n${e.message}${sesion}\nNo se envió nada a Hilván.`)
}
