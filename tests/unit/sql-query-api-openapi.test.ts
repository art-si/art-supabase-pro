import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSqlQueryApiOpenApi,
  queryApiOpenApiFileName,
  SqlQueryApiOpenApiError,
  type SqlQueryApiOpenApiDocument,
  type SqlQueryApiOpenApiSchema
} from '../../src/views/data-center/sql-console/modules/query-api-openapi'
import type { SqlQueryApiDefinition, SqlQueryApiParameter } from '../../src/types/sql-query-api'
import { bindParameters } from '../../supabase/functions/sql-query-api/policy'

const url = 'https://example.invalid/functions/v1/sql-query-api/public-report'
const parameters: SqlQueryApiParameter[] = [
  { name: 'amount', type: 'number', required: true },
  { name: 'note', type: 'string', required: true },
  { name: 'enabled', type: 'boolean', required: false },
  { name: 'day', type: 'date', required: false },
  { name: 'owner', type: 'uuid', required: false }
]
const precise = '12345678901234567890.1234567890123456789'

function definition(overrides: Partial<SqlQueryApiDefinition> = {}): SqlQueryApiDefinition {
  return {
    id: 'private-definition-id',
    slug: 'public-report',
    name: '公开报表接口',
    description: '公开的查询说明',
    sql: 'private-query-must-not-appear',
    tenantId: 'private-tenant-id',
    allowedUserIds: ['private-granted-user'],
    parameters: parameters.map((parameter) => ({ ...parameter })),
    maxRows: 200,
    timeoutMs: 10000,
    enabled: true,
    updatedAt: 'private-update-version',
    ...overrides
  }
}

function requestSchema(document: SqlQueryApiOpenApiDocument): SqlQueryApiOpenApiSchema {
  return Object.values(document.paths)[0].post.requestBody.content['application/json'].schema
}

function parameterSchema(
  document: SqlQueryApiOpenApiDocument,
  name: string
): SqlQueryApiOpenApiSchema {
  const value = requestSchema(document).properties?.params.properties?.[name]
  assert.ok(value, `Declared schema for ${name}`)
  return value
}

function hasNull(schema: SqlQueryApiOpenApiSchema): boolean {
  return schema.type === 'null' || Boolean(schema.anyOf?.some(hasNull))
}

test('OpenAPI 3.1 exports one exact public POST endpoint with AND authentication and fixed examples', () => {
  const document = buildSqlQueryApiOpenApi(definition(), url)
  assert.equal(document.openapi, '3.1.0')
  assert.equal(document.info.version, '1.0.0')
  assert.equal(document.info.title, '公开报表接口')
  assert.deepEqual(document.servers, [{ url: 'https://example.invalid' }])
  assert.deepEqual(Object.keys(document.paths), ['/functions/v1/sql-query-api/public-report'])
  const path = Object.values(document.paths)[0]
  assert.deepEqual(Object.keys(path), ['post'])
  assert.deepEqual(document.security, [{ BearerAuth: [], ProjectApiKey: [] }])
  assert.deepEqual(document.components.securitySchemes.BearerAuth, {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: '使用调用账号的有效访问令牌；接入时替换 YOUR_ACCESS_TOKEN，不包含当前登录凭据。'
  })
  assert.equal(document.components.securitySchemes.ProjectApiKey.in, 'header')
  assert.equal(document.components.securitySchemes.ProjectApiKey.name, 'apikey')
  assert.match(
    document.components.securitySchemes.ProjectApiKey.description,
    /YOUR_PUBLISHABLE_KEY/
  )
  assert.deepEqual(path.post.requestBody.content['application/json'].example, {
    params: {
      amount: '100.50',
      note: '示例值',
      enabled: true,
      day: '2026-01-01',
      owner: '00000000-0000-4000-8000-000000000001'
    }
  })
  assert.equal(document['x-query-api-max-rows'], 200)
  assert.equal(document['x-query-api-timeout-ms'], 10000)
})

