import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { promises as dns } from 'node:dns'
import net, { type Socket } from 'node:net'
import * as tls from 'node:tls'
import { isObjectRecord } from '../../src/utils/record'
import { withTimeout } from '../../src/utils/async'
import {
  assertSourceConnection,
  type BackupSourceSql,
  type SourceConnection
} from './backup-update-source'

// Public Supabase Root 2021 CA from the official dashboard download (2026-11-01):
// https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
// DER SHA-256: 807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa
const supabaseRootCa = readFileSync(new URL('./supabase-prod-ca-2021.crt', import.meta.url), 'utf8')

export function backupSourceTlsOptions(): tls.ConnectionOptions {
  // Explicit `ca` replaces Node's default trust, so retain system/extra CAs too.
  // Node 22.13/22.14 lack getCACertificates; their defaults are the bundled roots
  // plus NODE_EXTRA_CA_CERTS (system CA support arrived with getCACertificates).
  const defaultCa =
    typeof tls.getCACertificates === 'function'
      ? tls.getCACertificates('default')
      : [
          ...tls.rootCertificates,
          ...(process.env.NODE_EXTRA_CA_CERTS
            ? [readFileSync(process.env.NODE_EXTRA_CA_CERTS, 'utf8')]
            : [])
        ]
  return { rejectUnauthorized: true, ca: [...defaultCa, supabaseRootCa] }
}

const transientConnectionCodes = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'CONNECT_TIMEOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'CONNECTION_CLOSED',
  'BACKUP_SOURCE_CONNECT_TIMEOUT'
]

interface SourceSession {
  sockets: Set<Socket>
  failure?: Error
  shutdown?: Promise<void>
}
const sourceSessions = new WeakMap<ReturnType<typeof postgres>, SourceSession>()

function sourceSession(client: ReturnType<typeof postgres>): SourceSession {
  let session = sourceSessions.get(client)
  if (!session) {
    session = { sockets: new Set() }
    sourceSessions.set(client, session)
  }
  return session
}

export function backupSourceFailure(client: ReturnType<typeof postgres>): Error | undefined {
  return sourceSessions.get(client)?.failure
}

export function assertBackupSourceActive(client: ReturnType<typeof postgres>): void {
  const failure = backupSourceFailure(client)
  if (failure) throw failure
}

/** Fence late transaction callbacks before closing the underlying TLS transport. */
export async function abortBackupSource(
  client: ReturnType<typeof postgres>,
  cause: unknown
): Promise<void> {
  const session = sourceSession(client)
  session.failure ||=
    cause instanceof Error
      ? cause
      : Object.assign(new Error('来源数据库连接已停止，原完整备份保留。', { cause }), {
          code: backupUpdateErrorCode(cause)
        })
  if (session.shutdown) return session.shutdown
  // postgres.end's timeout rejects pending work, but uses socket.end(). Destroy
  // our raw transports as well so a silent peer cannot keep TLS sessions alive.
  session.shutdown = (async () => {
    await Promise.all(
      [...session.sockets].map((socket) => {
        if (socket.closed) return
        return new Promise<void>((resolve) => {
          socket.once('close', resolve)
          socket.destroy()
        })
      })
    )
    // The driver's TLS socket wraps our raw transport. Let its close handler
    // detach the session before end() can attempt a PostgreSQL Terminate write.
    await new Promise<void>((resolve) => setImmediate(resolve))
    await client.end({ timeout: 0 }).catch(() => {})
  })()
  return session.shutdown
}

export async function withBackupSourceDeadline<T>(
  client: ReturnType<typeof postgres>,
  operation: PromiseLike<T>,
  timeoutMs = 150_000,
  code = 'BACKUP_SOURCE_READ_TIMEOUT'
): Promise<T> {
  const timeout = Object.assign(new Error('来源数据库响应超时，原完整备份保留。'), { code })
  // Observe the operation even when an earlier deadline has fenced this client.
  // A late rejection must not escape after its owning update has already failed.
  const pending = Promise.resolve(operation)
  try {
    assertBackupSourceActive(client)
    return await withTimeout(pending, timeoutMs, timeout)
  } catch (cause) {
    if (cause === timeout) await abortBackupSource(client, timeout)
    void pending.catch(() => {})
    throw backupSourceFailure(client) || cause
  }
}

