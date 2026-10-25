import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSupabaseRpcRange,
  buildSupabasePageRange,
  withSupabaseTableRange,
  fetchAllRangePages,
  type SupabaseRange
} from '../../src/utils/supabase/pagination'

test('page ranges reject invalid pages and integer overflow', () => {
  assert.deepEqual(buildSupabasePageRange({ current: 2, size: 2 ** 52 }), {
    from: 2 ** 52,
    to: Number.MAX_SAFE_INTEGER
  })
  assert.throws(
    () => buildSupabasePageRange({ current: 3, size: 3002399751580331 }),
    /分页范围无效/
  )
  assert.deepEqual(buildSupabasePageRange({ current: 1, size: 20 }), { from: 0, to: 19 })
  assert.deepEqual(buildSupabasePageRange({ current: 4, size: 20 }), { from: 60, to: 79 })
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildSupabasePageRange({ current: value, size: 20 }), /分页范围无效/)
    assert.throws(() => buildSupabasePageRange({ current: 1, size: value }), /分页范围无效/)
  }
  assert.throws(
    () => buildSupabasePageRange({ current: Number.MAX_SAFE_INTEGER, size: 2 }),
    /分页范围无效/
  )
})

test('table range conversion accepts both pagination key pairs and preserves filters', () => {
  assert.deepEqual(withSupabaseTableRange({ current: 3, size: 10, status: 'draft' }), {
    current: 3,
    size: 10,
    status: 'draft',
    from: 20,
    to: 29
  })
  assert.deepEqual(withSupabaseTableRange({ page: 2, pageSize: 5, keyword: 'A' }), {
    page: 2,
    pageSize: 5,
    keyword: 'A',
    from: 5,
    to: 9
  })
  assert.deepEqual(withSupabaseTableRange({ status: 'all' }), {
    status: 'all',
    from: 0,
    to: 19
  })
  assert.throws(() => withSupabaseTableRange({ current: 0, size: 10 }), /分页范围无效/)
})

test('RPC ranges remain inclusive and ordered after clamping negative offsets', () => {
  assert.deepEqual(buildSupabaseRpcRange(20, 39), { p_from: 20, p_to: 39 })
  assert.deepEqual(buildSupabaseRpcRange(-10, -5), { p_from: 0, p_to: 0 })
  assert.deepEqual(buildSupabaseRpcRange(-10, 9), { p_from: 0, p_to: 9 })
  assert.deepEqual(buildSupabaseRpcRange(20, 9), { p_from: 20, p_to: 20 })
  for (const value of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildSupabaseRpcRange(value, 9), /分页范围无效/)
    assert.throws(() => buildSupabaseRpcRange(0, value), /分页范围无效/)
  }
})

test('collects every range until the final partial page', async () => {
  const source = ['A', 'B', 'C', 'D', 'E']
  const ranges: SupabaseRange[] = []

  const result = await fetchAllRangePages(
    async (range) => {
      ranges.push(range)
      return {
        data: source.slice(range.from, range.to + 1),
        error: null
      }
    },
    { pageSize: 2 }
  )

  assert.deepEqual(ranges, [
    { from: 0, to: 1 },
    { from: 2, to: 3 },
    { from: 4, to: 5 }
  ])
  assert.deepEqual(result, { data: source, error: null, total: source.length })
})

test('returns the original page error without exposing partial data', async () => {
  const expectedError = new Error('request failed')
  let callCount = 0

  const result = await fetchAllRangePages(
    async () => {
      callCount += 1
      return callCount === 1
        ? { data: ['A', 'B'], error: null }
        : { data: null, error: expectedError }
    },
    { pageSize: 2 }
  )

  assert.equal(callCount, 2)
  assert.equal(result.data, null)
  assert.equal(result.error, expectedError)
  assert.equal(result.total, 2)
})

test('rejects invalid page sizes before querying', async () => {
  let calls = 0
  for (const pageSize of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      fetchAllRangePages(
        async () => {
          calls += 1
          return { data: [], error: null }
        },
        { pageSize }
      ),
      /分页大小必须是正整数/
    )
  }
  assert.equal(calls, 0)
})

test('collects large pages without exceeding the function argument limit', async () => {
  const data = Array.from({ length: 200_000 }, (_, index) => index)
  const result = await fetchAllRangePages(async () => ({ data, error: null }), {
    pageSize: data.length + 1
  })
  assert.equal(result.error, null)
  assert.equal(result.total, data.length)
  assert.equal(result.data?.[0], 0)
  assert.equal(result.data?.at(-1), data.length - 1)
})