test('request required fields and optional NULL exactly follow server binding, including empty required strings', () => {
  const document = buildSqlQueryApiOpenApi(definition(), url)
  const body = requestSchema(document)
  assert.deepEqual(body.required, ['params'])
  assert.equal(body.additionalProperties, false)
  assert.deepEqual(body.properties?.params.required, ['amount', 'note'])
  assert.equal(body.properties?.params.additionalProperties, false)
  for (const parameter of parameters) {
    const schema = parameterSchema(document, parameter.name)
    assert.equal(hasNull(schema), !parameter.required)
    if (parameter.required) {
      assert.throws(() => bindParameters([parameter], [parameter.name], {}), /必填/)
      assert.throws(
        () => bindParameters([parameter], [parameter.name], { [parameter.name]: null }),
        /必填/
      )
    } else {
      assert.deepEqual(bindParameters([parameter], [parameter.name], {}), [null])
      assert.deepEqual(bindParameters([parameter], [parameter.name], { [parameter.name]: null }), [
        null
      ])
    }
  }
  assert.deepEqual(
    bindParameters(
      parameters,
      parameters.map(({ name }) => name),
      { amount: precise, note: '' }
    ),
    [precise, '', null, null, null]
  )
  assert.equal(parameterSchema(document, 'note').type, 'string')
})

test('all-optional and parameterless APIs permit omitted params while keeping a JSON object body', () => {
  for (const input of [parameters.map((parameter) => ({ ...parameter, required: false })), []]) {
    const document = buildSqlQueryApiOpenApi(definition({ parameters: input }), url)
    assert.equal(Object.values(document.paths)[0].post.requestBody.required, true)
    assert.equal(requestSchema(document).required, undefined)
    assert.deepEqual(requestSchema(document).properties?.params.required, [])
    assert.deepEqual(
      bindParameters(
        input,
        input.map(({ name }) => name),
        {}
      ),
      input.map(() => null)
    )
  }
})

test('decimal text constraints agree with the server without converting precision or widening exponent limits', () => {
  const document = buildSqlQueryApiOpenApi(definition(), url)
  const branches = parameterSchema(document, 'amount').anyOf
  assert.ok(branches)
  assert.equal(branches.length, 2)
  const [text, number] = branches
  assert.equal(text.type, 'string')
  assert.equal(text.maxLength, 128)
  assert.equal(number.type, 'number')
  assert.equal(number.minimum, -Number.MAX_SAFE_INTEGER)
  assert.equal(number.maximum, Number.MAX_SAFE_INTEGER)
  assert.ok(text.pattern)
  const pattern = new RegExp(text.pattern)
  const numeric: SqlQueryApiParameter = { name: 'amount', type: 'number', required: true }
  for (const value of [precise, '0', '+1.', '-.5', '1e-999', '1'.repeat(128)]) {
    assert.ok(pattern.test(value) && value.length <= 128)
    assert.deepEqual(bindParameters([numeric], ['amount'], { amount: value }), [value])
  }
  for (const value of [' 1 ', '', 'NaN', 'Infinity', '1e1000', '1_000', '1'.repeat(129)]) {
    assert.equal(pattern.test(value) && value.length <= 128, false)
    assert.throws(() => bindParameters([numeric], ['amount'], { amount: value }))
  }
  for (const value of [-Number.MAX_SAFE_INTEGER, 0.125, 1.5, Number.MAX_SAFE_INTEGER])
    assert.deepEqual(bindParameters([numeric], ['amount'], { amount: value }), [value])
  for (const value of [Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER - 1, NaN, Infinity])
    assert.throws(() => bindParameters([numeric], ['amount'], { amount: value }))
  assert.equal(
    Object.values(document.paths)[0].post.requestBody.content['application/json'].example.params
      .amount,
    '100.50'
  )
})

