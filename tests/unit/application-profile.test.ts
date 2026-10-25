import assert from 'node:assert/strict'
import test from 'node:test'
import {
  APPLICATION_CODES,
  APPLICATION_PROFILES,
  resolveApplicationBaseUrl,
  resolveApplicationCode
} from '../../src/config/application'

test('resolves supported independent application codes', () => {
  for (const code of APPLICATION_CODES) {
    assert.equal(resolveApplicationCode(code.toUpperCase()), code)
    assert.equal(APPLICATION_PROFILES[code].code, code)
    assert.match(APPLICATION_PROFILES[code].defaultPath, /^\//)
    assert.match(APPLICATION_PROFILES[code].deploymentPath, /^\/art-supabase-[a-z-]+\/$/)
  }
})

test('falls back to the platform for missing or invalid application codes', () => {
  assert.equal(resolveApplicationCode(undefined), 'platform')
  assert.equal(resolveApplicationCode(''), 'platform')
  assert.equal(resolveApplicationCode('unknown-module'), 'platform')
})

test('resolves every GitHub Pages application from the current account domain', () => {
  const location = {
    hostname: 'art-si.github.io',
    origin: 'https://art-si.github.io'
  }

  const expectedUrls = {
    platform: 'https://art-si.github.io/art-supabase-pro/',
    fms: 'https://art-si.github.io/art-supabase-fms/',
    hr: 'https://art-si.github.io/art-supabase-hr/',
    mdm: 'https://art-si.github.io/art-supabase-mdm/',
    mes: 'https://art-si.github.io/art-supabase-mes/',
    pmis: 'https://art-si.github.io/art-supabase-pmis/',
    scm: 'https://art-si.github.io/art-supabase-scm/',
    smis: 'https://art-si.github.io/art-supabase-smis/',
    tms: 'https://art-si.github.io/art-supabase-tms/',
    vms: 'https://art-si.github.io/art-supabase-vms/',
    wms: 'https://art-si.github.io/art-supabase-wms/'
  } as const

  for (const code of APPLICATION_CODES) {
    const target = resolveApplicationBaseUrl(code, `/${code}/`, location)
    assert.equal(target.toString(), expectedUrls[code])
  }
})

test('keeps the configured application URL outside GitHub Pages', () => {
  const target = resolveApplicationBaseUrl('fms', 'http://localhost:3012/', {
    hostname: 'localhost',
    origin: 'http://localhost:3006'
  })

  assert.equal(target.toString(), 'http://localhost:3012/')
})
