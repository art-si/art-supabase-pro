import { createServer, type IncomingMessage } from 'node:http'
import { appendFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { SqlConnection, SqlGatewayUser } from '../src/types/sql-connections'
import { validateSqlConnection } from '../src/utils/sql-connections'
import { SqlConnectionVault } from './sql-gateway-vault'
import {
  inspectSqlConnection,
  querySqlConnection,
  validateGatewayQuery,
  withSqlDatabase
} from './sql-gateway-driver'

type IdentityCall = (token: string, route: string, body?: object) => Promise<unknown>
import { toObjectRecord as record } from '../src/utils/record'
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
class GatewayError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message)
  }
}

export interface GatewayActor {
  id: string
  tenantId: string
  platformSuper: boolean
  selectedTenant: string | null
}
export function canUseSqlConnection(connection: SqlConnection, actor: GatewayActor): boolean {
  if (!connection.enabled) return false
  return actor.platformSuper
    ? !actor.selectedTenant || actor.selectedTenant === connection.tenantId
    : actor.tenantId === connection.tenantId && connection.allowedUserIds.includes(actor.id)
}

export function createSqlGateway(options: {
  origins: string[]
  directory: string
  identity: IdentityCall
}) {
  const vault = new SqlConnectionVault(options.directory)
  const origins = new Set(options.origins)
  const active = new Map<string, number>()
  let running = 0
  const audit = (
    actor: GatewayActor,
    connectionId: string,
    action: string,
    status: string,
    requestId: string
  ) => {
    // Query text, result rows, credentials and tokens are deliberately excluded from the audit.
    appendFileSync(
      path.join(options.directory, 'audit.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), actorId: actor.id, tenantId: actor.tenantId, selectedTenant: actor.selectedTenant, connectionId, action, status, requestId })}\n`,
      { mode: 0o600 }
    )
  }
  const authorize = async (request: IncomingMessage) => {
    const token = request.headers.authorization?.match(/^Bearer ([A-Za-z\d._-]+)$/)?.[1]
    if (!token) throw new GatewayError('请先登录项目账号', 401)
    const identity = record(await options.identity(token, '/auth/v1/user'))
    if (typeof identity.id !== 'string' || !uuid.test(identity.id))
      throw new GatewayError('登录身份无效，请重新登录', 401)
    const [superResult, profiles] = await Promise.all([
      options.identity(token, '/rest/v1/rpc/current_is_super', {}),
      options.identity(
        token,
        `/rest/v1/sys_user?auth_user_id=eq.${identity.id}&select=id,tenant_id,status,deleted_at&limit=1`
      )
    ])
    const profile = record(Array.isArray(profiles) ? profiles[0] : undefined)
    if (
      typeof profile.id !== 'string' ||
      typeof profile.tenant_id !== 'string' ||
      profile.status !== '1' ||
      profile.deleted_at
    )
      throw new GatewayError('当前账号不可用，请联系管理员', 403)
    const selected = request.headers['x-art-tenant-scope']
    if (selected && (typeof selected !== 'string' || (selected !== 'all' && !uuid.test(selected))))
      throw new GatewayError('租户范围无效')
    const actor: GatewayActor = {
      id: profile.id,
      tenantId: profile.tenant_id,
      platformSuper: superResult === true,
      selectedTenant:
        superResult === true && typeof selected === 'string' && selected !== 'all' ? selected : null
    }
    return { token, actor }
  }
  const usersFor = async (token: string): Promise<SqlGatewayUser[]> => {
    const rows = await options.identity(
      token,
      '/rest/v1/sys_user?select=id,nick_name,user_name,tenant_id&status=eq.1&deleted_at=is.null&limit=2000'
    )
    if (!Array.isArray(rows)) throw new GatewayError('授权账号加载失败，请重试')
    return rows.flatMap((value) => {
      const row = record(value)
      return typeof row.id === 'string' && typeof row.tenant_id === 'string'
        ? [
            {
              id: row.id,
              tenantId: row.tenant_id,
              name:
                typeof row.nick_name === 'string' && row.nick_name
                  ? row.nick_name
                  : String(row.user_name || '未命名账号')
            }
          ]
        : []
    })
  }
  return createServer(async (request, response) => {
    const origin = request.headers.origin
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (status: number, body: unknown) => {
      response.writeHead(status)
      response.end(JSON.stringify(body))
    }
    if (!origin || !origins.has(origin)) {
      send(403, { message: '当前站点未获准访问 SQL 执行端' })
      return
    }
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization,Content-Type,x-art-tenant-scope'
    )
    response.setHeader('Access-Control-Allow-Private-Network', 'true')
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }
    if ((request.method === 'GET' || request.method === 'POST') && request.url === '/health') {
      send(200, {
        service: 'art-sql-gateway',
        projectRef: 'ckbftoopuyophiebamwy',
        version: 1,
        pid: process.pid
      })
      return
    }
    let actor: GatewayActor | undefined
    let connectionId = ''
    let action = 'request'
    const requestId = randomUUID()
    let counted = false
    try {
      const authorized = await authorize(request)
      actor = authorized.actor
      const token = authorized.token
      if ((active.get(actor.id) || 0) >= 2)
        throw new GatewayError('已有查询或连接操作正在运行，请稍后重试', 429)
      if (running >= 8) throw new GatewayError('执行端当前繁忙，请稍后重试', 429)
      active.set(actor.id, (active.get(actor.id) || 0) + 1)
      running++
      counted = true
      const url = new URL(request.url || '/', 'http://localhost')
      if (request.method === 'GET' && url.pathname === '/snapshot') {
        const connections = vault
          .list()
          .filter((connection) =>
            actor!.platformSuper
              ? !actor!.selectedTenant || connection.tenantId === actor!.selectedTenant
              : canUseSqlConnection(connection, actor!)
          )
        send(200, {
          connections,
          users: actor.platformSuper ? await usersFor(token) : [],
          canManage: actor.platformSuper
        })
        return
      }
      if (request.method !== 'POST') throw new GatewayError('请求不存在', 404)
      let raw = ''
      for await (const chunk of request) {
        raw += chunk.toString()
        if (Buffer.byteLength(raw) > 128_000) throw new GatewayError('请求内容过大', 413)
      }
      let body: unknown
      try {
        body = JSON.parse(raw)
      } catch {
        throw new GatewayError('请求内容无效')
      }
      if (url.pathname === '/connections/save' || url.pathname === '/connections/test') {
        if (!actor.platformSuper)
          throw new GatewayError('只有平台超级管理员可以管理数据库连接', 403)
        const input = validateSqlConnection(body)
        const users = await usersFor(token)
        if (
          (actor.selectedTenant && input.tenantId !== actor.selectedTenant) ||
          !users.some((user) => user.tenantId === input.tenantId) ||
          input.allowedUserIds.some(
            (id) => !users.some((user) => user.id === id && user.tenantId === input.tenantId)
          )
        )
          throw new GatewayError('连接所属租户或授权账号无效', 403)
        const prior = input.id ? vault.get(input.id) : undefined
        if (prior && prior.connection.tenantId !== input.tenantId)
          throw new GatewayError('已保存连接不能更换所属租户')
        connectionId = input.id || 'new'
        action = url.pathname.endsWith('/save') ? 'save' : 'test'
        if (action === 'save') {
          const saved = vault.save(input)
          connectionId = saved.id
          audit(actor, connectionId, action, 'ok', requestId)
          send(200, saved)
          return
        }
        const password = input.password || prior?.password
        if (password === undefined) throw new GatewayError('请填写数据库密码')
        await withSqlDatabase(
          { ...input, id: input.id || 'test', updatedAt: '' },
          password,
          7000,
          (run) =>
            run(
              input.dialect === 'dm'
                ? 'SELECT 1 AS connection_ok FROM DUAL'
                : 'SELECT 1 AS connection_ok'
            )
        )
        audit(actor, connectionId, action, 'ok', requestId)
        send(200, { ok: true })
        return
      }
      const match = url.pathname.match(/^\/connections\/([a-f\d-]{36})\/(metadata|query)$/i)
      if (!match) throw new GatewayError('请求不存在', 404)
      connectionId = match[1]
      action = match[2]
      // Check the public record before decrypting its credential.
      const visible = vault.list().find((connection) => connection.id === connectionId)
      if (!visible || !canUseSqlConnection(visible, actor))
        throw new GatewayError('没有此连接的使用权限，或连接已停用', 403)
      const { connection, password } = vault.get(connectionId)
      const value = record(body)
      if (
        action === 'metadata' &&
        value.schema !== undefined &&
        (typeof value.schema !== 'string' || value.schema.length > 200)
      )
        throw new GatewayError('schema 参数无效')
      const result =
        action === 'metadata'
          ? await inspectSqlConnection(
              connection,
              password,
              typeof value.schema === 'string' ? value.schema : undefined
            )
          : await querySqlConnection(connection, password, validateGatewayQuery(body))
      // Do not deliver a result after a connection has been disabled or its grants changed.
      const current = vault.list().find((item) => item.id === connectionId)
      if (
        !current ||
        !canUseSqlConnection(current, actor) ||
        current.updatedAt !== connection.updatedAt
      )
        throw new GatewayError('连接配置已变化，请刷新后重试', 409)
      audit(actor, connectionId, action, 'ok', requestId)
      send(200, result)
    } catch (error) {
      if (actor) {
        try {
          audit(actor, connectionId, action, 'error', requestId)
        } catch {
          send(503, { message: '执行端审计记录无法写入，请检查磁盘权限后重试', requestId })
          return
        }
      }
      const code = record(error).code
      const sqlMessages: Record<string, string> = {
        '42P01': '表或视图不存在，请检查数据库与 schema',
        ER_NO_SUCH_TABLE: '表或视图不存在，请检查数据库名称',
        '42703': '字段不存在，请检查字段名或刷新结构',
        ER_BAD_FIELD_ERROR: '字段不存在，请检查字段名或刷新结构',
        '42601': 'SQL 语法错误，请检查标识符引用和当前数据库方言',
        ER_PARSE_ERROR: 'SQL 语法错误，请检查标识符引用和当前数据库方言',
        '42501': '数据库账号无权读取该对象，请检查只读授权',
        ER_TABLEACCESS_DENIED_ERROR: '数据库账号无权读取该对象，请检查只读授权',
        '25006': '外接连接只允许只读查询，请移除写入操作',
        ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION: '外接连接只允许只读查询，请移除写入操作',
        ER_QUERY_TIMEOUT: '查询已超时，请减少查询范围或增加超时后重试',
        ER_QUERY_INTERRUPTED: '查询被中断，请缩小查询范围后重试'
      }
      const message =
        error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)
          ? error.message
          : sqlMessages[String(code)]
            ? sqlMessages[String(code)]
            : ['ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', '57014', 'CONNECTION_ENDED'].includes(
                  String(code)
                )
              ? '查询超时或连接中断，请减少查询范围后重试'
              : ['ER_ACCESS_DENIED_ERROR', '28P01'].includes(String(code))
                ? '数据库认证失败，请检查账号、密码和访问权限'
                : '数据库操作失败，请检查地址、网络、TLS 和只读账号权限后重试'
      send(error instanceof GatewayError ? error.status : 400, { message, requestId })
    } finally {
      if (counted && actor) {
        const remaining = (active.get(actor.id) || 1) - 1
        if (remaining > 0) active.set(actor.id, remaining)
        else active.delete(actor.id)
        running--
      }
    }
  })
}
