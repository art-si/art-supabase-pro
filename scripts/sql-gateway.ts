import path from 'node:path'
import { homedir } from 'node:os'
import { loadEnv } from 'vite'
import { createSqlGateway } from './sql-gateway-server'
import { callPlatformIdentity } from './lib/platform-identity'
import { sqlGatewayApplicationOrigins } from './sql-gateway-process'

const root = path.resolve(import.meta.dirname, '..')
const env = { ...loadEnv('development', root, ''), ...process.env }
const base = 'https://ckbftoopuyophiebamwy.supabase.co'
if (env.VITE_SUPABASE_URL?.replace(/\/$/, '') !== base || !env.VITE_SUPABASE_KEY)
  throw new Error('请在当前项目配置 VITE_SUPABASE_URL 和公开 API Key 后再启动 SQL 执行端')
const port = Number(env.SQL_GATEWAY_PORT || 4319)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('SQL 执行端端口无效')
const server = createSqlGateway({
  directory:
    env.SQL_GATEWAY_STATE_DIR || path.join(homedir(), '.art-sql-workbench', 'ckbftoopuyophiebamwy'),
  origins: sqlGatewayApplicationOrigins(Number(env.VITE_PORT || 3006), [
    'http://127.0.0.1:3006',
    'http://localhost:3006',
    ...(env.SQL_GATEWAY_ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  ]),
  identity: (token, route, body) =>
    callPlatformIdentity(base, env.VITE_SUPABASE_KEY!, token, route, body, env)
})
server.requestTimeout = 45000
server.headersTimeout = 15000
server.on('error', () => {
  console.error('SQL 执行端启动失败，请检查端口是否已被占用')
  process.exitCode = 1
})
server.listen(port, env.SQL_GATEWAY_HOST || '127.0.0.1', () =>
  console.info(
    `SQL 执行端已启动：http://127.0.0.1:${port}。在 SQL 控制台的“连接管理”中配置数据库。`
  )
)
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    server.close()
    server.closeAllConnections()
  })
