import assert from 'node:assert/strict'
import test from 'node:test'
import { TableCache } from '../../src/utils/table/table-cache'
import {
  createErrorHandler,
  createSmartDebounce,
  defaultResponseAdapter,
  loadTableExportRows,
  updatePaginationFromResponse
} from '../../src/utils/table/table-utils'

test('pagination uses the server page size before clamping the current page', () => {
  const pagination = { current: 8, size: 10, total: 100 }
  updatePaginationFromResponse(pagination, { current: 8, size: 25, total: 100 })
  assert.deepEqual(pagination, { current: 4, size: 25, total: 100 })
  updatePaginationFromResponse(pagination, { current: 2, size: 5, total: 12 })
  assert.deepEqual(pagination, { current: 2, size: 5, total: 12 })
  updatePaginationFromResponse(pagination, { total: 0 })
  assert.deepEqual(pagination, { current: 1, size: 5, total: 0 })
})

test('table exports page complete filtered results using custom pagination keys', async () => {
  const query = { keyword: '原筛选', range: ['2026-01-01', '2026-02-01'] }
  const requests: Record<string, unknown>[] = []
  const rows = await loadTableExportRows<number>(
    async (params) => {
      requests.push(params)
      query.keyword = '后改筛选'
      query.range[0] = '2026-03-01'
      const offset = (Number(params.page) - 1) * Number(params.limit)
      return {
        rows: Array.from({ length: Math.min(500, 1001 - offset) }, (_, i) => offset + i),
        count: 1001
      }
    },
    query,
    10000,
    { current: 'page', size: 'limit' }
  )
  assert.equal(rows.length, 1001)
  assert.equal(rows.at(-1), 1000)
  assert.deepEqual(
    requests.map(({ page, limit, keyword, range }) => ({ page, limit, keyword, range })),
    [1, 2, 3].map((page) => ({
      page,
      limit: 500,
      keyword: '原筛选',
      range: ['2026-01-01', '2026-02-01']
    }))
  )
})

test('table exports without a total continue beyond full pages', async () => {
  let calls = 0
  const rows = await loadTableExportRows<number>(
    async () => {
      calls++
      return Array.from({ length: calls === 1 ? 500 : 1 }, (_, i) => i)
    },
    {},
    1000
  )
  assert.equal(rows.length, 501)
  assert.equal(calls, 2)
})

test('table exports reject malformed envelopes and invalid totals', async () => {
  for (const response of [null, undefined, {}, { data: null }]) {
    await assert.rejects(
      loadTableExportRows(async () => response, {}, 1000),
      /导出数据格式无效/
    )
  }
  for (const total of [NaN, Infinity, -1, 1.5, '1000']) {
    await assert.rejects(
      loadTableExportRows(async () => ({ rows: [1], total }), {}, 1000),
      /数据总数无效/
    )
  }
  assert.deepEqual(await loadTableExportRows(async () => ({ rows: [], total: 0 }), {}, 1000), [])
})

test('table exports reject over-limit, incomplete and failed pages', async () => {
  let calls = 0
  await assert.rejects(
    loadTableExportRows(
      async () => {
        calls++
        return { rows: [1], total: 10001 }
      },
      {},
      10000
    ),
    /不能超过 10000 行/
  )
  assert.equal(calls, 1)
  await assert.rejects(
    loadTableExportRows(
      async ({ current }) => ({
        rows: current === 1 ? Array.from({ length: 500 }, (_, i) => i) : [],
        total: 501
      }),
      {},
      1000
    ),
    /未完整加载/
  )
  const failure = new Error('读取失败')
  await assert.rejects(
    loadTableExportRows(async () => ({ error: failure }), {}, 1000),
    failure
  )
})

test('table errors keep diagnostics while showing a readable message', () => {
  const handleError = createErrorHandler()
  const technicalError = new Error('relation missing in PostgREST')
  const tableError = handleError(technicalError, '获取表格数据失败')

  assert.equal(tableError.code, 'Error')
  assert.equal(tableError.message, '获取表格数据失败，请刷新后重试')
  assert.equal(tableError.details, technicalError)
  assert.equal(handleError(new Error('站点编码重复'), '获取表格数据失败').message, '站点编码重复')
})

test('cache enforces capacity and evicts least recent rather than least frequent entries', () => {
  const cache = new TableCache<number>(1000, 2)
  cache.set('a', [1], {})
  for (let i = 0; i < 10; i++) cache.get('a')
  cache.set('b', [2], {})
  cache.set('c', [3], {})
  assert.equal(cache.getStats().total, 2)
  assert.equal(cache.get('a'), null)
  assert.deepEqual(cache.get('b')?.data, [2])
  cache.set('d', [4], {})
  assert.equal(cache.get('c'), null)
  cache.set('b', [20], {})
  assert.equal(cache.getStats().total, 2)
  assert.deepEqual(cache.get('b')?.data, [20])
})

test('cache expires at the TTL boundary and removes expired entries before live ones', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 })
  const cache = new TableCache<number>(100, 2)
  cache.set('a', [], {})
  t.mock.timers.tick(50)
  cache.set('b', [], {})
  cache.get('a')
  t.mock.timers.tick(50)
  cache.set('c', [], {})
  assert.equal(cache.get('a'), null)
  assert.ok(cache.get('b'))
  assert.ok(cache.get('c'))
  t.mock.timers.tick(100)
  assert.equal(cache.cleanupExpired(), 2)
})

