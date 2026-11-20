import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

type Row = Record<string, unknown>
type Handler = (request: Request) => Promise<Response>
interface ClientOptions {
  auth: { autoRefreshToken: boolean; persistSession: boolean }
  global?: { headers: Record<string, string> }
}
interface UserClient {
  rpc(this: UserClient, name: string, input: Row): Promise<{ data: Row; error: null }>
}
interface Scenario {
  name: string
  id: string
  actor: 'ordinary' | 'platform-super'
  tenant: string
  scope?: string
  direction: 'receipt' | 'payment'
}

const platformTenant = 'platform-tenant'
const feature = 'cash_voucher_ocr'
const providerHost = 'https://ocr-provider.example.invalid/v1'
const imageUrl = 'https://voucher.example.invalid/bank-receipt.png'
const prompt = '识别银行收付款凭证，完整返回 rawText 和 voucher JSON，不得猜测。'
const env: Record<string, string> = {
  SUPABASE_URL: 'https://cash-test.supabase.invalid',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  AI_API_KEY: 'provider-test-key',
  AI_BASE_URL: providerHost
}
const tables = new Map<string, Row[]>()
const providerRequests: Row[] = []
const businessCalls: { client: UserClient; name: string; input: Row }[] = []
const adminRpcCalls: string[] = []
const createdClients: { kind: string; client: object; options: ClientOptions }[] = []
const rateQueries: [string, unknown][][] = []
let handler: Handler | undefined
let fixture: ReturnType<typeof setup> | undefined

// Only the table operations reached by the real vision runtime are simulated.
class Query {
  private filters: ((row: Row) => boolean)[] = []
  private conditions: [string, unknown][] = []
  private write: Row | undefined
  private inserting = false
  private head = false

  constructor(private table: string) {}
  select(_columns: string, options?: { count: 'exact'; head: boolean }) {
    this.head = options?.head ?? this.head
    return this
  }
  eq(key: string, value: unknown) {
    this.conditions.push([key, value])
    this.filters.push((row) => row[key] === value)
    return this
  }
  in(key: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[key]))
    return this
  }
  gte(key: string, value: string) {
    this.conditions.push([key, value])
    this.filters.push((row) => {
      const entry = row[key]
      return typeof entry === 'string' && entry >= value
    })
    return this
  }
  insert(value: Row) {
    this.write = value
    this.inserting = true
    return this
  }
  update(value: Row) {
    this.write = value
    return this
  }
  single() {
    return Promise.resolve({ data: this.rows()[0] ?? null, error: null })
  }
  maybeSingle() {
    return this.single()
  }
  then<T>(resolve: (value: { data: Row[]; count: number; error: null }) => T) {
    const rows = this.rows()
    if (this.head) rateQueries.push(this.conditions)
    return Promise.resolve({ data: rows, count: rows.length, error: null }).then(resolve)
  }

  private rows(): Row[] {
    const records = tables.get(this.table)
    assert.ok(records, `Unexpected admin table: ${this.table}`)
    if (this.inserting) {
      const row = {
        id: `${this.table}-${records.length + 1}`,
        ...(this.table === 'ai_run' ? { started_at: new Date().toISOString() } : {}),
        ...this.write
      }
      records.push(row)
      return [row]
    }
    const rows = records.filter((row) => this.filters.every((filter) => filter(row)))
    if (this.write) rows.forEach((row) => Object.assign(row, this.write))
    return rows
  }
}

