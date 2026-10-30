import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { callPlatformIdentity } from './lib/platform-identity'
import path from 'node:path'
import { loadEnv } from 'vite'
import {
  findSupabaseOperation,
  OPERATIONS_PROJECT_REF
} from '../src/utils/supabase/operations-catalog'
import { OperationsRunner, authorizeOperationsIdentity } from './supabase-operations-runtime'
import { cancelDetachedExports, inspectDetachedExports } from './supabase-operations-inspection'
import { operationNeedsInspectionAfterCancel } from '../src/utils/supabase/operations-catalog'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'

const root = path.resolve(import.meta.dirname, '..')
const env = { ...loadEnv('development', root, ''), ...process.env }
const base = `https://${OPERATIONS_PROJECT_REF}.supabase.co`
const apiKey = env.VITE_SUPABASE_KEY
if (!apiKey || env.VITE_SUPABASE_URL?.replace(/\/$/, '') !== base)
  throw new Error('运维执行端必须配置当前项目的 VITE_SUPABASE_URL 和公开 API Key。')
if (!existsSync(path.join(root, 'supabase/operations-task.ps1')))
  throw new Error('找不到仓库内的运维脚本。')
const port = Number(env.SUPABASE_OPS_PORT || 4318)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('执行端端口配置无效。')
const origins = new Set([
  'http://127.0.0.1:3006',
  'http://localhost:3006',
  'https://art-si.github.io',
  ...(env.SUPABASE_OPS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
])
const stateRoot = path.join(root, '.artifacts/supabase-operations')
mkdirSync(stateRoot, { recursive: true, mode: 0o700 })
const lockPath = path.join(stateRoot, 'executor.lock')
const connectionPath = path.join(stateRoot, 'connection.json')
function printConnection(connectionPort: number): void {
  console.info(`Supabase 运维执行端：http://127.0.0.1:${connectionPort}`)
  console.info(`项目：${OPERATIONS_PROJECT_REF}`)
  console.info(
    '保持此窗口开启，回到页面输入数据库密码即可执行备份。无需配对码，也不必先做环境检查。'
  )
}
if (existsSync(lockPath)) {
  const pid = Number(readFileSync(lockPath, 'utf8'))
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw new Error('执行端锁文件无效，请检查本机执行端是否仍在运行。')
  let alive = true
  try {
    process.kill(pid, 0)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH')
      alive = false
  }
  if (alive) {
    console.info('运维执行端已在运行，复用现有连接，不会中断正在运行的任务。')
    try {
      const previous: unknown = JSON.parse(readFileSync(connectionPath, 'utf8'))
      if (
        previous &&
        typeof previous === 'object' &&
        'pid' in previous &&
        previous.pid === pid &&
        'port' in previous &&
        typeof previous.port === 'number' &&
        Number.isInteger(previous.port) &&
        previous.port >= 1024 &&
        previous.port <= 65535 &&
        'version' in previous &&
        previous.version === 2
      )
        printConnection(previous.port)
      else
        console.info(
          '当前为旧版执行端，请在原窗口按 Ctrl+C 结束，再重新运行 pnpm supabase:ops；新版不需要配对码。'
        )
    } catch {
      console.info('请在原窗口按 Ctrl+C 结束旧版执行端，再重新运行 pnpm supabase:ops。')
    }
    process.exit(0)
  }
  unlinkSync(lockPath)
}
writeFileSync(lockPath, String(process.pid), { flag: 'wx', mode: 0o600 })
process.on('exit', () => {
  try {
    if (existsSync(connectionPath)) unlinkSync(connectionPath)
    unlinkSync(lockPath)
  } catch {
    console.error('执行端锁文件未能清理，下次启动时将检查进程状态。')
  }
})
const runner = new OperationsRunner(root)
let stoppingDetachedExports = false
async function externalActivity() {
  if (
    runner.busy ||
    !runner.runs.some(
      (run) =>
        run.status === 'interrupted' &&
        ['backup', 'resumeBackup', 'updateBackup'].includes(run.operationId)
    )
  )
    return undefined
  return inspectDetachedExports()
}
const readAuthorizations = new Map<string, { actorId: string; expiresAt: number }>()

function callIdentityApi(route: string, token: string, body?: object): Promise<unknown> {
  return callPlatformIdentity(base, apiKey!, token, route, body, env)
}

async function authorize(
  request: IncomingMessage,
  permission: string,
  cacheRead = false
): Promise<string> {
  const token = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1]
  if (!token) throw new Error('请先登录平台账号。')
  const fingerprint = createHash('sha256').update(token).digest('hex')
  const cacheKey = `${fingerprint}:${permission}`
  const cached = readAuthorizations.get(cacheKey)
  if (cacheRead && cached && cached.expiresAt > Date.now()) return cached.actorId
  const actorId = await authorizeOperationsIdentity(
    (route, body) => callIdentityApi(route, token, body),
    permission
  )
  for (const [key, value] of readAuthorizations)
    if (value.expiresAt < Date.now()) readAuthorizations.delete(key)
  if (cacheRead) readAuthorizations.set(cacheKey, { actorId, expiresAt: Date.now() + 30_000 })
  return actorId
}

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  })
  response.end(JSON.stringify(value))
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  let body = ''
  for await (const chunk of request) {
    body += String(chunk)
    if (body.length > 24_000) throw new Error('请求内容过大，请减少参数长度。')
  }
  try {
    return JSON.parse(body)
  } catch {
    throw new Error('请求参数格式无效。')
  }
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin
  if (!origin || !origins.has(origin)) {
    send(response, 403, { message: '此页面来源未获执行端授权，请检查允许访问的站点配置。' })
    return
  }
  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  response.setHeader('Access-Control-Allow-Private-Network', 'true')
  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }
  if (!request.headers.authorization?.startsWith('Bearer ')) {
    send(response, 401, { message: '请先登录平台管理员账号，再连接本机执行端。' })
    return
  }
  try {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
    const pathname = requestUrl.pathname
    if (request.method === 'GET' && pathname === '/runs') {
      await authorize(request, 'SupabaseOperations:Read', true)
      const detached = await externalActivity()
      const selectedId = requestUrl.searchParams.get('selected') || runner.runs[0]?.id
      const selectedRun = runner.runs.find((run) => run.id === selectedId)
      let mayReadVerificationReport = false
      let mayReadUpdateReport = false
      if (
        selectedRun &&
        ['previewBackupUpdate', 'updateBackup'].includes(selectedRun.operationId)
      ) {
        try {
          await authorize(
            request,
            selectedRun.operationId === 'previewBackupUpdate'
              ? 'SupabaseOperations:PreviewUpdate'
              : 'SupabaseOperations:UpdateBackup',
            true
          )
          mayReadUpdateReport = true
        } catch {
          /* Read permission only returns the ordinary task summary. */
        }
      }
      if (selectedRun?.operationId === 'verify') {
        try {
          await authorize(request, 'SupabaseOperations:Verify', true)
          mayReadVerificationReport = true
        } catch {
          // The Read permission still grants the ordinary run summary.
        }
      }
      send(response, 200, {
        projectRef: OPERATIONS_PROJECT_REF,
        runs: runner.runs.slice(0, 50).map((run) => {
          if (run.id !== selectedId)
            return {
              ...run,
              logs: [],
              artifacts: undefined,
              verificationReport: undefined,
              updateReport: undefined
            }
          if (
            ['previewBackupUpdate', 'updateBackup'].includes(run.operationId) &&
            !mayReadUpdateReport
          )
            return { ...run, updateReport: undefined, artifacts: undefined, logs: [] }
          if (run.operationId === 'verify' && !mayReadVerificationReport)
            return {
              ...run,
              verificationReport: undefined,
              artifacts: run.artifacts?.filter((artifact) => artifact.label !== '备份校验报告'),
              logs: run.logs.filter((line) => !line.message.startsWith('校验报告：'))
            }
          return run
        }),
        busy: runner.busy || stoppingDetachedExports || detached?.state === 'running',
        externalActivity: detached
      })
      return
    }
    if (request.method === 'POST' && pathname === '/runs') {
      const body = await readBody(request)
      if (!body || typeof body !== 'object' || !('operationId' in body) || !('parameters' in body))
        throw new Error('请选择操作并填写参数。')
      const operation = findSupabaseOperation(body.operationId)
      if (!operation) throw new Error('不支持该运维操作。')
      const actorId = await authorize(request, operation.permission)
      const detached = await externalActivity()
      if (stoppingDetachedExports) throw new Error('正在停止旧导出，请完成后刷新状态再执行。')
      if (
        detached?.state === 'running' ||
        (detached && operationNeedsInspectionAfterCancel(operation))
      )
        throw new Error(detached.message)
      send(response, 201, runner.start(operation, body.parameters, actorId))
      return
    }
    if (request.method === 'POST' && pathname === '/detached-exports/cancel') {
      await authorize(request, 'SupabaseOperations:Cancel')
      if (runner.busy || stoppingDetachedExports)
        throw new Error('当前有任务正在执行或停止，请先核对当前任务。')
      if (
        !runner.runs.some(
          (run) =>
            run.status === 'interrupted' &&
            ['backup', 'resumeBackup', 'updateBackup'].includes(run.operationId)
        )
      )
        throw new Error('没有需要处理的中断备份，请刷新任务状态。')
      stoppingDetachedExports = true
      try {
        send(response, 200, await cancelDetachedExports())
      } finally {
        stoppingDetachedExports = false
      }
      return
    }
    const cancel = pathname.match(/^\/runs\/([a-f\d-]{36})\/cancel$/)
    if (request.method === 'POST' && cancel) {
      await authorize(request, 'SupabaseOperations:Cancel')
      runner.cancel(cancel[1])
      send(response, 200, { ok: true })
      return
    }
    send(response, 404, { message: '找不到该运维接口。' })
  } catch (error) {
    send(response, 400, {
      message:
        error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)
          ? error.message
          : '运维请求失败，请检查执行端的目录权限和网络后重试。'
    })
  }
})
server.requestTimeout = 45_000
server.on('error', () => {
  console.error('运维执行端启动失败，请检查端口是否被占用。')
  process.exitCode = 1
})
server.listen(port, '127.0.0.1', () => {
  writeFileSync(connectionPath, JSON.stringify({ pid: process.pid, port, version: 2 }), {
    mode: 0o600
  })
  printConnection(port)
})
