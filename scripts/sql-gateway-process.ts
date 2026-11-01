import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { networkInterfaces } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'

export interface SqlGatewayStartOptions {
  root: string
  port?: number
  origins?: string[]
  env?: NodeJS.ProcessEnv
}

export function sqlGatewaySourceIdentity(root: string): {
  sourceFingerprint: string
  rootFingerprint: string
} {
  const scripts = readdirSync(path.join(root, 'scripts'))
    .filter((name) => /^sql-gateway.*\.ts$/.test(name))
    .map((name) => `scripts/${name}`)
  const files = [
    ...scripts,
    'scripts/lib/platform-identity.ts',
    'src/types/sql-connections.ts',
    'src/utils/record.ts',
    'src/utils/sql-connections.ts',
    'src/utils/sql-workbench.ts'
  ].sort()
  const hash = createHash('sha256')
  for (const file of files)
    hash
      .update(file)
      .update('\0')
      .update(readFileSync(path.join(root, file)))
  return {
    sourceFingerprint: hash.digest('hex'),
    rootFingerprint: createHash('sha256').update(path.resolve(root)).digest('hex')
  }
}

interface SqlGatewayStatus {
  pid?: number
  sourceFingerprint?: string
  rootFingerprint?: string
  activeRequests?: number
}

/** Exact local application origins, including the LAN URL printed by Vite; never a wildcard. */
export function sqlGatewayApplicationOrigins(port: number, extra: string[] = []): string[] {
  const hosts = [
    '127.0.0.1',
    'localhost',
    ...Object.values(networkInterfaces()).flatMap((addresses) =>
      (addresses || [])
        .filter((address) => !address.internal && !address.address.includes('%'))
        .map((address) => (address.family === 'IPv6' ? `[${address.address}]` : address.address))
    )
  ]
  return [...hosts.map((host) => `http://${host}:${port}`), 'https://art-si.github.io', ...extra]
}

async function readSqlGatewayStatus(port: number): Promise<SqlGatewayStatus | undefined> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Origin: 'http://127.0.0.1:3006' },
      signal: AbortSignal.timeout(5000)
    })
    const value: unknown = await response.json()
    if (
      response.ok &&
      value &&
      typeof value === 'object' &&
      'service' in value &&
      value.service === 'art-sql-gateway' &&
      'projectRef' in value &&
      value.projectRef === 'ckbftoopuyophiebamwy'
    )
      return {
        pid: 'pid' in value && typeof value.pid === 'number' ? value.pid : undefined,
        sourceFingerprint:
          'sourceFingerprint' in value && typeof value.sourceFingerprint === 'string'
            ? value.sourceFingerprint
            : undefined,
        rootFingerprint:
          'rootFingerprint' in value && typeof value.rootFingerprint === 'string'
            ? value.rootFingerprint
            : undefined,
        activeRequests:
          'activeRequests' in value && typeof value.activeRequests === 'number'
            ? value.activeRequests
            : undefined
      }
    return undefined
  } catch {
    return undefined
  }
}

export async function inspectSqlGateway(port: number, expectedPid?: number): Promise<boolean> {
  const status = await readSqlGatewayStatus(port)
  return Boolean(status && (expectedPid === undefined || status.pid === expectedPid))
}

/** Launch once, detached from terminals and agent sessions. The gateway keeps its own authenticated boundary. */
export async function ensureSqlGateway(
  options: SqlGatewayStartOptions
): Promise<{ port: number; reused: boolean }> {
  const port = options.port ?? 4319
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('SQL 执行端端口无效')
  const identity = sqlGatewaySourceIdentity(options.root)
  const reuse = async () => {
    const status = await readSqlGatewayStatus(port)
    if (!status) return false
    if (
      status.sourceFingerprint !== identity.sourceFingerprint ||
      status.rootFingerprint !== identity.rootFingerprint
    ) {
      const pending = status.activeRequests
        ? '当前仍有查询或连接操作运行，请等待结束后'
        : '请在查询结束后'
      throw new Error(
        `SQL 执行端代码或工作目录已变化，${pending}重启本机 SQL 执行端${status.pid ? `（PID ${status.pid}）` : ''}，再运行 pnpm sql:gateway`
      )
    }
    return true
  }
  if (await reuse()) return { port, reused: true }
  const stateRoot = path.resolve(options.root, '.artifacts/sql-gateway')
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 })
  const lockFile = path.join(stateRoot, `start-${port}.lock`)
  let lock: number | undefined
  try {
    lock = openSync(lockFile, 'wx', 0o600)
  } catch (cause) {
    if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'EEXIST')
      throw cause
    const owner = Number(readFileSync(lockFile, 'utf8'))
    let alive = !owner && Date.now() - statSync(lockFile).mtimeMs < 30000
    if (Number.isSafeInteger(owner) && owner > 0) {
      try {
        process.kill(owner, 0)
        alive = true
      } catch {
        /* Expired starter lock, never a gateway process. */
      }
    }
    if (!alive) {
      unlinkSync(lockFile)
      lock = openSync(lockFile, 'wx', 0o600)
    }
  }
  if (lock === undefined) {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      if (await reuse()) return { port, reused: true }
      await delay(250)
    }
    throw new Error('SQL 执行端仍未就绪，请查看 .artifacts/sql-gateway/server.log 后重试')
  }
  writeFileSync(lock, String(process.pid))
  const log = openSync(path.join(stateRoot, 'server.log'), 'a', 0o600)
  try {
    const env = {
      ...process.env,
      ...options.env,
      SQL_GATEWAY_PORT: String(port),
      SQL_GATEWAY_ALLOWED_ORIGINS: [
        ...(
          options.env?.SQL_GATEWAY_ALLOWED_ORIGINS ||
          process.env.SQL_GATEWAY_ALLOWED_ORIGINS ||
          ''
        ).split(','),
        ...(options.origins || [])
      ]
        .filter(Boolean)
        .join(',')
    }
    const child = spawn(
      process.execPath,
      [
        '--openssl-legacy-provider',
        '--import',
        'tsx',
        path.join(options.root, 'scripts/sql-gateway.ts')
      ],
      {
        cwd: options.root,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', log, log],
        env
      }
    )
    let startupError = false
    child.once('error', () => {
      startupError = true
    })
    child.unref()
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      if (startupError || child.exitCode !== null) break
      if (child.pid && (await inspectSqlGateway(port, child.pid))) {
        writeFileSync(
          path.join(stateRoot, `runtime-${port}.json`),
          JSON.stringify({ pid: child.pid, port, startedAt: new Date().toISOString() }),
          { mode: 0o600 }
        )
        return { port, reused: false }
      }
      await delay(250)
    }
    throw new Error(`SQL 执行端启动失败，请检查端口 ${port} 和 .artifacts/sql-gateway/server.log`)
  } finally {
    closeSync(log)
    closeSync(lock)
    // Only this starter's lock is removed; the detached service and encrypted configuration are retained.
    if (existsSync(lockFile) && readFileSync(lockFile, 'utf8') === String(process.pid))
      unlinkSync(lockFile)
  }
}