function setup(scenario: Scenario) {
  tables.clear()
  for (const entries of [
    providerRequests,
    businessCalls,
    adminRpcCalls,
    createdClients,
    rateQueries
  ])
    entries.length = 0

  const authHeader = `Bearer ${scenario.id}-verified-token`
  const email = `${scenario.id}@example.invalid`
  const statementNo = `STATEMENT-${scenario.id}`
  const voucher = {
    payerName: '示例付款客户',
    payeeName: '示例收款承运商',
    transactionDate: '2026-11-01',
    amount: 100,
    bankReference: statementNo,
    paymentMethod: 'bank_transfer'
  }
  const payload = {
    rawText: '付款方：示例付款客户\n收款方：示例收款承运商\n金额：100.00',
    summary: '银行凭证识别完成，请核对付款方、收款方和金额。',
    confidence: 0.95,
    fieldConfidence: {
      payerName: 0.95,
      payeeName: 0.95,
      transactionDate: 0.95,
      amount: 0.99,
      bankReference: 0.9,
      paymentMethod: 0.9
    },
    missingFields: [],
    warnings: [],
    voucher
  }
  tables.set('sys_tenant', [{ id: platformTenant, tenant_code: 'platform' }])
  tables.set('sys_user', [
    {
      auth_user_id: scenario.id,
      tenant_id: scenario.tenant,
      user_email: email,
      status: '1',
      is_platform_super: scenario.actor === 'platform-super'
    }
  ])
  tables.set('ai_feature_config', [
    {
      tenant_id: scenario.tenant,
      feature,
      enabled: true,
      provider: 'openai_compatible',
      model: 'fixture-cash-model',
      vision_model: 'fixture-cash-vision',
      fallback_model: null,
      timeout_ms: 10000,
      max_retries: 0,
      temperature: 0,
      max_tokens: 3000,
      rate_limit_per_minute: 60,
      rate_limit_per_day: 1000,
      prompt_version: 'cash-fixture-v1'
    }
  ])
  tables.set('ai_prompt_template', [
    {
      tenant_id: scenario.tenant,
      feature,
      status: 'published',
      version: 'cash-fixture-v1',
      system_prompt: prompt
    }
  ])
  tables.set('ai_ocr_quality_threshold', [
    {
      tenant_id: scenario.tenant,
      feature,
      review_confidence_threshold: 0.84
    }
  ])
  tables.set('ai_run', [])
  tables.set('ai_artifact_review', [])

  const authClient = {
    auth: {
      getUser: async (token: string) => {
        assert.equal(token, `${scenario.id}-verified-token`)
        return { data: { user: { id: scenario.id } }, error: null }
      }
    }
  }
  const admin = {
    from: (table: string) => new Query(table),
    rpc: async (name: string) => {
      adminRpcCalls.push(name)
      assert.fail(`Business RPC must not use service role: ${name}`)
    }
  }
  const userClient: UserClient = {
    async rpc(name, input) {
      assert.equal(this, userClient, 'Use the original scoped client instance')
      businessCalls.push({ client: this, name, input })
      const receipt = scenario.direction === 'receipt'
      assert.equal(
        name,
        receipt
          ? 'tms_list_customer_statement_allocatable_secure'
          : 'tms_list_carrier_statement_allocatable_secure'
      )
      assert.deepEqual(input, {
        [receipt ? 'p_customer_id' : 'p_carrier_id']: null,
        p_keyword: null,
        p_from: 0,
        p_to: 79
      })
      // This sentinel proves client handoff, not database RLS or forged-scope enforcement.
      return {
        data: {
          records: [
            {
              id: `statement-${scenario.id}`,
              statement_no: statementNo,
              customer_id: `customer-${scenario.id}`,
              customer_name: voucher.payerName,
              carrier_id: `carrier-${scenario.id}`,
              carrier_name: voucher.payeeName,
              period_start: '2026-11-01',
              period_end: '2026-11-30',
              statement_amount: '150',
              settled_amount: '50',
              outstanding_amount: '100',
              create_time: '2026-11-01T08:00:00Z'
            }
          ]
        },
        error: null
      }
    }
  }
  return { scenario, authHeader, email, voucher, payload, authClient, admin, userClient }
}

function createClient(url: string, key: string, options: ClientOptions) {
  assert.ok(fixture, 'Set up a request before creating its clients')
  assert.equal(url, env.SUPABASE_URL)
  assert.deepEqual(options.auth, { autoRefreshToken: false, persistSession: false })
  if (key === env.SUPABASE_SERVICE_ROLE_KEY) {
    assert.equal(options.global, undefined)
    createdClients.push({ kind: 'admin', client: fixture.admin, options })
    return fixture.admin
  }
  assert.equal(key, env.SUPABASE_ANON_KEY)
  if (!options.global) {
    createdClients.push({ kind: 'auth', client: fixture.authClient, options })
    return fixture.authClient
  }
  assert.deepEqual(options.global.headers, {
    Authorization: fixture.authHeader,
    'x-art-tenant-scope': fixture.scenario.scope ?? ''
  })
  createdClients.push({ kind: 'user', client: fixture.userClient, options })
  return fixture.userClient
}

