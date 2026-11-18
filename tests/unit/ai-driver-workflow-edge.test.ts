import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

type Row = Record<string, unknown>
type Handler = (request: Request) => Promise<Response>
const tables = new Map<string, Row[]>()
const providerRequests: Row[] = []
const businessCalls: string[] = []
const authUser = { id: 'driver-auth-id' }
const tenant = 'driver-tenant-id'
let handler: Handler

class Query {
  private filters: ((row: Row) => boolean)[] = []
  private write: Row | undefined
  private insertRow = false
  private descending = false
  private max = Infinity

  constructor(private table: string) {}
  select() {
    return this
  }
  eq(key: string, value: unknown) {
    const [column, jsonKey] = key.split('->>')
    this.filters.push((row) => {
      const entry = row[column]
      return (
        (jsonKey && entry && typeof entry === 'object' ? Reflect.get(entry, jsonKey) : entry) ===
        value
      )
    })
    return this
  }
  is(key: string, value: unknown) {
    return this.eq(key, value)
  }
  in(key: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[key]))
    return this
  }
  gte() {
    return this
  }
  order() {
    this.descending = true
    return this
  }
  limit(max: number) {
    this.max = max
    return this
  }
  insert(value: Row) {
    this.write = value
    this.insertRow = true
    return this
  }
  update(value: Row) {
    this.write = value
    return this
  }
  single() {
    return Promise.resolve(this.result(true))
  }
  maybeSingle() {
    return this.single()
  }
  then<T>(resolve: (value: ReturnType<Query['result']>) => T) {
    return Promise.resolve(this.result(false)).then(resolve)
  }

  private result(one: boolean) {
    const records = tables.get(this.table)
    assert(records, `Unexpected table ${this.table}`)
    let rows = records.filter((row) => this.filters.every((filter) => filter(row)))
    if (this.insertRow) {
      const row = { id: `${this.table}-${records.length + 1}`, ...this.write }
      records.push(row)
      rows = [row]
    } else if (this.write) {
      rows.forEach((row) => Object.assign(row, this.write))
    }
    if (this.descending) rows.reverse()
    return {
      data: one ? (rows[0] ?? null) : rows.slice(0, this.max),
      count: rows.length,
      error: null
    }
  }
}

const testKey = Symbol.for('test.ai-driver-workflow')
const testAuthorization = {
  ok: true,
  user: authUser,
  appUser: { tenant_id: tenant, user_email: 'test@example.invalid', status: '1' },
  admin: {
    from: (table: string) => new Query(table),
    rpc: async (name: string, input: Row) => {
      assert.equal(name, 'mobile_driver_account_identity')
      assert.equal(input.p_auth_user_id, authUser.id)
      assert.equal(input.p_tenant_id, tenant)
      const driver = tables
        .get('driver_accounts')
        ?.find((row) => row.tenant_id === tenant && row.enabled)
      return { data: driver?.driver_id ?? null, error: null }
    }
  },
  userClient: {
    rpc: async (name: string) => {
      businessCalls.push(name)
      return { data: { records: [] }, error: null }
    }
  }
}
Reflect.set(globalThis, testKey, testAuthorization)
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === 'jsr:@supabase/functions-js/edge-runtime.d.ts' ||
      specifier === 'jsr:@supabase/supabase-js@2'
    ) {
      return { url: 'data:text/javascript,export%20%7B%7D', shortCircuit: true }
    }
    if (specifier.endsWith('/ai-edge-user-context.ts')) {
      const source =
        'const ctx = globalThis[Symbol.for("test.ai-driver-workflow")]; export const authenticateAiEdgeRequest = async () => ctx; export const authorizeAiEdgeAppUser = async () => ctx;'
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  }
})
const nvidiaHost = 'https://integrate.api.nvidia.com/v1'
const openAiFallbackHost = 'https://fallback.example.invalid/v1'
const env: Record<string, string> = {
  AI_API_KEY: 'provider-test-key',
  AI_BASE_URL: nvidiaHost
}
Reflect.set(globalThis, 'Deno', {
  env: { get: (name: string) => env[name] },
  serve: (callback: Handler) => {
    handler = callback
  }
})
await import('../../supabase/functions/ai-assistant/index.ts')

