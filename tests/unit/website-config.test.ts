import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeWebsiteConfig } from '../../src/api/system-manage/website-config.model'
import { WEBSITE_CONFIG_DEFAULTS } from '../../src/config/website-config-defaults'

test('invalid website fields fall back without losing valid login settings', () => {
  const config = decodeWebsiteConfig({
    siteName: 123,
    faviconUrl: {},
    logoUrl: false,
    watermarkCustomText: ['unexpected'],
    seoTitle: {},
    defaultLanguage: 'unknown',
    captchaLockMinutes: Infinity,
    turnstileTheme: false,
    loginTitle: 'Valid login title',
    captchaEnabled: false,
    registerEnabled: false
  })
  assert.deepEqual(config, {
    ...WEBSITE_CONFIG_DEFAULTS,
    loginTitle: 'Valid login title',
    captchaEnabled: false,
    registerEnabled: false
  })
})

test('valid partial configurations retain nullable fields, legacy sizes and editor extensions', () => {
  const config = decodeWebsiteConfig({
    faviconUrl: null,
    loginDescription: null,
    turnstileSiteKey: null,
    turnstileSize: 'flexible',
    defaultLanguage: 'en',
    captchaMaxAttempts: 0,
    authChannels: [{ key: 'github', provider: 'github', label: 'GitHub', enabled: true }],
    mobileSettings: { compactHeader: true },
    version: 4
  })
  assert.ok(config)
  assert.equal(config.siteName, WEBSITE_CONFIG_DEFAULTS.siteName)
  assert.equal(config.faviconUrl, null)
  assert.equal(config.loginDescription, null)
  assert.equal(config.turnstileSiteKey, null)
  assert.equal(config.turnstileSize, 'flexible')
  assert.equal(config.defaultLanguage, 'en')
  assert.equal(config.captchaMaxAttempts, 0)
  assert.equal(config.authChannels[0]?.enabled, true)
  assert.equal(config.authChannels[0]?.icon, 'ri:login-circle-line')
  assert.equal(config.version, 4)
  assert.deepEqual(Object.getOwnPropertyDescriptor(config, 'mobileSettings')?.value, {
    compactHeader: true
  })
})

test('website configuration rejects non-objects and omits invalid version metadata', () => {
  for (const value of [null, true, 'legacy', [], new Date()]) {
    assert.equal(decodeWebsiteConfig(value), null)
  }
  const config = decodeWebsiteConfig({ version: '4' })
  assert.ok(config)
  assert.equal(config.version, undefined)
})