export function timedBackupSource(
  client: ReturnType<typeof postgres>,
  sql: BackupSourceSql
): BackupSourceSql {
  return {
    unsafe(...args: Parameters<BackupSourceSql['unsafe']>) {
      assertBackupSourceActive(client)
      return withBackupSourceDeadline(client, sql.unsafe(...args))
    }
  }
}

/** Keep the exported snapshot alive while external exports use its transaction. */
export async function withBackupSourceHeartbeat<T>(
  client: ReturnType<typeof postgres>,
  sql: BackupSourceSql,
  callback: () => Promise<T>,
  intervalMs = 30_000
): Promise<T> {
  assertBackupSourceActive(client)
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let heartbeat: Promise<void> | undefined
  const schedule = () => {
    if (stopped || backupSourceFailure(client)) return
    timer = setTimeout(() => {
      timer = undefined
      heartbeat = ping()
    }, intervalMs)
  }
  const ping = async () => {
    try {
      assertBackupSourceActive(client)
      await withBackupSourceDeadline(client, sql.unsafe('select 1'))
    } catch (cause) {
      await abortBackupSource(client, cause)
    } finally {
      schedule()
    }
  }
  schedule()
  let result: T
  try {
    result = await callback()
  } catch (cause) {
    // Fence before waiting for a concurrent heartbeat: its teardown must not
    // replace the callback's original failure with a closed-connection error.
    await abortBackupSource(client, cause)
    throw backupSourceFailure(client) || cause
  } finally {
    stopped = true
    if (timer) clearTimeout(timer)
    await heartbeat
  }
  assertBackupSourceActive(client)
  return result
}

export async function connectBackupSource(
  connection: SourceConnection,
  password: string,
  onRetry?: (attempt: number, total: number, code: string) => void,
  createClient: (
    options: postgres.Options<Record<string, never>>
  ) => ReturnType<typeof postgres> = postgres,
  deadlineMs = 30_000
): Promise<ReturnType<typeof postgres>> {
  assertSourceConnection(connection)
  const attempts = 3
  let addresses: string[] = []
  let addressIndex = 0
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let client: ReturnType<typeof postgres> | undefined
    const started = Date.now()
    const timeout = Object.assign(new Error('来源数据库连接超时，原完整备份保留。'), {
      code: 'BACKUP_SOURCE_CONNECT_TIMEOUT'
    })
    try {
      if (!addresses.length)
        addresses = (
          await withTimeout(dns.lookup(connection.Host, { all: true }), deadlineMs, timeout)
        ).map((entry) => entry.address)
      const address = addresses[addressIndex++ % addresses.length]
      const session: SourceSession = { sockets: new Set() }
      const options = {
        // Try another resolved pooler node after a transport failure. Keep the
        // configured DNS name for SNI and Node's standard hostname verification.
        host: address,
        port: connection.Port,
        username: connection.User,
        database: connection.Database,
        password,
        ssl: { ...backupSourceTlsOptions(), servername: connection.Host },
        connection: { application_name: 'art_backup_update', statement_timeout: 120_000 },
        max: 2,
        prepare: false,
        // All backup arrays cross the SQL boundary as JSON. Avoid the driver's
        // unbounded internal array-type discovery query after authentication.
        fetch_types: false,
        connect_timeout: 30,
        idle_timeout: 30,
        onnotice: () => {},
        onclose: () => {
          for (const socket of session.sockets) if (socket.destroyed) session.sockets.delete(socket)
        },
        // Postgres.js accepts connected duplex streams. Owning this raw socket
        // lets deadlines tear down TLS instead of only abandoning a Promise.
        socket: () =>
          new Promise<Socket>((resolve, reject) => {
            const failure = session.failure
            if (failure) return reject(failure)
            const socket = net.connect({ host: address, port: connection.Port })
            session.sockets.add(socket)
            socket.once('error', reject)
            socket.once('close', () => {
              session.sockets.delete(socket)
              reject(
                session.failure ||
                  Object.assign(new Error('来源数据库连接中断。'), { code: 'CONNECTION_CLOSED' })
              )
            })
            socket.once('connect', () => resolve(socket))
          })
      }
      client = createClient(options)
      sourceSessions.set(client, session)
      // postgres() is lazy. Authenticate before returning so only connection
      // setup is retried; never replay a snapshot transaction or its work.
      await withBackupSourceDeadline(
        client,
        client.unsafe('select 1'),
        Math.max(1, deadlineMs - (Date.now() - started)),
        'BACKUP_SOURCE_CONNECT_TIMEOUT'
      )
      return client
    } catch (cause) {
      if (client) await abortBackupSource(client, cause)
      const code = backupUpdateErrorCode(cause)
      if (attempt === attempts || !transientConnectionCodes.includes(code)) throw cause
      onRetry?.(attempt + 1, attempts, code)
    }
  }
  throw new Error('来源数据库连接未建立，请重试；原完整备份保留。')
}

