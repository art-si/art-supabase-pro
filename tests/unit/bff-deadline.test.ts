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

test('deadline stays a timeout when the abort listener rejects and cancels navigation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const navigation = new AbortController()
  let interrupts = 0
  const pending = withBffDeadline(
    (signal) =>
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          interrupts++
          reject(new DOMException('transport aborted', 'AbortError'))
          navigation.abort()
        })
      }),
    25,
    navigation.signal
  )
  const rejection = assert.rejects(
    pending,
    (error) => error instanceof BffDeadlineError && error.reason === 'timeout'
  )
  t.mock.timers.tick(25)
  await rejection
  assert.equal(interrupts, 1)
})

test('navigation cancellation wins over transport fallback data from an abort listener', async () => {
  const navigation = new AbortController()
  const pending = withBffDeadline(
    (signal) =>
      new Promise<string>((resolve) => {
        signal.addEventListener('abort', () => resolve('cached result'), { once: true })
      }),
    50,
    navigation.signal
  )
  navigation.abort()
  await assert.rejects(
    pending,
    (error) => error instanceof BffDeadlineError && error.reason === 'aborted'
  )
})

test('a synchronous setup failure keeps its identity unless cancellation already occurred', async () => {
  const navigation = new AbortController()
  const failure = new Error('transport setup failed')
  await assert.rejects(
    withBffDeadline(
      () => {
        navigation.abort()
        throw failure
      },
      50,
      navigation.signal
    ),
    (error) => error instanceof BffDeadlineError && error.reason === 'aborted'
  )
  await assert.rejects(
    withBffDeadline(() => {
      throw failure
    }, 50),
    (error) => error === failure
  )
})

test('pre-cancelled navigation skips transport and settled transport retains its result', async () => {
  const navigation = new AbortController()
  navigation.abort()
  let calls = 0
  function operation() {
    calls++
    return Promise.resolve('loaded')
  }
  await assert.rejects(
    withBffDeadline(operation, 50, navigation.signal),
    (error) => error instanceof BffDeadlineError && error.reason === 'aborted'
  )
  assert.equal(calls, 0)

  const subsequentNavigation = new AbortController()
  const pending = withBffDeadline(operation, 50, subsequentNavigation.signal)
  assert.equal(calls, 1)
  subsequentNavigation.abort()
  assert.equal(await pending, 'loaded')
})
