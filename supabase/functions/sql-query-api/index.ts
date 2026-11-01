import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import postgres from 'npm:postgres@3.4.9'
import sqlParser from 'npm:node-sql-parser@5.4.0'
import { createQueryCancellation, SqlQueryCancelledError } from '../_shared/query-cancellation.ts'
import {
  bindParameters,
  compileNamedParameters,
  QueryApiError,
  record,
  UUID,
  validateDefinition,
  validateReadOnlyAst,
  type ApiDefinition
} from './policy.ts'

const parser = new sqlParser.Parser()
type Transaction = postgres.TransactionSql<Record<string, postgres.PostgresType>>
interface Actor {
  id: string
  tenantId: string
  super: boolean
  scope: string | null
}
const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  })
const errorCode = (error: unknown) => String(record(error).code || '')

function definition(row: Record<string, unknown>): ApiDefinition {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description),
    sql: String(row.sql_text),
    tenantId: String(row.tenant_id),
    allowedUserIds: Array.isArray(row.allowed_user_ids) ? row.allowed_user_ids.map(String) : [],
    parameters: validateDefinition({
      ...row,
      slug: row.slug,
      name: row.name,
      description: row.description,
      sql: row.sql_text,
      tenantId: row.tenant_id,
      allowedUserIds: row.allowed_user_ids,
      parameters: row.parameters,
      maxRows: row.max_rows,
      timeoutMs: row.timeout_ms,
      enabled: row.enabled
    }).parameters,
    maxRows: Number(row.max_rows),
    timeoutMs: Number(row.timeout_ms),
    enabled: row.enabled === true,
    updatedAt: String(row.version)
  }
}

