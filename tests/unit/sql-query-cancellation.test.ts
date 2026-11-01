import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SqlQueryCancellation,
  SqlQueryCancelledError,
  SqlQueryRegistry
} from '../../scripts/sql-gateway-cancellation'

test('early cancellation prevents execution and request IDs cannot be reused', async () => {
  const queries = new SqlQueryRegistry()
  assert.equal(await queries.cancel('actor:tenant:connection:early'), 'cancel_requested')
  assert.throws(() => queries.begin('actor:tenant:connection:early'), SqlQueryCancelledError)
  queries.begin('actor:tenant:connection:normal')
  assert.throws(() => queries.begin('actor:tenant:connection:normal'), /已使用/)
  queries.finish('actor:tenant:connection:normal')
  assert.equal(await queries.cancel('actor:tenant:connection:normal'), 'not_running')
  assert.throws(() => queries.begin('actor:tenant:connection:normal'), /已使用/)
  const separate = queries.begin('other-actor:tenant:connection:early')
  assert.equal(separate.requested, false)
})

test('cancellation waits for the driver acknowledgment and preserves a query winning the race', async () => {
  const control = new SqlQueryCancellation()
  let finishQuery!: () => void
  let finishCancel!: () => void
  let returned = false
  const query = control
    .run(
      async () => new Promise<string>((resolve) => (finishQuery = () => resolve('completed'))),
      async () => new Promise<void>((resolve) => (finishCancel = resolve))
    )
    .then((value) => {
      returned = true
      return value
    })
  const cancelling = control.cancel()
  finishQuery()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(returned, false, 'session must not close before the cancellation request completes')
  finishCancel()
  await cancelling
  assert.equal(await query, 'completed')
})

test('failed cancellation remains retryable and only explicit database interruptions are cancelled', async () => {
  const control = new SqlQueryCancellation()
  let failQuery!: (error: unknown) => void
  let attempts = 0
  const query = control.run(
    async () => new Promise<void>((_resolve, reject) => (failQuery = reject)),
    async () => {
      attempts++
      if (attempts === 1) throw new Error('control connection offline')
      failQuery(Object.assign(new Error('interrupted'), { code: '57014' }))
    }
  )
  const rejected = assert.rejects(query, SqlQueryCancelledError)
  await assert.rejects(control.cancel(), /取消请求未能送达/)
  assert.equal(control.requested, false)
  await control.cancel()
  await rejected
  assert.equal(attempts, 2)

  const unrelated = new SqlQueryCancellation()
  await assert.rejects(
    unrelated.run(
      async () => {
        throw Object.assign(new Error('statement timeout'), { code: '57014' })
      },
      async () => undefined
    ),
    (error: unknown) => error instanceof Error && !(error instanceof SqlQueryCancelledError)
  )
})

test('hard timeout fences an in-flight cancellation before releasing the server session', async () => {
  const control = new SqlQueryCancellation()
  let finishQuery!: () => void
  let finishPacket!: () => void
  let dispatched = 0
  let closed = false
  const query = control.run(
    async () => new Promise<void>((resolve) => (finishQuery = resolve)),
    async () => {
      dispatched++
      await new Promise<void>((resolve) => (finishPacket = resolve))
    }
  )
  const cancellation = control.cancel()
  const hardTimeout = control.close(() => {
    closed = true
  })
  finishQuery()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(closed, false, 'hard timeout must retain the session until KILL/cancel finishes')
  finishPacket()
  await Promise.all([cancellation, hardTimeout, query])
  assert.equal(closed, true)
  await control.cancel()
  assert.equal(dispatched, 1, 'no late packet can target an already released session')
})