test('string limits disclose actual UTF16 units instead of claiming Unicode maxLength semantics', () => {
  const document = buildSqlQueryApiOpenApi(definition(), url)
  const text = parameterSchema(document, 'note')
  assert.equal(text['x-max-utf16-length'], 10000)
  assert.equal(text.maxLength, undefined)
  assert.match(text.description ?? '', /UTF-16/)
  const parameter: SqlQueryApiParameter = { name: 'note', type: 'string', required: true }
  for (const value of ['', '  保留空白  ', 'x'.repeat(10000), '😀'.repeat(5000)])
    assert.deepEqual(bindParameters([parameter], ['note'], { note: value }), [value])
  assert.throws(() => bindParameters([parameter], ['note'], { note: 'x'.repeat(10001) }))
  assert.throws(() => bindParameters([parameter], ['note'], { note: '😀'.repeat(5001) }))
})

test('boolean, date, UUID and request IDs expose actual wire formats without string coercion', () => {
  const definitions: SqlQueryApiParameter[] = ['boolean', 'date', 'uuid'].map((type, index) => ({
    name: `p${index}`,
    type: type === 'boolean' ? 'boolean' : type === 'date' ? 'date' : 'uuid',
    required: true
  }))
  const document = buildSqlQueryApiOpenApi(definition({ parameters: definitions }), url)
  assert.equal(parameterSchema(document, 'p0').type, 'boolean')
  assert.equal(parameterSchema(document, 'p1').format, 'date')
  assert.equal(parameterSchema(document, 'p2').format, 'uuid')
  assert.deepEqual(
    bindParameters(definitions, ['p0', 'p1', 'p2'], {
      p0: false,
      p1: '2024-02-29',
      p2: '00000000-0000-0000-0000-000000000000'
    }),
    [false, '2024-02-29', '00000000-0000-0000-0000-000000000000']
  )
  for (const date of ['0000-01-01', '2026-02-30', ' 2024-02-29 ', '2024-02-29T00:00:00Z'])
    assert.throws(() => bindParameters([definitions[1]], ['p1'], { p1: date }))
  for (const value of [0, 'false'])
    assert.throws(() => bindParameters([definitions[0]], ['p0'], { p0: value }))
  assert.ok(requestSchema(document).properties?.requestId.pattern)
  assert.equal(requestSchema(document).properties?.requestId.format, 'uuid')
  assert.equal(requestSchema(document).required?.includes('requestId'), false)
})

test('public projection never reads SQL, IDs, tenant grants, session values or private getters', () => {
  let privateReads = 0
  const input = definition()
  for (const key of [
    'id',
    'sql',
    'tenantId',
    'allowedUserIds',
    'updatedAt',
    'token',
    'results',
    'values'
  ])
    Object.defineProperty(input, key, {
      enumerable: true,
      get() {
        privateReads++
        throw new Error(`private ${key}`)
      }
    })
  Object.freeze(input.parameters)
  Object.freeze(input)
  const document = buildSqlQueryApiOpenApi(input, url)
  assert.equal(privateReads, 0)
  const raw = JSON.stringify(document)
  assert.doesNotMatch(
    raw,
    /private-definition-id|private-query-must-not-appear|private-tenant-id|private-granted-user|private-update-version/
  )
  assert.doesNotMatch(raw, /definitionId|allowedUserIds/)
  assert.equal(
    document.components.schemas.QueryApiSuccess.properties?.rows.items?.additionalProperties,
    true
  )
  assert.equal(
    document.components.schemas.QueryApiSuccess.properties?.rows.items?.properties,
    undefined
  )
})

