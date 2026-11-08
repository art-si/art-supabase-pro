import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BffDeadlineError, withBffDeadline } from '../../src/utils/http/bff-deadline'

test('an unresponsive BFF transport releases optional menu discovery at its deadline', async () => {
  let transportSignal: AbortSignal | undefined
  const started = Date.now()
  await assert.rejects(
    withBffDeadline((signal) => {
      transportSignal = signal
      return new Promise<never>(() => undefined)
    }, 25),
    (error: unknown) => error instanceof BffDeadlineError && error.reason === 'timeout'
  )
  assert.equal(transportSignal?.aborted, true)
  assert.ok(Date.now() - started < 1_000)
})

test('navigation abort cancels BFF discovery without waiting for its timeout', async () => {
  const navigation = new AbortController()
  const pending = withBffDeadline(
    () => new Promise<never>(() => undefined),
    5_000,
    navigation.signal
  )
  navigation.abort()
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof BffDeadlineError && error.reason === 'aborted'
  )
})