export function backupUpdateErrorMessage(cause: unknown): string {
  const code = isObjectRecord(cause) && typeof cause.code === 'string' ? cause.code : ''
  if (code === 'BACKUP_COPY_FORMAT')
    return '本地备份数据格式无法用于增量更新，请校验备份并查看更新报告；原完整备份保留。'
  if (['57014', 'BACKUP_SOURCE_READ_TIMEOUT'].includes(code))
    return '来源数据库读取超时，请稍后重试；若持续失败，请根据更新报告中的阶段和错误编号排查；原完整备份保留。'
  if (code === '25P04')
    return '来源数据库事务达到时间上限，备份更新已停止；请检查更新报告中的阶段与事务超时设置后重试；原完整备份保留。'
  if (code === '25P03')
    return '来源数据库事务因等待导出而空闲超时；请检查执行端保活与导出状态后重试；原完整备份保留。'
  if (['28P01', '28000', 'SASL_SIGNATURE_MISMATCH'].includes(code))
    return '来源数据库身份验证未通过，请重新填写来源数据库密码后重试；原完整备份保留。'
  if (
    [
      'SELF_SIGNED_CERT_IN_CHAIN',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'CERT_HAS_EXPIRED',
      'ERR_TLS_CERT_ALTNAME_INVALID'
    ].includes(code)
  )
    return '来源数据库安全证书校验未通过，请检查本机时间、可信证书和网络代理后重试；原完整备份保留。'
  if (code === 'CONNECTION_CLOSED')
    return '来源数据库连接在读取期间中断，请检查网络后重新更新；原完整备份保留。'
  if (transientConnectionCodes.includes(code))
    return '无法连接来源数据库，请检查网络、DNS 和 5432 端口后重试；原完整备份保留。'
  if (
    cause instanceof Error &&
    cause.name === 'Error' &&
    !('code' in cause) &&
    /[\u4e00-\u9fff]/.test(cause.message) &&
    !/password|postgres:\/\/|postgresql:\/\//i.test(cause.message)
  )
    return cause.message
  return '来源数据库读取失败，请检查执行端连接和更新报告后重试；原完整备份保留。'
}

/** Keep only a stable diagnostic identifier, never SDK messages, SQL, or credentials. */
export function backupUpdateErrorCode(cause: unknown): string {
  return isObjectRecord(cause) &&
    typeof cause.code === 'string' &&
    /^[A-Z0-9_]{2,64}$/.test(cause.code)
    ? cause.code
    : 'BACKUP_UPDATE_FAILED'
}