test('demo examples reuse canonical public teaching inputs without inspecting the original SQL', () => {
  let sqlReads = 0
  const input = definition({
    slug: 'demo-hello',
    parameters: [{ name: 'name', type: 'string', required: true }]
  })
  Object.defineProperty(input, 'sql', {
    get() {
      sqlReads++
      return 'private and unrelated SQL'
    }
  })
  const document = buildSqlQueryApiOpenApi(
    input,
    'https://example.invalid/functions/v1/sql-query-api/demo-hello'
  )
  assert.deepEqual(
    Object.values(document.paths)[0].post.requestBody.content['application/json'].example.params,
    { name: '亿企工场' }
  )
  assert.equal(sqlReads, 0)
})

test('literal prototype and constructor parameter names remain own schema and example fields', () => {
  const input = definition({
    parameters: [
      { name: '__proto__', type: 'string', required: true },
      { name: 'constructor', type: 'boolean', required: true },
      { name: '__v_raw', type: 'string', required: false }
    ]
  })
  const document = buildSqlQueryApiOpenApi(input, url)
  const properties = requestSchema(document).properties?.params.properties
  assert.ok(properties)
  assert.equal(Object.getPrototypeOf(properties), Object.prototype)
  assert.equal(Object.hasOwn(properties, '__proto__'), true)
  assert.equal(properties.constructor.type, 'boolean')
  const example = Object.values(document.paths)[0].post.requestBody.content['application/json']
    .example.params
  assert.deepEqual(Object.keys(example), ['__proto__', 'constructor', '__v_raw'])
  assert.deepEqual(
    bindParameters(
      input.parameters,
      input.parameters.map(({ name }) => name),
      example
    ),
    ['示例值', true, '示例值']
  )
})

test('HTTP 200 models success and cancellation separately, with honest error envelopes and row metadata', () => {
  const document = buildSqlQueryApiOpenApi(definition(), url)
  const responses = Object.values(document.paths)[0].post.responses
  assert.deepEqual(responses['200'].content['application/json'].schema.oneOf, [
    { $ref: '#/components/schemas/QueryApiSuccess' },
    { $ref: '#/components/schemas/QueryApiCancelled' }
  ])
  const schemas = document.components.schemas
  assert.equal(schemas.QueryApiSuccess.properties?.status.const, 'ok')
  assert.equal(schemas.QueryApiCancelled.properties?.status.const, 'cancelled')
  assert.deepEqual(schemas.QueryApiSuccess.required, [
    'status',
    'rows',
    'columns',
    'rowCount',
    'truncated',
    'durationMs',
    'maxRows',
    'timeoutMs'
  ])
  assert.deepEqual(schemas.QueryApiCancelled.required, ['status', 'message', 'durationMs'])
  assert.equal(schemas.QueryApiSuccess.properties?.rowCount.minimum, 0)
  assert.equal(schemas.QueryApiSuccess.properties?.rows.maxItems, 200)
  assert.equal(schemas.QueryApiSuccess.properties?.columns.items?.properties?.name.type, 'string')
  assert.ok(responses['401'].content['application/json'].schema.anyOf)
  assert.deepEqual(schemas.GatewayError.properties?.code.anyOf, [
    { type: 'string' },
    { type: 'number' }
  ])
  assert.deepEqual(schemas.GatewayError.required, ['message'])
  assert.equal(responses.default.content['text/plain'].schema.type, 'string')
  assert.match(responses.default.description, /不保证|非 JSON/)
})

test('disabled public API state and configured limits are visible without an internal definition version', () => {
  const document = buildSqlQueryApiOpenApi(
    definition({ enabled: false, maxRows: 20, timeoutMs: 5000 }),
    url
  )
  assert.equal(document['x-query-api-enabled'], false)
  assert.equal(document['x-query-api-max-rows'], 20)
  assert.equal(document['x-query-api-timeout-ms'], 5000)
  assert.match(Object.values(document.paths)[0].post.description, /当前已停用/)
  assert.equal(document.components.schemas.QueryApiSuccess.properties?.rows.maxItems, 20)
})

