import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyEqFilters,
  applyFilters,
  buildSpecsFromMap,
  camelToSnake,
  convertKeysToSnake,
  type FilterValue,
  type Op
} from '../../src/utils/supabase/filters'

interface QueryCall {
  column: string
  operation: Op
  value: unknown
}

class QueryRecorder {
  readonly calls: QueryCall[] = []

  private record(operation: Op, column: string, value: unknown): this {
    this.calls.push({ operation, column, value })
    return this
  }

  containedBy(column: string, value: unknown): this {
    return this.record('containedBy', column, value)
  }

  contains(column: string, value: unknown): this {
    return this.record('contains', column, value)
  }

  eq(column: string, value: unknown): this {
    return this.record('eq', column, value)
  }

  gt(column: string, value: unknown): this {
    return this.record('gt', column, value)
  }

  gte(column: string, value: unknown): this {
    return this.record('gte', column, value)
  }

  ilike(column: string, value: string): this {
    return this.record('ilike', column, value)
  }

  in(column: string, value: readonly unknown[]): this {
    return this.record('in', column, value)
  }

  is(column: string, value: unknown): this {
    return this.record('is', column, value)
  }

  like(column: string, value: string): this {
    return this.record('like', column, value)
  }

  lt(column: string, value: unknown): this {
    return this.record('lt', column, value)
  }

  lte(column: string, value: unknown): this {
    return this.record('lte', column, value)
  }

  neq(column: string, value: unknown): this {
    return this.record('neq', column, value)
  }

  overlaps(column: string, value: unknown): this {
    return this.record('overlaps', column, value)
  }

  textSearch(column: string, value: string): this {
    return this.record('textSearch', column, value)
  }
}

test('filter key helpers normalize camelCase without changing values', () => {
  assert.equal(camelToSnake('tenantUserId'), 'tenant_user_id')
  assert.deepEqual(convertKeysToSnake({ tenantId: 7, active: true }), {
    tenant_id: 7,
    active: true
  })
})

test('equality filters skip absent and blank values by default', () => {
  const query = applyEqFilters(new QueryRecorder(), {
    tenantId: 7,
    keyword: '   ',
    enabled: false,
    missing: null
  })

  assert.deepEqual(query.calls, [
    { operation: 'eq', column: 'tenant_id', value: 7 },
    { operation: 'eq', column: 'enabled', value: false }
  ])

  const literalQuery = applyEqFilters(
    new QueryRecorder(),
    { tenantId: 7, keyword: '' },
    { camelToSnake: false, skipEmpty: false }
  )
  assert.deepEqual(literalQuery.calls, [
    { operation: 'eq', column: 'tenantId', value: 7 },
    { operation: 'eq', column: 'keyword', value: '' }
  ])
})

test('structured filters dispatch every supported PostgREST operation safely', () => {
  const values: Record<Op, FilterValue> = {
    eq: 1,
    neq: 2,
    gt: 3,
    gte: 4,
    lt: 5,
    lte: 6,
    like: 'A%',
    ilike: '%alpha%',
    is: false,
    in: ['open', 'closed'],
    contains: ['finance'],
    containedBy: ['finance', 'operations'],
    overlaps: ['north'],
    textSearch: 'invoice'
  }
  const specs = (Object.entries(values) as Array<[Op, FilterValue]>).map(([operation, value]) => ({
    col: `${operation}Value`,
    op: operation,
    val: value
  }))

  const query = applyFilters(new QueryRecorder(), specs)

  assert.deepEqual(
    query.calls.map(({ operation, column }) => ({ operation, column })),
    (Object.keys(values) as Op[]).map((operation) => ({
      operation,
      column: camelToSnake(`${operation}Value`)
    }))
  )
  assert.deepEqual(query.calls.find(({ operation }) => operation === 'in')?.value, [
    'open',
    'closed'
  ])
})

test('map filters normalize descriptors, fallback operations and scalar in values', () => {
  const query = applyFilters(new QueryRecorder(), {
    displayName: { op: 'ilike', val: '%亿企%' },
    status: { op: 'unsupported' as Op, val: 'active' },
    id: { op: 'in', val: 9 },
    untouched: 3,
    blank: '',
    absent: undefined
  })

  assert.deepEqual(query.calls, [
    { operation: 'ilike', column: 'display_name', value: '%亿企%' },
    { operation: 'eq', column: 'status', value: 'active' },
    { operation: 'in', column: 'id', value: [9] },
    { operation: 'eq', column: 'untouched', value: 3 }
  ])
})

test('filter maps build stable specs with matching normalized operation keys', () => {
  assert.deepEqual(
    buildSpecsFromMap(
      { tenantId: 7, createdAt: '2026-08-23' },
      { tenantId: 'eq', createdAt: 'gte' }
    ),
    [
      { col: 'tenant_id', op: 'eq', val: 7 },
      { col: 'created_at', op: 'gte', val: '2026-08-23' }
    ]
  )
  assert.deepEqual(buildSpecsFromMap({ tenantId: 7 }, undefined, false), [
    { col: 'tenantId', op: 'eq', val: 7 }
  ])
})

test('inherited operator names fall back to equality without changing the query instance', () => {
  for (const operation of ['__proto__', 'constructor', 'toString']) {
    const query = new QueryRecorder()
    assert.equal(applyFilters(query, [{ col: 'status', op: operation, val: 'active' }]), query)
    assert.deepEqual(query.calls, [{ operation: 'eq', column: 'status', value: 'active' }])
  }
})

test('key conversion preserves special own keys without changing object prototypes', () => {
  const source = JSON.parse('{"__proto__":{"marker":true},"tenantId":7}')
  const converted = convertKeysToSnake(source)
  assert.equal(Object.getPrototypeOf(converted), Object.prototype)
  assert.equal(Object.hasOwn(converted, '__proto__'), true)
  assert.equal(converted.tenant_id, 7)
})

test('filter specs use only explicit operator mappings for special column names', () => {
  const filters: Filters = JSON.parse('{"__proto__":"active","constructor":"open"}')
  const operations: Record<string, Op> = JSON.parse('{"__proto__":"neq"}')
  assert.deepEqual(buildSpecsFromMap(filters, operations, false), [
    { col: '__proto__', op: 'neq', val: 'active' },
    { col: 'constructor', op: 'eq', val: 'open' }
  ])
  assert.deepEqual(buildSpecsFromMap(filters, operations), [
    { col: '__proto__', op: 'neq', val: 'active' },
    { col: 'constructor', op: 'eq', val: 'open' }
  ])
})
