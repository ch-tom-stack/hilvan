// Smoke test del MCP remoto — el único que existe, y el que usa Cowork.
//
// Uso: HILVAN_AGENT_TOKEN=... npm run smoke:mcp
//      HILVAN_MCP_URL=http://localhost:3000/api/mcp ... para probar local.
//
// Compara las tools que sirve el endpoint contra las registradas en el código:
// si alguien agrega una y no despliega, o el deploy queda a medias, acá se ve.
//
// (El SDK de cliente llega como dependencia transitiva de mcp-handler; si algún
// día deja de resolver, agregarlo a devDependencies.)
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { readFileSync } from 'node:fs'

const url = new URL(process.env.HILVAN_MCP_URL || 'https://app.casahiedra.com/api/mcp')
const token = process.env.HILVAN_AGENT_TOKEN || ''
if (!token) {
  console.error('Falta HILVAN_AGENT_TOKEN')
  process.exit(1)
}

const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
})
const client = new Client({ name: 'smoke-remote', version: '0.0.0' }, { capabilities: {} })
await client.connect(transport)

const { tools } = await client.listTools()
const servidas = new Set(tools.map((t) => t.name))

// Lo que el código dice que debería haber.
const fuente = readFileSync(new URL('../app/api/[transport]/route.ts', import.meta.url), 'utf8')
const declaradas = new Set([...fuente.matchAll(/registerTool\(\s*'(hilvan_[a-z_]+)'/g)].map((m) => m[1]))

const faltan = [...declaradas].filter((t) => !servidas.has(t))
const sobran = [...servidas].filter((t) => !declaradas.has(t))

console.log(`sirve ${servidas.size} tools · el código declara ${declaradas.size}`)
if (faltan.length) console.log('FALTAN en el endpoint (¿deploy pendiente?):', faltan.join(', '))
if (sobran.length) console.log('sirve tools que el código no declara:', sobran.join(', '))
if (!faltan.length && !sobran.length) console.log('✓ endpoint y código coinciden')

const res = await client.callTool({ name: 'hilvan_por_cobrar', arguments: {} })
console.log('por_cobrar (primeros 220):', (res.content?.[0]?.text ?? '').slice(0, 220))

await client.close()
process.exit(faltan.length ? 1 : 0)
