import assert from 'node:assert/strict'
import test from 'node:test'
import {
  sqlQueryApiExamples,
  sqlQueryApiParameters
} from '../../src/views/data-center/sql-console/modules/query-api-ui'
import type { SqlQueryApiDefinition, SqlQueryApiParameter } from '../../src/types/sql-query-api'

const parameters: SqlQueryApiParameter[] = [
  { name: 'amount', type: 'number', required: true },
  { name: 'enabled', type: 'boolean', required: true },
  { name: 'note', type: 'string', required: false },
  { name: 'date', type: 'date', required: false },
  { name: 'owner', type: 'uuid', required: false }
]

test('API test payload keeps numeric precision, false and user string whitespace while omitting blank optional fields', () => {
  const values = {
    amount: ' 12345678901234567890.1234567890123456789 ',
    enabled: false,
    note: '  user text  ',
    owner: '',
    ignored: 'not-declared'
  }
  assert.deepEqual(sqlQueryApiParameters(parameters, values), {
    amount: '12345678901234567890.1234567890123456789',
    enabled: false,
    note: '  user text  '
  })
  assert.equal(values.amount, ' 12345678901234567890.1234567890123456789 ')
})

test('API test parameters reject missing requirements and invalid typed values before network', () => {
  const valid = { amount: '1.5', enabled: true }
  for (const values of [
    { amount: '', enabled: true },
    { amount: 'NaN', enabled: true },
    { ...valid, enabled: 'false' },
    { ...valid, date: '2026-02-30' },
    { ...valid, owner: 'invalid' }
  ])
    assert.throws(() => sqlQueryApiParameters(parameters, values), /参数|请填写/)
  assert.equal(
    sqlQueryApiParameters(parameters, { ...valid, date: '2024-02-29' }).date,
    '2024-02-29'
  )
})

test('API parameters read literal own constructor, prototype and Vue-like keys without prototype coercion', () => {
  const definitions: SqlQueryApiParameter[] = [
    { name: 'constructor', type: 'string', required: true },
    { name: '__proto__', type: 'string', required: true },
    { name: '__v_raw', type: 'boolean', required: true }
  ]
  const values = Object.fromEntries([
    ['constructor', 'literal-constructor'],
    ['__proto__', 'literal-prototype'],
    ['__v_raw', false]
  ])
  const result = sqlQueryApiParameters(definitions, values)
  assert.deepEqual(Object.entries(result), Object.entries(values))
  assert.equal(Object.getPrototypeOf(result), Object.prototype)
  assert.equal(Object.getOwnPropertyDescriptor(result, '__proto__')?.value, 'literal-prototype')
  assert.throws(() => sqlQueryApiParameters(definitions, {}), /请填写参数 constructor/)
})

test('API parameters never execute accessors or read inherited field values', () => {
  let getterCalls = 0
  const values = Object.create({ inherited: 'inherited-value' })
  Object.defineProperty(values, 'accessor', {
    enumerable: true,
    get() {
      getterCalls++
      throw new Error('must never execute')
    }
  })
  const definitions: SqlQueryApiParameter[] = [
    { name: 'accessor', type: 'string', required: false },
    { name: 'inherited', type: 'string', required: false }
  ]
  assert.deepEqual(sqlQueryApiParameters(definitions, values), {})
  assert.throws(
    () => sqlQueryApiParameters([{ ...definitions[0], required: true }], values),
    /请填写参数 accessor/
  )
  assert.equal(getterCalls, 0)
})

test('API examples contain only token placeholders and typed generic data', () => {
  const definition: SqlQueryApiDefinition = {
    id: 'id',
    slug: 'orders',
    name: 'Orders',
    sql: 'select secret from private',
    description: '',
    tenantId: 'tenant',
    allowedUserIds: ['private-user'],
    enabled: true,
    updatedAt: '',
    parameters,
    maxRows: 200,
    timeoutMs: 10000
  }
  const examples = sqlQueryApiExamples(
    definition,
    'https://example.invalid/functions/v1/sql-query-api/orders'
  )
  assert.match(examples.curl, /Bearer YOUR_ACCESS_TOKEN/)
  assert.match(examples.javascript, /Bearer YOUR_ACCESS_TOKEN/)
  assert.match(examples.curl, /apikey: YOUR_PUBLISHABLE_KEY/)
  assert.match(examples.javascript, /apikey: 'YOUR_PUBLISHABLE_KEY'/)
  assert.doesNotMatch(JSON.stringify(examples), /private-user|select secret/)
  assert.deepEqual(JSON.parse(examples.body).params, {
    amount: '100.50',
    enabled: true,
    note: '示例值',
    date: '2026-01-01',
    owner: '00000000-0000-4000-8000-000000000001'
  })
  assert.ok(examples.curl.includes(' \\\n'))
  assert.doesNotThrow(
    () =>
      new Function(
        examples.javascript
          .replace('await fetch', 'fetch')
          .replace('await response.json()', 'response.json()')
      )
  )
})