const testKey = Symbol.for('test.ai-cash-voucher-ocr')
const originalDeno = Object.getOwnPropertyDescriptor(globalThis, 'Deno')
const originalFetch = globalThis.fetch
Reflect.set(globalThis, testKey, { createClient })
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'jsr:@supabase/functions-js/edge-runtime.d.ts') {
      return { url: 'data:text/javascript,export%20%7B%7D', shortCircuit: true }
    }
    if (specifier === 'jsr:@supabase/supabase-js@2') {
      const source =
        'export const createClient = (...args) => globalThis[Symbol.for("test.ai-cash-voucher-ocr")].createClient(...args);'
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  }
})
Reflect.set(globalThis, 'Deno', {
  env: { get: (name: string) => env[name] },
  serve: (callback: Handler) => {
    handler = callback
  }
})
globalThis.fetch = async (url, init) => {
  assert.ok(fixture)
  assert.ok(init)
  assert.equal(url, `${providerHost}/chat/completions`)
  assert.equal(init.method, 'POST')
  assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer provider-test-key')
  const body: unknown = JSON.parse(String(init.body))
  assert.ok(body && typeof body === 'object' && !Array.isArray(body))
  providerRequests.push(body as Row)
  return Response.json({
    choices: [{ message: { role: 'assistant', content: JSON.stringify(fixture.payload) } }],
    usage: { prompt_tokens: 120, completion_tokens: 80 }
  })
}

test.after(() => {
  hooks.deregister()
  Reflect.deleteProperty(globalThis, testKey)
  if (originalDeno) Object.defineProperty(globalThis, 'Deno', originalDeno)
  else Reflect.deleteProperty(globalThis, 'Deno')
  globalThis.fetch = originalFetch
})

// Keep the real entry, createVisionOcrHandler and enrichResponse callback in the import graph.
await import('../../supabase/functions/ai-cash-voucher-ocr/index.ts')

const scenarios: Scenario[] = [
  {
    name: 'ordinary own-tenant receipt',
    id: 'ordinary-own',
    actor: 'ordinary',
    tenant: 'tenant-a',
    scope: 'tenant-a',
    direction: 'receipt'
  },
  {
    name: 'ordinary forged-scope payment keeps the user client',
    id: 'ordinary-forged',
    actor: 'ordinary',
    tenant: 'tenant-a',
    scope: 'tenant-b',
    direction: 'payment'
  },
  {
    name: 'platform-super selected-tenant receipt',
    id: 'super-selected',
    actor: 'platform-super',
    tenant: platformTenant,
    scope: 'tenant-b',
    direction: 'receipt'
  },
  {
    name: 'platform-super all-tenants payment preserves an absent scope',
    id: 'super-all',
    actor: 'platform-super',
    tenant: platformTenant,
    direction: 'payment'
  }
]