test('HTTPS and loopback HTTP URLs preserve origin, port and the complete concrete endpoint path', () => {
  for (const host of [
    'https://example.invalid',
    'http://localhost:4319',
    'http://127.0.0.1:3006',
    'http://[::1]:3006'
  ]) {
    const document = buildSqlQueryApiOpenApi(
      definition(),
      `${host}/proxy/functions/v1/sql-query-api/public-report`
    )
    assert.deepEqual(document.servers, [{ url: host }])
    assert.deepEqual(Object.keys(document.paths), [
      '/proxy/functions/v1/sql-query-api/public-report'
    ])
  }
  assert.equal(queryApiOpenApiFileName('public-report'), 'public-report.openapi.json')
})

test('unsafe, ambiguous and mismatched endpoint URLs fail without echoing supplied credentials', () => {
  const invalid = [
    'https://secret-user:secret-password@example.invalid/functions/v1/sql-query-api/public-report',
    'https://@example.invalid/functions/v1/sql-query-api/public-report',
    `${url}?apikey=private-key`,
    `${url}#token`,
    `${url}#`,
    `${url}?`,
    'http://example.invalid/functions/v1/sql-query-api/public-report',
    'ftp://example.invalid/functions/v1/sql-query-api/public-report',
    '//example.invalid/functions/v1/sql-query-api/public-report',
    `${url}/`,
    `${url}/extra`,
    url.replace('public-report', 'other-report'),
    url.replace('public-report', '{slug}'),
    url.replace('public-report', '%7Bslug%7D'),
    url.replace('/v1/', '/../v1/'),
    url.replace('/v1/', '/./v1/'),
    url.replace('/v1/', '\\v1/'),
    ` ${url}`,
    `${url}\n`,
    'https://example.invalid/not-the-query-function/public-report'
  ]
  for (const input of invalid)
    assert.throws(
      () => buildSqlQueryApiOpenApi(definition(), input),
      (error: unknown) =>
        error instanceof SqlQueryApiOpenApiError && !/secret|private-key/.test(error.message)
    )
})

test('malformed public metadata, duplicate names and public accessors fail without invoking getters', () => {
  for (const input of [
    definition({ slug: '../unsafe' }),
    definition({ name: '' }),
    definition({ description: 'x'.repeat(501) }),
    definition({ maxRows: 0 }),
    definition({ timeoutMs: 30001 }),
    definition({ parameters: [parameters[0], parameters[0]] }),
    definition({ parameters: [{ ...parameters[0], name: 'literal.dot' }] })
  ])
    assert.throws(() => buildSqlQueryApiOpenApi(input, url), SqlQueryApiOpenApiError)
  let calls = 0
  const accessor = definition()
  Object.defineProperty(accessor, 'name', {
    get() {
      calls++
      return 'bad getter'
    }
  })
  assert.throws(() => buildSqlQueryApiOpenApi(accessor, url), SqlQueryApiOpenApiError)
  const parameter = definition()
  Object.defineProperty(parameter.parameters[0], 'required', {
    get() {
      calls++
      return true
    }
  })
  assert.throws(() => buildSqlQueryApiOpenApi(parameter, url), SqlQueryApiOpenApiError)
  const inherited = definition()
  Object.setPrototypeOf(inherited, {
    get name() {
      calls++
      return 'inherited title'
    }
  })
  Reflect.deleteProperty(inherited, 'name')
  assert.throws(() => buildSqlQueryApiOpenApi(inherited, url), SqlQueryApiOpenApiError)
  const indexed = definition()
  Object.defineProperty(indexed.parameters, '0', {
    get() {
      calls++
      return parameters[0]
    }
  })
  assert.throws(() => buildSqlQueryApiOpenApi(indexed, url), SqlQueryApiOpenApiError)
  assert.equal(calls, 0)
  for (const slug of ['aa', 'Uppercase', '../unsafe', 'name/path', 'has space', 'x'.repeat(65)])
    assert.throws(() => queryApiOpenApiFileName(slug), SqlQueryApiOpenApiError)
})
