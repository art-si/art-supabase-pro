import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveApplicationBaseUrl,
  resolveApplicationCode,
  resolveHostedApplicationCodes
} from '../../src/config/application'

test('platform host aggregates every application granted to the current user', () => {
  assert.deepEqual(
    resolveHostedApplicationCodes('platform', [
      { code: 'vms' },
      { code: 'platform' },
      { code: 'hr' },
      { code: 'tms' }
    ]),
    ['platform', 'hr', 'tms', 'vms']
  )
})

test('standalone application only requests its own menu contract', () => {
  assert.deepEqual(resolveHostedApplicationCodes('vms', [{ code: 'platform' }, { code: 'hr' }]), [
    'vms'
  ])
})

test('each deployment resolves only its own application identity', () => {
  assert.equal(resolveApplicationCode('platform'), 'platform')
  assert.equal(resolveApplicationCode('VMS'), 'vms')
  assert.equal(resolveApplicationCode('unknown'), 'platform')
})

test('independent deployments navigate through the configured application base URL', () => {
  const target = resolveApplicationBaseUrl('vms', 'https://vms.example.com/', {
    hostname: 'platform.example.com',
    origin: 'https://platform.example.com'
  })

  assert.equal(target.toString(), 'https://vms.example.com/')
})

test('GitHub Pages deployments retain the application-specific deployment path', () => {
  const target = resolveApplicationBaseUrl('hr', 'https://hr.example.com/', {
    hostname: 'art-si.github.io',
    origin: 'https://art-si.github.io'
  })

  assert.equal(target.toString(), 'https://art-si.github.io/art-supabase-hr/')
})

test('aggregated hosting keeps every business application under the deployed host path', () => {
  for (const code of [
    'fms',
    'hr',
    'mdm',
    'mes',
    'pmis',
    'scm',
    'smis',
    'tms',
    'vms',
    'wms'
  ] as const) {
    const target = resolveApplicationBaseUrl(
      code,
      `/${code}/`,
      {
        hostname: 'example.tcloudbaseapp.com',
        origin: 'https://example.tcloudbaseapp.com'
      },
      '/art-supabase-pro/'
    )
    assert.equal(target.toString(), 'https://example.tcloudbaseapp.com/art-supabase-pro/')
  }
})
