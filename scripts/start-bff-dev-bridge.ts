/** Local-only adapter for the exact handler used by the deployed Edge Function. */
import { createServer } from 'node:http'
import { loadEnv } from 'vite'
import { createClient } from '@supabase/supabase-js'
import { createBffGatewayHandler } from '../supabase/functions/_shared/bff-gateway-handler'
import { resolveBffProUser } from '../supabase/functions/_shared/bff-pro-user'

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
const port = Number(env.BFF_DEV_BRIDGE_PORT || 3037)
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid local bridge port')
const handler = createBffGatewayHandler({
  bffUrl: env.BFF_SERVICE_URL ?? '',
  bridgeSecret: env.BFF_PRO_BRIDGE_SECRET ?? '',
  allowedOrigins: (env.BFF_PRO_ALLOWED_ORIGINS ?? 'http://localhost:3036')
    .split(',')
    .map((v) => v.trim()),
  allowLocalHttp: true,
  resolveUser: (authorization) =>
    resolveBffProUser(
      createClient(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_KEY ?? '', {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false }
      }),
      authorization
    )
})
const server = createServer(async (incoming, outgoing) => {
  try {
    let size = 0
    const chunks: Buffer[] = []
    for await (const chunk of incoming) {
      size += chunk.length
      if (size > 32768) {
        outgoing.writeHead(413, { 'Content-Type': 'application/json' })
        outgoing.end(JSON.stringify({ code: 'PAYLOAD_TOO_LARGE', msg: '请求内容过大' }))
        return
      }
      chunks.push(chunk)
    }
    const headers = new Headers()
    for (const [key, value] of Object.entries(incoming.headers))
      if (typeof value === 'string') headers.set(key, value)
    const method = incoming.method ?? 'GET'
    const response = await handler(
      new Request(`http://localhost:${port}/`, {
        method,
        headers,
        ...(method === 'POST' ? { body: Buffer.concat(chunks) } : {})
      })
    )
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch {
    outgoing.writeHead(503, { 'Content-Type': 'application/json' })
    outgoing.end(JSON.stringify({ code: 'BRIDGE_UNAVAILABLE', msg: '本地接入服务暂时不可用' }))
  }
})
server.listen(port, '127.0.0.1', () =>
  console.log(`Pro local BFF bridge: http://127.0.0.1:${port}`)
)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close())
