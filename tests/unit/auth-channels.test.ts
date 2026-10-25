import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAuthCallbackUrl,
  getAuthChannelQueryParams,
  getAuthChannelValidationMessage,
  normalizeAuthChannels
} from '../../src/utils/supabase/auth-channels'

test('normalizes built-in and custom OAuth channels without exposing arbitrary values', () => {
  const channels = normalizeAuthChannels([
    {
      key: 'wechat',
      label: '微信',
      provider: 'custom:wechat',
      icon: 'ri:wechat-fill',
      enabled: true,
      allowLinking: true,
      queryParamName: 'connection',
      queryParamValue: 'wechat'
    },
    {
      key: 'google',
      label: 'Google',
      provider: 'google',
      icon: 'invalid icon',
      enabled: true
    },
    { key: 'bad', label: 'Bad', provider: 'https://evil.example', enabled: true }
  ])

  assert.equal(channels.length, 2)
  assert.equal(channels[0]?.provider, 'custom:wechat')
  assert.equal(channels[1]?.icon, 'ri:login-circle-line')
  assert.deepEqual(getAuthChannelQueryParams(channels[0]!), { connection: 'wechat' })
})

test('reports duplicate and malformed channel configuration before publishing', () => {
  const duplicate = [
    { key: 'wechat', label: '微信', provider: 'custom:wechat' },
    { key: 'wechat', label: '微信 2', provider: 'custom:wechat-2' }
  ]
  assert.equal(getAuthChannelValidationMessage(duplicate), '渠道标识“wechat”重复')
  assert.match(
    getAuthChannelValidationMessage([
      { key: 'wechat', label: '微信', provider: 'https://evil.example' }
    ]) ?? '',
    /Provider 无效/
  )
  assert.match(
    getAuthChannelValidationMessage([
      { key: 'wechat', label: '微信', provider: 'custom:identity-broker' },
      { key: 'dingtalk', label: '钉钉', provider: 'custom:identity-broker' }
    ]) ?? '',
    /同一 Provider 请只配置一个登录入口/
  )
})

test('builds hash-router callbacks and preserves the requested business route', () => {
  const callback = buildAuthCallbackUrl(
    'https://example.com/app/#/auth/login',
    '/auth/login',
    'login',
    'wechat',
    '/dashboard?tab=mine'
  )
  const url = new URL(callback)
  assert.equal(url.origin, 'https://example.com')
  assert.equal(url.pathname, '/app/')
  assert.match(url.hash, /^#\/auth\/login\?auth_action=login&channel=wechat/)
  assert.match(url.hash, /redirect=%2Fdashboard%3Ftab%3Dmine/)
})
