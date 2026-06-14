// Smoke test: levanta el server MCP por stdio, lista tools y llama una real.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.mjs'],
  env: { ...process.env },
})
const client = new Client({ name: 'smoke', version: '0.0.0' }, { capabilities: {} })
await client.connect(transport)

const { tools } = await client.listTools()
console.log('TOOLS:', tools.map((t) => t.name).join(', '))

const res = await client.callTool({ name: 'hilvan_por_cobrar', arguments: {} })
const txt = res.content?.[0]?.text ?? ''
console.log('por_cobrar (primeros 200):', txt.slice(0, 200))

await client.close()
process.exit(0)
