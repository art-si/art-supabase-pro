import assert from 'node:assert/strict'
import test from 'node:test'
import { Script } from 'node:vm'
import {
  createSqlQueryApiRequestSnapshot,
  formatSqlQueryApiRequest,
  type SqlQueryApiRequestMetadata
} from '../../src/views/data-center/sql-console/modules/query-api-request'
import {
  sqlQueryApiExamples,
  sqlQueryApiParameters
} from '../../src/views/data-center/sql-console/modules/query-api-ui'
import type { SqlQueryApiDefinition, SqlQueryApiParameter } from '../../src/types/sql-query-api'
import { toObjectRecord } from '../../src/utils/record'

const metadata: SqlQueryApiRequestMetadata = {
  name: '订单查询',
  url: 'https://example.invalid/functions/v1/sql-query-api/orders',
  sentAt: '2026-11-01T10:20:30.123Z',
  definitionVersion: '2026-11-01T09:00:00.123456Z'
}

test('dispatch snapshot preserves normalized decimal text, false, string whitespace and omitted fields', () => {
  const definitions: SqlQueryApiParameter[] = [
    { name: 'amount', type: 'number', required: true },
    { name: 'enabled', type: 'boolean', required: true },
    { name: 'note', type: 'string', required: false },
    { name: 'optional', type: 'string', required: false }
  ]
  const params = sqlQueryApiParameters(definitions, {
    amount: ' 12345678901234567890.1234567890123456789 ',
    enabled: false,
    note: '  原始文本\n  ',
    optional: undefined,
    ignored: 'not-declared'
  })
  const snapshot = createSqlQueryApiRequestSnapshot(metadata, params)
  assert.deepEqual(JSON.parse(snapshot.body), {
    params: {
      amount: '12345678901234567890.1234567890123456789',
      enabled: false,
      note: '  原始文本\n  '
    }
  })
  assert.equal(snapshot.name, metadata.name)
  assert.equal(snapshot.sentAt, metadata.sentAt)
  assert.equal(snapshot.definitionVersion, metadata.definitionVersion)
  assert.equal(snapshot.url, metadata.url)
})

test('snapshot strings are independent of later parameter and public metadata edits and are frozen', () => {
  const current = { ...metadata }
  const params = { amount: '100.00', enabled: false }
  const snapshot = createSqlQueryApiRequestSnapshot(current, params)
  const original = JSON.stringify(snapshot)
  params.amount = '200.00'
  params.enabled = true
  current.name = '已编辑'
  current.url = 'https://example.invalid/other'
  current.sentAt = '2026-11-02T00:00:00Z'
  current.definitionVersion = 'changed'
  assert.equal(JSON.stringify(snapshot), original)
  assert.ok(Object.isFrozen(snapshot))
  assert.equal(Reflect.set(snapshot, 'body', 'changed'), false)
  assert.equal(JSON.stringify(snapshot), original)
})

test('snapshot selects only public metadata without reading private fields or serialization hooks', () => {
  const publicMetadata = { ...metadata }
  let privateReads = 0
  for (const key of [
    'sql',
    'tenantId',
    'allowedUserIds',
    'user',
    'session',
    'env',
    'token',
    'toJSON'
  ]) {
    Object.defineProperty(publicMetadata, key, {
      enumerable: true,
      get() {
        privateReads++
        throw new Error('private metadata must not be read')
      }
    })
  }
  const snapshot = createSqlQueryApiRequestSnapshot(publicMetadata, { amount: '12.00' })
  assert.equal(privateReads, 0)
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'body',
    'curl',
    'definitionVersion',
    'javascript',
    'name',
    'sentAt',
    'url'
  ])
  assert.match(snapshot.curl, /Authorization: Bearer YOUR_ACCESS_TOKEN/)
  assert.match(snapshot.curl, /apikey: YOUR_PUBLISHABLE_KEY/)
  assert.match(snapshot.javascript, /Authorization: 'Bearer YOUR_ACCESS_TOKEN'/)
  assert.match(snapshot.javascript, /apikey: 'YOUR_PUBLISHABLE_KEY'/)
})

test('normalized prototype-like names remain literal parameters in the request body', () => {
  const definitions: SqlQueryApiParameter[] = [
    { name: 'constructor', type: 'string', required: true },
    { name: '__proto__', type: 'string', required: true },
    { name: 'toJSON', type: 'boolean', required: true }
  ]
  const params = sqlQueryApiParameters(
    definitions,
    Object.fromEntries([
      ['constructor', 'literal-constructor'],
      ['__proto__', 'literal-prototype'],
      ['toJSON', false]
    ])
  )
  const snapshot = createSqlQueryApiRequestSnapshot(metadata, params)
  assert.deepEqual(JSON.parse(snapshot.body).params, params)
  assert.equal(Object.getPrototypeOf(params), Object.prototype)
})