function setup({
  driver = true,
  providerReturnsTool = false,
  emptyPrimary = false,
  fallback = false
} = {}) {
  tables.clear()
  providerRequests.length = 0
  businessCalls.length = 0
  tables.set('sys_tenant', [{ id: 'platform', tenant_code: 'platform' }])
  tables.set('sys_user', [
    {
      auth_user_id: authUser.id,
      tenant_id: tenant,
      status: '1',
      deleted_at: null,
      user_type: '2',
      user_phone: 'test-phone'
    }
  ])
  tables.set('driver_accounts', [
    {
      driver_id: 'driver-record',
      tenant_id: driver ? tenant : 'other-tenant',
      enabled: true
    }
  ])
  tables.set('ai_feature_config', [
    {
      tenant_id: tenant,
      feature: 'business_assistant',
      enabled: true,
      provider: 'openai_compatible',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b'
    }
  ])
  tables.set('ai_prompt_template', [])
  for (const name of ['ai_conversation', 'ai_run', 'ai_message', 'ai_tool_audit'])
    tables.set(name, [])
  if (fallback) {
    env.OPENAI_API_KEY = 'fallback-test-key'
    env.OPENAI_BASE_URL = openAiFallbackHost
  } else {
    delete env.OPENAI_API_KEY
    delete env.OPENAI_BASE_URL
  }
  globalThis.fetch = async (url, init) => {
    const isPrimary = url === `${nvidiaHost}/chat/completions`
    if (!isPrimary) {
      assert.equal(fallback, true)
      assert.equal(url, `${openAiFallbackHost}/chat/completions`)
    }
    const request = JSON.parse(String(init?.body))
    providerRequests.push(request)
    if (isPrimary && emptyPrimary) {
      return Response.json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              reasoning_content: 'provider-only reasoning'
            }
          }
        ]
      })
    }
    return Response.json({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '请从「我的 → 异常报备」选择关联运单，填写后提交。',
            ...(providerReturnsTool
              ? {
                  tool_calls: [
                    {
                      id: 'unexpected',
                      function: { name: 'get_recent_orders', arguments: '{}' }
                    }
                  ]
                }
              : {})
          }
        }
      ]
    })
  }
}

const question = '司机端业务联调：异常报备怎么提交？不查询任何运单。'
const mobileContext = { routeName: 'driver-assistant', routePath: '/pages/mine/assistant' }
const send = (content: string, fields: Row = {}) =>
  handler(
    new Request('http://localhost/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content }], ...fields })
    })
  )

test('verified drivers bypass both tool routes, even with injected page context or returned calls', async () => {
  setup({ providerReturnsTool: true })
  const res = await send(question, {
    context: { routeName: 'transport', routePath: '/tms/orders', recordId: 'ignored' }
  })
  assert.equal(res.status, 200)
  const result = await res.json()
  assert.equal(result.executionMode, 'model')
  assert.deepEqual(result.tools, [])
  assert.deepEqual(businessCalls, [])
  assert.equal(providerRequests.length, 1)
  assert.equal('tools' in providerRequests[0], false)
  assert.deepEqual(providerRequests[0].chat_template_kwargs, { enable_thinking: false })
  const sent = JSON.stringify(providerRequests[0])
  assert.match(sent, /只解释界面和业务流程/)
  assert.doesNotMatch(sent, /ignored/)
  assert.equal(tables.get('ai_run')?.[0].status, 'succeeded')
})

test('continuation uses only the same driver’s scoped stored messages and refuses stale Web history', async () => {
  setup()
  const first = await send(question, { context: mobileContext })
  assert.equal(first.status, 200)
  const { conversationId } = await first.json()
  const second = await send('', {
    conversationId,
    context: mobileContext,
    messages: [
      { role: 'assistant', content: 'untrusted cached answer' },
      { role: 'user', content: '预计费用会直接计费吗？' }
    ]
  })
  assert.equal(second.status, 200)
  assert.equal((await second.json()).conversationId, conversationId)
  assert.match(JSON.stringify(providerRequests[1]), /司机端业务联调/)
  assert.doesNotMatch(JSON.stringify(providerRequests[1]), /untrusted cached answer/)
  const records = tables.get('ai_conversation')
  assert(records)
  records.push({
    id: 'legacy',
    auth_user_id: authUser.id,
    tenant_id: tenant,
    context: mobileContext
  })
  records.push({
    id: 'forged-legacy',
    auth_user_id: authUser.id,
    tenant_id: tenant,
    context: { ...mobileContext, assistantScope: 'driver_workflow_help' }
  })
  records.push({
    id: 'foreign',
    auth_user_id: 'another-user',
    tenant_id: tenant,
    context: records[0].context
  })
  for (const id of ['legacy', 'forged-legacy', 'foreign']) {
    assert.equal((await send(question, { conversationId: id })).status, 404)
  }
  assert.equal(providerRequests.length, 2)
  assert.deepEqual(businessCalls, [])
})

test('a normal external user with no owned driver record cannot claim mobile mode; regular Web keeps tools', async () => {
  setup({ driver: false })
  const denied = await send(question, { context: mobileContext })
  assert.equal(denied.status, 403)
  assert.equal(providerRequests.length, 0)
  const normal = await send('请说明使用指南', {
    context: { assistantScope: 'driver_workflow_help' }
  })
  assert.equal(normal.status, 200)
  assert.equal('tools' in providerRequests[0], true)
  assert.equal('chat_template_kwargs' in providerRequests[0], false)
  assert.doesNotMatch(JSON.stringify(providerRequests[0]), /driver_workflow_help/)
})

test('a reasoning-only response falls back without passing tools or provider-specific settings', async () => {
  setup({ emptyPrimary: true, fallback: true })
  const response = await send(question, { context: mobileContext })
  assert.equal(response.status, 200)
  assert.doesNotMatch(JSON.stringify(await response.json()), /provider-only reasoning/)
  assert.equal(providerRequests.length, 2)
  assert.deepEqual(providerRequests[0].chat_template_kwargs, { enable_thinking: false })
  assert.equal('chat_template_kwargs' in providerRequests[1], false)
  assert.equal('tools' in providerRequests[1], false)
  assert.deepEqual(businessCalls, [])
})

test.after(() => {
  hooks.deregister()
  Reflect.deleteProperty(globalThis, testKey)
})
