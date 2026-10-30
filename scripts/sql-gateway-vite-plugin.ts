import type { Plugin } from 'vite'
import { ensureSqlGateway } from './sql-gateway-process.ts'

/** The platform dev server owns startup; a browser never receives an unauthenticated process-launch endpoint. */
export function createSqlGatewayPlugin(root: string, env: Record<string, string>): Plugin {
  return {
    name: 'art-sql-gateway-startup',
    apply: 'serve',
    configureServer(server) {
      const start = () => {
        const addresses = [
          ...(server.resolvedUrls?.local || []),
          ...(server.resolvedUrls?.network || [])
        ].map((url) => new URL(url).origin)
        void ensureSqlGateway({
          root,
          port: Number(env.SQL_GATEWAY_PORT || 4319),
          origins: addresses,
          env
        })
          .then((result) => {
            server.config.logger.info(`[SQL] 执行端已就绪：http://127.0.0.1:${result.port}`)
          })
          .catch((cause) => {
            server.config.logger.warn(
              `[SQL] ${cause instanceof Error ? cause.message : '执行端启动失败，请运行 pnpm sql:gateway 重试'}`
            )
          })
      }
      if (server.httpServer?.listening) start()
      else
        server.httpServer?.once('listening', () => {
          setImmediate(start).unref()
        })
    }
  }
}
