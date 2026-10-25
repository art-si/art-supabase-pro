import assert from 'node:assert/strict'
import test from 'node:test'
import { mapWithConcurrency, withTimeout } from '../../src/utils/async'

test('deadline releases its timer on success and preserves rejection identity', async (t) => {
  const clear = t.mock.method(globalThis, 'clearTimeout')
  assert.equal(await withTimeout(Promise.resolve(7), 10_000, '测试超时'), 7)
  const failure = new Error('original failure')
  await assert.rejects(
    withTimeout(Promise.reject(failure), 10_000, '测试超时'),
    (error) => error === failure
  )
  assert.equal(clear.mock.callCount(), 2)
})

test('deadline rejects a stalled callback and consumes its late rejection', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const clear = t.mock.method(globalThis, 'clearTimeout')
  let rejectLate!: (reason: Error) => void
  const task = new Promise<never>((_resolve, reject) => {
    rejectLate = reject
  })
  const result = withTimeout(task, 10_000, '请求超时，请重试')
  const rejection = assert.rejects(result, { message: '请求超时，请重试' })
  t.mock.timers.tick(10_000)
  await rejection
  assert.equal(clear.mock.callCount(), 1)
  rejectLate(new Error('late callback'))
  await new Promise<void>((resolve) => setImmediate(resolve))
})

test('deadline aborts immediately, releases timer and consumes late task failures', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const clear = t.mock.method(globalThis, 'clearTimeout')
  const controller = new AbortController()
  const failure = new Error('cancelled by owner')
  let rejectLate!: (error: Error) => void
  const task = new Promise<never>((_resolve, reject) => {
    rejectLate = reject
  })
  const result = withTimeout(task, 10_000, '请求超时', controller.signal)
  controller.abort(failure)
  const outcome = await Promise.race([
    result.then(
      () => 'resolved',
      (error: unknown) => error
    ),
    new Promise<string>((resolve) => setImmediate(() => resolve('abort ignored')))
  ])
  assert.equal(outcome, failure)
  assert.equal(clear.mock.callCount(), 1)
  rejectLate(new Error('late SDK error'))
  await new Promise<void>((resolve) => setImmediate(resolve))
})

test('a pre-aborted deadline wins without leaving a rejected task unobserved', async () => {
  const controller = new AbortController()
  const failure = new Error('already cancelled')
  controller.abort(failure)
  await assert.rejects(
    withTimeout(Promise.reject(new Error('unused task')), 10_000, '请求超时', controller.signal),
    (error) => error === failure
  )
})

test('deadline removes its abort listener after successful work', async (t) => {
  const controller = new AbortController()
  const remove = t.mock.method(controller.signal, 'removeEventListener')
  assert.equal(await withTimeout(Promise.resolve(8), 10_000, '请求超时', controller.signal), 8)
  assert.equal(remove.mock.callCount(), 1)
  controller.abort(new Error('after completion'))
})

test('concurrent mapper rejects invalid limits instead of returning sparse results', async () => {
  for (const limit of [NaN, Infinity, 0, -1, 1.5]) {
    await assert.rejects(
      mapWithConcurrency([1], limit, async (item) => item),
      RangeError
    )
  }
})

test('concurrent mapper bounds active work and retains input order', async () => {
  let active = 0
  let maximum = 0
  const result = await mapWithConcurrency([3, 2, 1], 2, async (item, index) => {
    active++
    maximum = Math.max(maximum, active)
    await new Promise((resolve) => setTimeout(resolve, item))
    active--
    return `${index}:${item}`
  })
  assert.equal(maximum, 2)
  assert.deepEqual(result, ['0:3', '1:2', '2:1'])
  assert.deepEqual(await mapWithConcurrency([], 2, async (item) => item), [])
})

test('concurrent mapper stops scheduling after failure, retaining the original error', async () => {
  const failure = new Error('failed')
  const started: number[] = []
  let complete!: () => void
  const result = mapWithConcurrency([0, 1, 2, 3], 2, async (item) => {
    started.push(item)
    if (item === 0) throw failure
    await new Promise<void>((resolve) => {
      complete = resolve
    })
    return item
  })
  let settled = false
  const rejection = assert
    .rejects(result, (error) => error === failure)
    .then(() => {
      settled = true
    })
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(settled, false, 'must wait for an active request before reporting failure')
  complete()
  await rejection
  assert.deepEqual(started, [0, 1])
})

test('concurrent mapper preserves the first failure after other active requests fail', async () => {
  const failure = new Error('first failure')
  let rejectSecond!: (error: Error) => void
  const result = mapWithConcurrency([0, 1, 2], 2, async (item) => {
    if (item === 0) throw failure
    return new Promise<number>((_resolve, reject) => {
      rejectSecond = reject
    })
  })
  const rejection = assert.rejects(result, (error) => error === failure)
  rejectSecond(new Error('later failure'))
  await rejection
})