for (const scenario of scenarios) {
  test(scenario.name, { concurrency: false }, async (t) => {
    fixture = setup(scenario)
    assert.ok(handler, 'The actual cash Edge entry must register its handler')
    const headers = new Headers({
      Authorization: fixture.authHeader,
      'Content-Type': 'application/json'
    })
    if (scenario.scope !== undefined) headers.set('x-art-tenant-scope', scenario.scope)
    const response = await handler(
      new Request('https://edge.example.invalid/ai-cash-voucher-ocr', {
        method: 'POST',
        headers,
        body: JSON.stringify({ direction: scenario.direction, imageUrls: [imageUrl] })
      })
    )
    const result: unknown = await response.json()
    assert.ok(result && typeof result === 'object' && !Array.isArray(result))
    const body = result as Row
    const run = tables.get('ai_run')?.[0]
    assert.ok(run, 'Authentication, feature config, rate checks and prompt must reach ai_run')
    assert.equal(providerRequests.length, 1, 'A valid OCR response needs no repair/fallback')
    assert.equal(providerRequests[0].model, 'fixture-cash-vision')
    assert.deepEqual(providerRequests[0].response_format, { type: 'json_object' })
    assert.match(JSON.stringify(providerRequests[0].messages), /识别银行收付款凭证/)
    assert.match(JSON.stringify(providerRequests[0].messages), new RegExp(scenario.direction))
    assert.match(JSON.stringify(providerRequests[0].messages), /bank-receipt\.png/)
    assert.deepEqual(
      createdClients.map(({ kind }) => kind),
      ['auth', 'admin', 'user']
    )
    assert.equal(createdClients[2].client, fixture.userClient)
    assert.deepEqual(adminRpcCalls, [])
    assert.equal(rateQueries.length, 2)
    for (const conditions of rateQueries) {
      assert.deepEqual(conditions.slice(0, 2), [
        ['auth_user_id', scenario.id],
        ['feature', feature]
      ])
      assert.equal(conditions[2][0], 'started_at')
      assert.equal(typeof conditions[2][1], 'string')
    }
    assert.equal(run.auth_user_id, scenario.id)
    assert.equal(run.tenant_id, scenario.tenant)
    assert.equal(run.create_by, fixture.email)
    assert.equal(run.prompt_version, 'cash-fixture-v1')
    assert.deepEqual(run.metadata, {
      imageCount: 1,
      direction: scenario.direction,
      promptSource: 'database',
      providerChain: ['OpenAI Compatible']
    })
    if (response.status !== 200)
      t.diagnostic(
        JSON.stringify({
          status: response.status,
          body,
          userRpcCalls: businessCalls.length,
          providerRequests: providerRequests.length,
          auditStatus: run.status,
          auditError: run.error_message
        })
      )
    assert.equal(response.status, 200, 'A valid OCR result must reach the original user RPC')
    assert.equal(businessCalls.length, 1)
    assert.equal(businessCalls[0].client, fixture.userClient)
    assert.equal(body.evaluatedStatements, 1)
    assert.deepEqual(body.voucher, fixture.voucher)
    assert.deepEqual(body.missingFields, [])
    assert.deepEqual(body.warnings, [])
    assert.equal(body.rawText, fixture.payload.rawText)
    assert.ok(Array.isArray(body.matches))
    assert.equal(body.matches.length, 1)
    assert.deepEqual(body.matches[0], {
      statementId: `statement-${scenario.id}`,
      statementNo: `STATEMENT-${scenario.id}`,
      counterpartyId: `${scenario.direction === 'receipt' ? 'customer' : 'carrier'}-${scenario.id}`,
      counterpartyName:
        scenario.direction === 'receipt' ? fixture.voucher.payerName : fixture.voucher.payeeName,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      statementAmount: 150,
      settledAmount: 50,
      outstandingAmount: 100,
      createTime: '2026-11-01T08:00:00Z',
      score: 100,
      confidence: 1,
      recommendedAllocation: 100,
      reasons: [
        '凭证金额与未结金额一致',
        '往来单位名称一致',
        '交易日期位于对账账期内',
        '凭证附言包含对账单号'
      ]
    })
    assert.equal(run.status, 'succeeded')
    assert.equal(run.input_tokens, 120)
    assert.equal(run.output_tokens, 80)
    assert.equal(run.error_code, null)
    const artifacts = tables.get('ai_artifact_review')
    assert.equal(artifacts?.length, 1)
    assert.ok(artifacts)
    const artifact = artifacts[0]
    assert.equal(artifact.auth_user_id, scenario.id)
    assert.equal(
      artifact.tenant_id,
      scenario.tenant,
      'AI audit retains the authenticated app tenant'
    )
    assert.equal(artifact.create_by, fixture.email)
    assert.equal(artifact.update_by, fixture.email)
    assert.equal(artifact.ai_run_id, run.id)
    assert.equal(artifact.feature, feature)
    assert.equal(artifact.artifact_type, 'tms_cash_transaction_draft')
    assert.deepEqual(artifact.proposed_payload, fixture.voucher)
    assert.deepEqual(artifact.metadata, {
      imageCount: 1,
      imageUrls: [imageUrl],
      direction: scenario.direction,
      reviewConfidenceThreshold: 0.84
    })
    assert.equal(body.artifactId, artifact.id)
    assert.equal(body.runId, run.id)
    assert.equal(body.reviewConfidenceThreshold, 0.84)
  })
}