test('copyable requests omit the dispatch request ID and accept an empty parameter object', () => {
  const snapshot = createSqlQueryApiRequestSnapshot(metadata, {})
  assert.deepEqual(JSON.parse(snapshot.body), { params: {} })
  assert.doesNotMatch(JSON.stringify(snapshot), /requestId/)
  const next = createSqlQueryApiRequestSnapshot({ ...metadata, sentAt: 'later' }, {})
  assert.equal(next.body, snapshot.body)
  assert.equal(next.curl, snapshot.curl)
  assert.equal(next.javascript, snapshot.javascript)
})

test('cURL keeps quotes, line breaks and shell metacharacters inside single-quoted arguments', () => {
  const params = {
    note: ["'quoted'", '$(touch never-run); `never-run` & | > $HOME "double" \\'].join('\n')
  }
  const url = "https://example.invalid/orders'endpoint"
  const request = formatSqlQueryApiRequest(url, params)
  const commandEnd = request.curl.indexOf(' \\\n')
  const quotedUrl = request.curl.slice('curl --request POST '.length, commandEnd)
  const quotedBody = request.curl.slice(request.curl.indexOf('  --data ') + '  --data '.length)
  for (const [quoted, original] of [
    [quotedUrl, url],
    [quotedBody, request.body]
  ]) {
    assert.equal(quoted[0], "'")
    assert.equal(quoted.at(-1), "'")
    const segments = quoted.slice(1, -1).split("'\\''")
    assert.ok(segments.every((segment) => !segment.includes("'")))
    assert.equal(segments.join("'"), original)
  }
  assert.deepEqual(JSON.parse(request.body), { params })
})

test('JavaScript snippet sends exact captured values and URL without executing embedded text', async () => {
  const params = Object.fromEntries([
    ['amount', '12345678901234567890.123456789'],
    ['enabled', false],
    ['empty', ''],
    ['nil', null],
    ['note', ['"}); globalThis.injected = true; //', "'$(never-run)'", '\\'].join('\n')],
    ['__proto__', 'literal-prototype'],
    ['constructor', 'literal-constructor'],
    ['toJSON', false]
  ])
  const url = 'https://example.invalid/orders"quoted'
  const { javascript } = formatSqlQueryApiRequest(url, params)
  const calls: {
    url: unknown
    method: unknown
    headers: Record<string, unknown>
    body: unknown
  }[] = []
  const context = {
    injected: false,
    fetch: async (receivedUrl: unknown, options: unknown) => {
      const request = toObjectRecord(options)
      assert.equal(typeof request.body, 'string')
      calls.push({
        url: receivedUrl,
        method: request.method,
        headers: { ...toObjectRecord(request.headers) },
        body: JSON.parse(request.body)
      })
      return { ok: true, json: async () => ({ rows: [] }) }
    },
    console: { log: () => undefined }
  }
  const completion: unknown = new Script(`(async () => {\n${javascript}\n})()`).runInNewContext(
    context,
    { timeout: 1000 }
  )
  await completion
  assert.equal(context.injected, false)
  assert.deepEqual(calls, [
    {
      url,
      method: 'POST',
      headers: {
        Authorization: 'Bearer YOUR_ACCESS_TOKEN',
        apikey: 'YOUR_PUBLISHABLE_KEY',
        'Content-Type': 'application/json'
      },
      body: { params }
    }
  ])
})

test('existing generic examples still use fixed typed samples rather than dispatch values', () => {
  const definition: SqlQueryApiDefinition = {
    id: 'private-id',
    slug: 'orders',
    name: '订单查询',
    description: '',
    sql: 'SELECT private_sql',
    tenantId: 'private-tenant',
    allowedUserIds: ['private-user'],
    parameters: [
      { name: 'amount', type: 'number', required: true },
      { name: 'enabled', type: 'boolean', required: true }
    ],
    maxRows: 20,
    timeoutMs: 5000,
    enabled: true,
    updatedAt: metadata.definitionVersion
  }
  const snapshot = createSqlQueryApiRequestSnapshot(metadata, { amount: '999.90', enabled: false })
  const examples = sqlQueryApiExamples(definition, metadata.url)
  assert.deepEqual(JSON.parse(examples.body), { params: { amount: '100.50', enabled: true } })
  assert.deepEqual(JSON.parse(snapshot.body), { params: { amount: '999.90', enabled: false } })
  assert.doesNotMatch(
    JSON.stringify(examples),
    /private_sql|private-tenant|private-user|private-id/
  )
  assert.ok(examples.curl.includes(' \\\n'))
})
