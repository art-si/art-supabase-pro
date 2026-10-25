import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveCanonicalHashRouterUrl } from '../../src/router/hash-history'

const origin = 'http://localhost:3006'

test('normalizes an accidental business pathname to the development Hash base', () => {
  assert.equal(
    resolveCanonicalHashRouterUrl('/', {
      origin,
      pathname: '/smis/dual-control-system/risk-control/risk-inspection-task',
      search: '',
      hash: '#/dashboard/console'
    }),
    '/#/dashboard/console'
  )
})

test('preserves query and Hash route under a production subdirectory', () => {
  assert.equal(
    resolveCanonicalHashRouterUrl('/art-supabase-pro/', {
      origin,
      pathname: '/art-supabase-pro/smis/risk-inspection-task',
      search: '?tenant=platform',
      hash: '#/dashboard/console'
    }),
    '/art-supabase-pro/?tenant=platform#/dashboard/console'
  )
})

test('keeps an already canonical Hash entry unchanged', () => {
  assert.equal(
    resolveCanonicalHashRouterUrl('/', {
      origin,
      pathname: '/',
      search: '',
      hash: '#/dashboard/console'
    }),
    undefined
  )
})
