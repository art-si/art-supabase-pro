import path from 'node:path'
import { loadEnv } from 'vite'
import { ensureSqlGateway } from './sql-gateway-process'

const root = path.resolve(import.meta.dirname, '..')
const env = { ...loadEnv('development', root, ''), ...process.env }
try {
  const result = await ensureSqlGateway({ root, port: Number(env.SQL_GATEWAY_PORT || 4319), env })
  console.info(
    `SQL 执行端${result.reused ? '已在运行' : '已在后台启动'}：http://127.0.0.1:${result.port}`
  )
  console.info('可以关闭当前终端。回到 SQL 控制台的“连接管理”即可继续。')
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : 'SQL 执行端启动失败，请查看服务日志')
  process.exitCode = 1
}
