// Smoke test del MCP REMOTO (Streamable HTTP), como lo haría el conector de Cowork.
// Uso: HILVAN_MCP_URL=... HILVAN_AGENT_TOKEN=... node test-remote.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = new URL(process.env.HILVAN_MCP_URL || 'https://app.casahiedra.com/api/mcp')
const token = process.env.HILVAN_AGENT_TOKEN || ''

const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
})
const client = new Client({ name: 'smoke-remote', version: '0.0.0' }, { capabilities: {} })
await client.connect(transport)

const { tools } = await client.listTools()
console.log('TOOLS:', tools.map((t) => t.name).join(', '))

const res = await client.callTool({ name: 'hilvan_por_cobrar', arguments: {} })
console.log('por_cobrar (primeros 220):', (res.content?.[0]?.text ?? '').slice(0, 220))

await client.close()
process.exit(0)
