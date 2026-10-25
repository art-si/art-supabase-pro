import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ROUTE_INITIALIZATION_STAGE_TIMEOUT_MS,
  isTransientRouteInitializationError,
  isRouteInitializationAccessError,
  RouteInitializationAccessError,
  RouteInitializationTimeoutError,
  resolveRouteInitializationTarget,
  runRouteInitializationStage
} from '../../src/router/guards/route-initialization'

test('route initialization keeps a cold-start-safe default timeout budget', () => {
  assert.equal(ROUTE_INITIALIZATION_STAGE_TIMEOUT_MS, 30_000)
})

test('route initialization stage returns the operation result', async () => {
  const result = await runRouteInitializationStage('user-profile', async () => 'ready', {
    timeoutMs: 50
  })

  assert.equal(result, 'ready')
})

test('route initialization stage preserves operational failures', async () => {
  const failure = new Error('database unavailable')

  await assert.rejects(
    runRouteInitializationStage(
      'menu-permissions',
      async () => {
        throw failure
      },
      { timeoutMs: 50 }
    ),
    (error: unknown) => error === failure
  )
})

test('route initialization retries one nested transient fetch failure', async () => {
  let attempts = 0
  const result = await runRouteInitializationStage(
    'user-profile',
    async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error('当前登录身份校验失败', {
          cause: new TypeError('Failed to fetch')
        })
      }
      return 'recovered'
    },
    { timeoutMs: 50, retryDelayMs: 0 }
  )

  assert.equal(result, 'recovered')
  assert.equal(attempts, 2)
})

test('route initialization does not retry authentication or access failures', async () => {
  let authenticationAttempts = 0
  const authenticationError = Object.assign(new Error('invalid token'), { status: 401 })

  await assert.rejects(
    runRouteInitializationStage(
      'user-profile',
      async () => {
        authenticationAttempts += 1
        throw authenticationError
      },
      { timeoutMs: 50, retryDelayMs: 0 }
    ),
    (error: unknown) => error === authenticationError
  )

  assert.equal(authenticationAttempts, 1)
  assert.equal(isTransientRouteInitializationError(authenticationError), false)
  assert.equal(
    isTransientRouteInitializationError(new RouteInitializationAccessError('no profile')),
    false
  )
})

test('route initialization stage aborts and retries a timed-out request once', async () => {
  const receivedSignals: AbortSignal[] = []

  await assert.rejects(
    runRouteInitializationStage(
      'menu-permissions',
      (signal) => {
        receivedSignals.push(signal)
        return new Promise(() => undefined)
      },
      { timeoutMs: 5 }
    ),
    (error: unknown) => {
      assert.ok(error instanceof RouteInitializationTimeoutError)
      assert.equal(error.stage, 'menu-permissions')
      assert.equal(error.timeoutMs, 5)
      return true
    }
  )

  assert.equal(receivedSignals.length, 2)
  assert.equal(
    receivedSignals.every((signal) => signal.aborted),
    true
  )
})

test('route access failures remain distinguishable from service failures', () => {
  const error = new RouteInitializationAccessError('no assigned menus')

  assert.equal(isRouteInitializationAccessError(error), true)
  assert.equal(isRouteInitializationAccessError(new Error('network unavailable')), false)
})

test('route initialization recovery preserves a safe business target', () => {
  assert.equal(
    resolveRouteInitializationTarget('/dashboard/console?scope=mine#summary'),
    '/dashboard/console?scope=mine#summary'
  )
})

test('route initialization recovery unwraps recursively nested 500 redirects', () => {
  assert.equal(
    resolveRouteInitializationTarget('/500?redirect=/500?redirect=/dashboard/console'),
    '/dashboard/console'
  )
  assert.equal(
    resolveRouteInitializationTarget('/500?redirect=%2Fdashboard%2Fconsole'),
    '/dashboard/console'
  )
})

test('route initialization recovery rejects unsafe or cyclic redirects', () => {
  assert.equal(resolveRouteInitializationTarget('https://evil.example/path'), '/')
  assert.equal(resolveRouteInitializationTarget('//evil.example/path'), '/')
  assert.equal(resolveRouteInitializationTarget('/500?redirect=/500'), '/')
})