test('cache validates bounds, supports disabled caching, and accepts unknown parameters', () => {
  for (const capacity of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => new TableCache(100, capacity), RangeError)
  }
  for (const ttl of [-1, NaN, Infinity]) assert.throws(() => new TableCache(ttl), RangeError)
  const disabled = new TableCache(100, 0)
  disabled.set(null, [], {})
  assert.equal(disabled.getStats().total, 0)
  const cache = new TableCache()
  cache.set(null, [], {})
  assert.ok(cache.get(null))
})

test('cache tags are stable for reordered and structured filters and match exactly', () => {
  const cache = new TableCache()
  cache.set({ size: 10, filter: { status: 'open' }, current: 1 }, [], {})
  cache.set({ current: 2, filter: { status: 'open' }, size: 10 }, [], {})
  cache.set({ size: 100, filter: { status: 'closed' } }, [], {})
  const first = cache.get({ size: 10, filter: { status: 'open' }, current: 1 })!
  const second = cache.get({ current: 2, filter: { status: 'open' }, size: 10 })!
  assert.deepEqual(first.tags, second.tags)
  assert.equal(cache.clearByTags(['pagination:10']), 2)
  assert.equal(cache.clearPagination(), 1)
})

test('cache keys isolate otherwise identical queries by tenant and permission scope', () => {
  const cache = new TableCache<number>()
  cache.set({ tenantId: 'tenant-a', permissionScope: 'tenant', current: 1 }, [1], {})
  cache.set({ tenantId: null, permissionScope: 'platform-all', current: 1 }, [2], {})

  assert.deepEqual(
    cache.get({ tenantId: 'tenant-a', permissionScope: 'tenant', current: 1 })?.data,
    [1]
  )
  assert.deepEqual(
    cache.get({ tenantId: null, permissionScope: 'platform-all', current: 1 })?.data,
    [2]
  )
  assert.equal(cache.get({ tenantId: 'tenant-b', permissionScope: 'tenant', current: 1 }), null)
})

test('response adapter handles null and preserves explicit empty lists and totals', () => {
  for (const value of [null, undefined, false, 1, 'records', new Date()]) {
    assert.deepEqual(defaultResponseAdapter(value), { records: [], total: 0 })
  }
  assert.deepEqual(defaultResponseAdapter({ data: null }), { records: [], total: 0 })
  assert.deepEqual(defaultResponseAdapter({ data: [], total: 12 }), { records: [], total: 12 })
  assert.deepEqual(defaultResponseAdapter({ records: [], total: 12, data: { list: [1] } }), {
    records: [],
    total: 12
  })
})

test('nested envelopes use the same field mapping and reject invalid pagination', () => {
  for (const field of ['list', 'data', 'records', 'items', 'result', 'rows']) {
    assert.deepEqual(
      defaultResponseAdapter({ page: 2, data: { [field]: [1], count: 8, page: 3, limit: 5 } }),
      {
        records: [1],
        total: 8,
        current: 2,
        size: 5
      }
    )
  }
  assert.deepEqual(defaultResponseAdapter({ data: { rows: [1] }, total: 9 }), {
    records: [1],
    total: 9
  })
  assert.deepEqual(defaultResponseAdapter({ rows: [1], total: NaN, current: -1, size: Infinity }), {
    records: [1],
    total: 1
  })
})

test('debounce coalesces callers and resolves every promise with the latest arguments', async () => {
  const calls: number[] = []
  const search = createSmartDebounce(async (value: number) => {
    calls.push(value)
    return value
  }, 1000)
  const first = search(1)
  const second = search(2)
  assert.equal(await search.flush(), 2)
  assert.deepEqual(await Promise.all([first, second]), [2, 2])
  assert.deepEqual(calls, [2])
  assert.equal(await search.flush(), undefined)
})

test('debounce cancellation settles callers without issuing work', async () => {
  const search = createSmartDebounce(async () => assert.fail('must not run'), 1000)
  const first = search()
  const second = search()
  search.cancel()
  assert.deepEqual(await Promise.all([first, second]), [undefined, undefined])
  assert.equal(await search.flush(), undefined)
})

test('older debounce completion cannot erase a queued batch', async () => {
  let complete!: (value: number) => void
  const search = createSmartDebounce(
    (value: number) =>
      value === 1
        ? new Promise<number>((resolve) => {
            complete = resolve
          })
        : Promise.resolve(value),
    1000
  )
  const first = search(1)
  const running = search.flush()
  const second = search(2)
  complete(1)
  assert.equal(await running, 1)
  assert.equal(await first, 1)
  assert.equal(await search.flush(), 2)
  assert.equal(await second, 2)
})

test('debounce rejects every waiter and flush with the original failure', async () => {
  const failure = new Error('failed')
  const search = createSmartDebounce(async () => {
    throw failure
  }, 1000)
  const first = assert.rejects(search(), (error) => error === failure)
  const second = assert.rejects(search(), (error) => error === failure)
  await assert.rejects(search.flush(), (error) => error === failure)
  await Promise.all([first, second])
})

test('debounce timer executes without needing flush', async () => {
  const search = createSmartDebounce(async (value: number) => value, 1)
  assert.deepEqual(await Promise.all([search(1), search(2)]), [2, 2])
})
