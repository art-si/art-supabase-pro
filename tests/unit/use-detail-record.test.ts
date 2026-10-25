import assert from 'node:assert/strict'
import test from 'node:test'
import { useDetailRecord } from '../../src/hooks/core/useDetailRecord'

test('detail loader keeps the requested ID after an empty response so retry remains available', async () => {
  let calls = 0
  const request = useDetailRecord(async () => {
    calls += 1
    return { data: calls === 1 ? null : { name: '已恢复' } }
  }, '详情加载失败，请重试')

  request.openDetail('record-1', { name: '列表摘要' })
  await request.loadDetail('record-1')
  assert.equal(request.detail.value, undefined)
  assert.equal(request.activeId.value, 'record-1')
  assert.equal(request.loadError.value, null)
  assert.equal(request.missing.value, true)
  assert.equal(request.loading.value, false)

  await request.retryLoad()
  assert.deepEqual(request.detail.value, { name: '已恢复' })
  assert.equal(request.loadError.value, null)
  assert.equal(request.missing.value, false)
  assert.equal(calls, 2)
})

test('detail loader treats an empty collection as valid loaded data', async () => {
  const request = useDetailRecord<string[]>(async () => ({ data: [] }), '加载失败')
  request.openDetail('tenant-1')
  await request.retryLoad()
  assert.deepEqual(request.detail.value, [])
  assert.equal(request.missing.value, false)
  assert.equal(request.loadError.value, null)
})

test('closing a detail discards a late empty response without reopening an error', async () => {
  let resolvePending: ((result: { data: null }) => void) | undefined
  const request = useDetailRecord(
    () =>
      new Promise<{ data: null }>((resolve) => {
        resolvePending = resolve
      }),
    '加载失败'
  )
  request.openDetail('record-1')
  const pending = request.retryLoad()
  request.openDetail('')
  resolvePending?.({ data: null })
  await pending
  assert.equal(request.activeId.value, '')
  assert.equal(request.missing.value, false)
  assert.equal(request.loadError.value, null)
  assert.equal(request.loading.value, false)
})

test('detail loader keeps the technical cause behind a safe error and recovers on retry', async () => {
  const cause = new Error('technical failure')
  let calls = 0
  const request = useDetailRecord(async () => {
    calls += 1
    return calls === 1 ? { data: null, error: cause } : { data: { name: '已恢复' } }
  }, '详情加载失败，请重试')

  request.openDetail('record-1')
  await request.loadDetail('record-1')
  assert.equal(request.loadError.value?.message, '详情加载失败，请重试')
  assert.equal(request.loadError.value?.cause, cause)

  await request.retryLoad()
  assert.equal(request.loadError.value, null)
  assert.deepEqual(request.detail.value, { name: '已恢复' })
})

test('detail loader ignores an older response after another record opens', async () => {
  let resolveFirst: ((result: { data: { name: string } }) => void) | undefined
  const request = useDetailRecord(
    (id) =>
      id === 'first'
        ? new Promise<{ data: { name: string } }>((resolve) => {
            resolveFirst = resolve
          })
        : Promise.resolve({ data: { name: '第二条详情' } }),
    '详情加载失败，请重试'
  )

  request.openDetail('first', { name: '第一条摘要' })
  const firstLoad = request.loadDetail('first')
  request.openDetail('second', { name: '第二条摘要' })
  await request.loadDetail('second')
  resolveFirst?.({ data: { name: '第一条旧详情' } })
  await firstLoad

  assert.deepEqual(request.detail.value, { name: '第二条详情' })
  assert.equal(request.activeId.value, 'second')
})
