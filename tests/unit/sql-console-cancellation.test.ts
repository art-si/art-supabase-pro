import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createQueryCancellation,
  SqlQueryCancelledError
} from '../../supabase/functions/_shared/query-cancellation'

test('early cancellation prevents SQL and a finished handle cannot signal the next statement', async () => {
  let signals = 0
  const early = createQueryCancellation(
    async () => 'cancel_requested',
    async () => {
      signals++
    },
    1
  )
  let started = false
  await assert.rejects(
    early.run(() => {
      started = true
      return Promise.resolve(1)
    }),
    SqlQueryCancelledError
  )
  assert.equal(started, false)
  await early.stop()
  let state = 'running'
  const controller = createQueryCancellation(
    async () => state,
    async () => {
      signals++
    },
    1
  )
  assert.equal(await controller.run(() => Promise.resolve(42)), 42)
  state = 'cancel_requested'
  await assert.rejects(
    controller.run(() => Promise.resolve(1)),
    SqlQueryCancelledError
  )
  assert.equal(signals, 0)
  await controller.stop()
})

test('cancellation waits for both the original database query and cancel dispatch acknowledgement', async () => {
  let state = 'running'
  let signals = 0
  let acknowledge!: () => void
  let completeCancel!: () => void
  const controller = createQueryCancellation(
    async () => state,
    async () => {
      signals++
      await new Promise<void>((resolve) => {
        completeCancel = resolve
      })
    },
    1
  )
  const query = new Promise<never>((_resolve, reject) => {
    acknowledge = () => reject(new Error('canceling statement due to user request'))
  })
  let settled = false
  const pending = controller
    .run(() => query)
    .finally(() => {
      settled = true
    })
  await new Promise<void>((resolve) => setTimeout(resolve, 3))
  state = 'cancel_requested'
  while (!signals) await new Promise<void>((resolve) => setTimeout(resolve, 1))
  acknowledge()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(
    settled,
    false,
    'The transaction must not return to the pool before the dispatch finishes'
  )
  completeCancel()
  await assert.rejects(pending, SqlQueryCancelledError)
  assert.equal(signals, 1)
  await controller.stop()
})

test('timeout remains a timeout and registry loss cancels before another write can begin', async () => {
  let state = 'running'
  let rejectQuery!: (error: Error) => void
  const timeout = new Error('canceling statement due to statement timeout')
  const controller = createQueryCancellation(
    async () => state,
    async () => {
      rejectQuery(timeout)
    },
    1
  )
  const pending = controller.run(
    () =>
      new Promise<never>((_resolve, reject) => {
        rejectQuery = reject
      })
  )
  await new Promise<void>((resolve) => setTimeout(resolve, 3))
  state = 'cancel_requested'
  await assert.rejects(pending, (error) => error === timeout)
  await controller.stop()
  const failure = new Error('registry offline')
  let reads = 0
  let signals = 0
  const unavailable = createQueryCancellation(
    async () => {
      if (++reads > 1) throw failure
      return 'running'
    },
    async () => {
      signals++
      rejectQuery(new Error('cancelled'))
    },
    1
  )
  await assert.rejects(
    unavailable.run(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectQuery = reject
        })
    ),
    (error) => error === failure
  )
  assert.equal(signals, 1)
  await unavailable.stop()
})