function prepare(input: Pick<ApiDefinition, 'sql' | 'parameters'>) {
  const compiled = compileNamedParameters(input.sql, input.parameters)
  try {
    validateReadOnlyAst(parser.astify(compiled.sql, { database: 'Postgresql' }))
  } catch (error) {
    if (error instanceof QueryApiError) throw error
    throw new QueryApiError('INVALID_SQL', 'SQL 语法无效或暂不支持，请检查只读查询和参数定义')
  }
  return compiled
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    Vary: 'Origin',
    'Access-Control-Allow-Headers':
      'authorization,apikey,content-type,x-client-info,x-art-tenant-scope',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST')
    return json(
      { status: 'error', code: 'METHOD_NOT_ALLOWED', message: '请使用 POST 调用接口' },
      405,
      cors
    )
  let db: ReturnType<typeof postgres> | undefined
  let controlDb: ReturnType<typeof postgres> | undefined
  let cancellation: ReturnType<typeof createQueryCancellation> | undefined
  let callId: string | undefined
  let callStarted = 0
  try {
    const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
    if (!token) throw new QueryApiError('AUTH_REQUIRED', '请先登录后调用接口', 401)
    const client = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const {
      data: { user },
      error
    } = await client.auth.getUser(token)
    if (error || !user) throw new QueryApiError('AUTH_REQUIRED', '登录状态已失效，请重新登录', 401)
    // getUser has verified this exact token; force the data-plane identity/role.
    const decoded = record(
      JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(
            atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
            (character) => character.charCodeAt(0)
          )
        )
      )
    )
    const claims = {
      ...decoded,
      sub: user.id,
      role: 'authenticated',
      app_metadata: user.app_metadata
    }
    const scope = req.headers.get('x-art-tenant-scope')
    if (scope && scope !== 'all' && !UUID.test(scope))
      throw new QueryApiError('INVALID_TENANT', '租户范围无效')
    const headers = scope && scope !== 'all' ? { 'x-art-tenant-scope': scope } : {}
    const connection = Deno.env.get('SUPABASE_DB_URL')
    if (!connection)
      throw new QueryApiError('SERVICE_UNAVAILABLE', '接口执行服务尚未配置，请联系管理员', 503)
    db = postgres(connection, {
      prepare: false,
      max: 1,
      connect_timeout: 5,
      idle_timeout: 1,
      onnotice: () => undefined
    })
    const database = db
    const context = async (tx: Transaction) => {
      await tx`SELECT set_config('request.jwt.claims',${JSON.stringify(claims)},true),set_config('request.headers',${JSON.stringify(headers)},true)`
      const rows =
        await tx`SELECT u.id,u.tenant_id,app_private.is_platform_super() AS super,app_private.current_read_tenant_id() AS scope FROM public.sys_user u WHERE u.auth_user_id=${user.id} AND u.status='1' AND u.deleted_at IS NULL LIMIT 1`
      if (!rows[0])
        throw new QueryApiError('PERMISSION_DENIED', '当前账号未启用或没有有效租户', 403)
      return {
        id: String(rows[0].id),
        tenantId: String(rows[0].tenant_id),
        super: rows[0].super === true,
        scope: rows[0].scope ? String(rows[0].scope) : null
      } satisfies Actor
    }
    const size = Number(req.headers.get('content-length'))
    if (Number.isFinite(size) && size > 150000)
      throw new QueryApiError('INVALID_REQUEST', '请求内容过大')
    const raw = await req.text()
    if (raw.length > 150000) throw new QueryApiError('INVALID_REQUEST', '请求内容过大')
    let body: Record<string, unknown>
    try {
      body = record(JSON.parse(raw))
    } catch {
      throw new QueryApiError('INVALID_REQUEST', '请求内容须为 JSON 对象')
    }
    const suffix =
      new URL(req.url).pathname.split('/sql-query-api')[1]?.replace(/^\/+|\/+$/g, '') || ''
    const action = suffix ? 'invoke' : body.action
    const actor = await database.begin(context)
    if (action === 'cancel') {
      if (
        typeof body.requestId !== 'string' ||
        !UUID.test(body.requestId) ||
        typeof body.definitionId !== 'string' ||
        !UUID.test(body.definitionId)
      )
        throw new QueryApiError('INVALID_REQUEST', '调用请求标识无效，请重新调用')
      const requestId = body.requestId
      const definitionId = body.definitionId
      const state = await database.begin(async (tx) => {
        const current = await context(tx)
        const call = (
          await tx`SELECT id,status,finished_at FROM app_private.sql_query_api_call
          WHERE id=${requestId}::uuid AND definition_id=${definitionId}::uuid
            AND auth_user_id=${user.id}::uuid AND actor_id=${current.id}::uuid
            AND (${current.super} AND (${current.scope}::uuid IS NULL OR tenant_id=${current.scope}::uuid)
              OR NOT ${current.super} AND tenant_id=${current.tenantId}::uuid)
          FOR UPDATE`
        )[0]
        if (!call) return 'not_running'
        if (call.finished_at || call.status !== 'running') return 'finished'
        await tx`UPDATE app_private.sql_query_api_call SET error_code='QUERY_CANCEL_REQUESTED'
          WHERE id=${call.id}::uuid`
        return 'cancel_requested'
      })
      return json({ status: 'ok', state }, 200, cors)
    }
    if (action === 'list') {
      const snapshot = await database.begin(async (tx) => {
        const current = await context(tx)
        const rows =
          await tx`SELECT *,update_time::text AS version FROM app_private.sql_query_api WHERE (${current.super} AND (${current.scope}::uuid IS NULL OR tenant_id=${current.scope}::uuid)) OR (NOT ${current.super} AND tenant_id=${current.tenantId}::uuid AND enabled AND ${current.id}::uuid=ANY(allowed_user_ids)) ORDER BY update_time DESC,id LIMIT 500`
        const users = current.super
          ? await tx`SELECT id,tenant_id,coalesce(nullif(nick_name,''),nullif(user_name,''),'未命名账号') AS name FROM public.sys_user WHERE status='1' AND deleted_at IS NULL AND (${current.scope}::uuid IS NULL OR tenant_id=${current.scope}::uuid) ORDER BY user_name,id LIMIT 2000`
          : []
        return {
          definitions: rows.map((raw) => {
            const value = definition(raw)
            return current.super ? value : { ...value, sql: '', allowedUserIds: [] }
          }),
          canManage: current.super,
          users: users.map((row) => ({
            id: String(row.id),
            tenantId: String(row.tenant_id),
            name: String(row.name)
          }))
        }
      })
      return json(snapshot, 200, cors)
    }
    if (action === 'save') {
      if (!actor.super)
        throw new QueryApiError(
          'PERMISSION_DENIED',
          '只有平台超级管理员可以发布或配置查询接口',
          403
        )
      const input = validateDefinition(body.input)
      const parameterRows = input.parameters.map(({ name, type, required }) => ({
        name,
        type,
        required
      }))
      const compiled = prepare(input)
      const target = await database.begin(async (tx) => {
        const current = await context(tx)
        if (!current.super)
          throw new QueryApiError('PERMISSION_DENIED', '当前账号没有接口配置权限', 403)
        const existing = input.id
          ? (await tx`SELECT * FROM app_private.sql_query_api WHERE id=${input.id}::uuid`)[0]
          : undefined
        if (input.id && !existing) throw new QueryApiError('NOT_FOUND', '接口不存在或已不可用', 404)
        const tenantId = existing
          ? String(existing.tenant_id)
          : current.scope || input.tenantId || current.tenantId
        if (
          (current.scope && current.scope !== tenantId) ||
          (existing && input.tenantId && input.tenantId !== tenantId)
        )
          throw new QueryApiError('PERMISSION_DENIED', '接口所属租户与当前范围不一致', 403)
        if (existing && String(existing.slug) !== input.slug)
          throw new QueryApiError('IMMUTABLE_SLUG', '已发布的接口路径不能修改，请新建接口')
        const tenants =
          await tx`SELECT id FROM public.sys_tenant WHERE id=${tenantId}::uuid AND status='1'`
        if (!tenants.length) throw new QueryApiError('INVALID_TENANT', '所属租户已停用或不存在')
        const granted =
          await tx`SELECT id FROM public.sys_user WHERE id=ANY(${input.allowedUserIds}::uuid[]) AND tenant_id=${tenantId}::uuid AND status='1' AND deleted_at IS NULL`
        if (granted.length !== new Set(input.allowedUserIds).size)
          throw new QueryApiError('INVALID_GRANTS', '授权账号必须属于接口租户且处于启用状态')
        return { tenantId, existing }
      })
      // EXPLAIN validates syntax and authenticated-role privileges without running the query.
      if (input.enabled)
        await database.begin('read only', async (tx) => {
          await tx`SELECT set_config('request.jwt.claims',${JSON.stringify(claims)},true),set_config('request.headers',${JSON.stringify({ 'x-art-tenant-scope': target.tenantId })},true),set_config('statement_timeout','5000',true),set_config('search_path','pg_catalog,public',true)`
          await tx.unsafe('SET LOCAL ROLE authenticated')
          await tx.unsafe(
            `EXPLAIN (FORMAT JSON, ANALYZE FALSE) SELECT * FROM (${compiled.sql}\n) api_preview LIMIT 0`,
            bindParameters(input.parameters, compiled.names, {}, true)
          )
        })
      const saved = await database.begin(async (tx) => {
        const current = await context(tx)
        if (!current.super || (current.scope && current.scope !== target.tenantId))
          throw new QueryApiError('PERMISSION_DENIED', '当前账号没有接口配置权限', 403)
        if (input.id) {
          const locked = (
            await tx`SELECT *,update_time::text AS version FROM app_private.sql_query_api WHERE id=${input.id}::uuid FOR UPDATE`
          )[0]
          if (!locked || String(locked.version) !== input.updatedAt)
            throw new QueryApiError(
              'VERSION_CONFLICT',
              '接口配置已被其他操作修改，请刷新后重试',
              409
            )
          const rows =
            await tx`UPDATE app_private.sql_query_api SET name=${input.name},description=${input.description},sql_text=${input.sql},parameters=${tx.json(parameterRows)},allowed_user_ids=${input.allowedUserIds}::uuid[],max_rows=${input.maxRows},timeout_ms=${input.timeoutMs},enabled=${input.enabled},update_by=${user.email || user.id},update_time=clock_timestamp() WHERE id=${input.id}::uuid RETURNING *,update_time::text AS version`
          return definition(rows[0])
        }
        const rows =
          await tx`INSERT INTO app_private.sql_query_api(slug,name,description,sql_text,tenant_id,parameters,allowed_user_ids,max_rows,timeout_ms,enabled,create_by,update_by) VALUES(${input.slug},${input.name},${input.description},${input.sql},${target.tenantId}::uuid,${tx.json(parameterRows)},${input.allowedUserIds}::uuid[],${input.maxRows},${input.timeoutMs},${input.enabled},${user.email || user.id},${user.email || user.id}) RETURNING *,update_time::text AS version`
        return definition(rows[0])
      })
      return json(saved, 200, cors)
    }
    if (action !== 'invoke') throw new QueryApiError('INVALID_ACTION', '不支持的接口操作')
    const slug = suffix || body.slug
    if (typeof slug !== 'string' || !/^[a-z][a-z\d-]{2,63}$/.test(slug))
      throw new QueryApiError('NOT_FOUND', '接口不存在或未获授权', 404)
    if (
      body.requestId !== undefined &&
      (typeof body.requestId !== 'string' || !UUID.test(body.requestId))
    )
      throw new QueryApiError('INVALID_REQUEST', '调用请求标识无效，请重新调用')
    const requestId = typeof body.requestId === 'string' ? body.requestId : crypto.randomUUID()
    callStarted = Date.now()
    const started = await database.begin(async (tx) => {
      const current = await context(tx)
      const row = (
        await tx`SELECT *,update_time::text AS version FROM app_private.sql_query_api WHERE slug=${slug} AND enabled AND (${current.super} AND (${current.scope}::uuid IS NULL OR tenant_id=${current.scope}::uuid) OR NOT ${current.super} AND tenant_id=${current.tenantId}::uuid AND ${current.id}::uuid=ANY(allowed_user_ids))`
      )[0]
      if (!row) throw new QueryApiError('NOT_FOUND', '接口不存在、已停用或未获授权', 404)
      const value = definition(row)
      const compiled = prepare(value)
      const parameters = bindParameters(value.parameters, compiled.names, body.params || {})
      await tx`SELECT pg_advisory_xact_lock(213742,711)`
      if ((await tx`SELECT id FROM app_private.sql_query_api_call WHERE id=${requestId}::uuid`)[0])
        throw new QueryApiError('REQUEST_CONFLICT', '此调用请求已执行，请重新调用', 409)
      const counts = (
        await tx`SELECT count(*) FILTER(WHERE finished_at IS NULL AND expires_at>now())::int AS global_active,count(*) FILTER(WHERE actor_id=${current.id}::uuid AND finished_at IS NULL AND expires_at>now())::int AS actor_active,count(*) FILTER(WHERE actor_id=${current.id}::uuid AND started_at>now()-interval '1 minute')::int AS recent FROM app_private.sql_query_api_call WHERE started_at>now()-interval '2 minutes'`
      )[0]
      if (
        Number(counts.global_active) >= 8 ||
        Number(counts.actor_active) >= 2 ||
        Number(counts.recent) >= 60
      )
        throw new QueryApiError('RATE_LIMITED', '接口调用繁忙，请稍后重试', 429)
      const calls =
        await tx`INSERT INTO app_private.sql_query_api_call(id,definition_id,tenant_id,actor_id,auth_user_id,expires_at,status) VALUES(${requestId}::uuid,${value.id}::uuid,${value.tenantId}::uuid,${current.id}::uuid,${user.id}::uuid,now()+interval '60 seconds','running') RETURNING id`
      return { value, compiled, parameters, id: String(calls[0].id) }
    })
    callId = started.id
    const value = started.value
    let backend: { pid: number; backendStart: string; transactionStart: string } | undefined
    const applicationName = `art-sql-api:${started.id}`
    if (body.requestId !== undefined) {
      // Coordination needs a separate connection while the owner holds the read-only transaction.
      const control = postgres(connection, {
        prepare: false,
        max: 1,
        connect_timeout: 5,
        idle_timeout: 1
      })
      controlDb = control
      cancellation = createQueryCancellation(
        async () => {
          const call = (
            await control`SELECT status,error_code,finished_at,expires_at>clock_timestamp() AS live
          FROM app_private.sql_query_api_call WHERE id=${started.id}::uuid AND definition_id=${value.id}::uuid
            AND auth_user_id=${user.id}::uuid AND actor_id=${actor.id}::uuid AND tenant_id=${value.tenantId}::uuid`
          )[0]
          if (!call || call.finished_at || call.status !== 'running' || !call.live)
            return 'not_running'
          return call.error_code === 'QUERY_CANCEL_REQUESTED' ? 'cancel_requested' : 'running'
        },
        async () => {
          if (!backend) return
          // The owning transaction stays open until this signal completes; browser input never supplies a PID.
          await control`SELECT pg_catalog.pg_cancel_backend(pid) FROM pg_catalog.pg_stat_activity
          WHERE pid=${backend.pid} AND backend_start=${backend.backendStart}::text::timestamptz
            AND xact_start=${backend.transactionStart}::text::timestamptz AND application_name=${applicationName}`
        }
      )
    }
    const result = await database.begin('read only', async (tx) => {
      await tx`SELECT set_config('request.jwt.claims',${JSON.stringify(claims)},true),set_config('request.headers',${JSON.stringify({ 'x-art-tenant-scope': value.tenantId })},true),set_config('statement_timeout',${String(value.timeoutMs)},true),set_config('search_path','pg_catalog,public',true),set_config('row_security','on',true)`
      if (cancellation) {
        await tx`SELECT set_config('application_name',${applicationName},true)`
        const row = (
          await tx`SELECT pid,backend_start::text AS backend_start,xact_start::text AS transaction_start
          FROM pg_catalog.pg_stat_activity WHERE pid=pg_backend_pid()`
        )[0]
        if (
          !row ||
          typeof row.pid !== 'number' ||
          typeof row.backend_start !== 'string' ||
          typeof row.transaction_start !== 'string'
        )
          throw new QueryApiError('SERVICE_UNAVAILABLE', '无法识别调用会话，请重试', 503)
        backend = {
          pid: row.pid,
          backendStart: row.backend_start,
          transactionStart: row.transaction_start
        }
      }
      await tx.unsafe('SET LOCAL ROLE authenticated')
      const query = () =>
        tx.unsafe(
          `SELECT * FROM (${started.compiled.sql}\n) api_result LIMIT ${value.maxRows + 1}`,
          started.parameters
        )
      const rows = cancellation ? await cancellation.run(query) : await query()
      if (JSON.stringify(rows).length > 8000000)
        throw new QueryApiError('RESULT_TOO_LARGE', '接口结果超过 8 MB，请缩小查询范围', 413)
      return {
        status: 'ok',
        rows: Array.from(rows).slice(0, value.maxRows),
        columns: rows.columns.map((column) => ({ name: column.name })),
        rowCount: Math.min(rows.length, value.maxRows),
        truncated: rows.length > value.maxRows,
        durationMs: Math.max(0, Date.now() - callStarted),
        maxRows: value.maxRows,
        timeoutMs: value.timeoutMs
      }
    })
    await database.begin(async (tx) => {
      const current = await context(tx)
      const fresh = (
        await tx`SELECT enabled,update_time::text AS version,allowed_user_ids,tenant_id FROM app_private.sql_query_api WHERE id=${value.id}::uuid`
      )[0]
      if (
        !fresh ||
        fresh.enabled !== true ||
        String(fresh.version) !== value.updatedAt ||
        (!current.super &&
          (!Array.isArray(fresh.allowed_user_ids) ||
            !fresh.allowed_user_ids.includes(current.id))) ||
        (current.scope && current.scope !== value.tenantId)
      )
        throw new QueryApiError('DEFINITION_CHANGED', '接口配置或授权已变化，请重新调用', 409)
      // Completion and cancellation compete on this row; whichever locks first owns the outcome.
      const completed = await tx`UPDATE app_private.sql_query_api_call
        SET finished_at=clock_timestamp(),status='ok',error_code=NULL,duration_ms=${result.durationMs},row_count=${result.rowCount}
        WHERE id=${started.id}::uuid AND status='running' AND finished_at IS NULL
          AND error_code IS DISTINCT FROM 'QUERY_CANCEL_REQUESTED' RETURNING id`
      if (!completed.length) {
        const state = (
          await tx`SELECT status,error_code,finished_at FROM app_private.sql_query_api_call WHERE id=${started.id}::uuid`
        )[0]
        if (
          state?.status === 'running' &&
          !state.finished_at &&
          state.error_code === 'QUERY_CANCEL_REQUESTED'
        )
          throw new SqlQueryCancelledError()
        throw new QueryApiError('REQUEST_CHANGED', '调用状态已失效，请重新调用', 409)
      }
    })
    return json(result, 200, cors)
  } catch (error) {
    const code =
      error instanceof SqlQueryCancelledError
        ? 'QUERY_CANCELLED'
        : error instanceof QueryApiError
          ? error.code
          : errorCode(error) === '23505'
            ? 'SLUG_EXISTS'
            : errorCode(error) === '57014'
              ? 'QUERY_TIMEOUT'
              : errorCode(error) === '42501'
                ? 'DATA_PERMISSION_DENIED'
                : 'QUERY_API_FAILED'
    const message =
      error instanceof QueryApiError
        ? error.message
        : code === 'SLUG_EXISTS'
          ? '接口路径已被使用，请更换路径'
          : code === 'QUERY_TIMEOUT'
            ? '接口查询超时，请缩小参数范围'
            : code === 'DATA_PERMISSION_DENIED'
              ? '当前账号没有查询所需数据的权限'
              : '接口操作失败，请检查查询与参数后重试'
    if (db && callId) {
      try {
        await db`UPDATE app_private.sql_query_api_call SET finished_at=clock_timestamp(),status='error',error_code=${code},duration_ms=${Math.max(0, Date.now() - callStarted)} WHERE id=${callId}::uuid`
      } catch {
        console.error('SQL query API audit completion failed')
      }
    }
    if (code === 'QUERY_CANCELLED')
      return json(
        {
          status: 'cancelled',
          message: '查询已取消',
          durationMs: Math.max(0, Date.now() - callStarted)
        },
        200,
        cors
      )
    return json(
      { status: 'error', code, message },
      error instanceof QueryApiError
        ? error.status
        : code === 'SLUG_EXISTS'
          ? 409
          : code === 'DATA_PERMISSION_DENIED'
            ? 403
            : 500,
      cors
    )
  } finally {
    if (cancellation) await cancellation.stop()
    if (controlDb) await controlDb.end({ timeout: 0 })
    if (db) await db.end({ timeout: 0 })
  }
})
