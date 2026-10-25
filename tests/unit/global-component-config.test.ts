import assert from 'node:assert/strict'
import test from 'node:test'
import { globalComponentsConfig } from '../../src/config/modules/component'

test('interaction-only global components stay deferred until their activation event', () => {
  const deferredComponents = globalComponentsConfig
    .filter((config) => config.activationEvent)
    .map(({ key, activationEvent, component, loader }) => ({
      key,
      activationEvent,
      hasEagerComponent: Boolean(component),
      hasLoader: Boolean(loader)
    }))

  assert.deepEqual(deferredComponents, [
    {
      key: 'settings-panel',
      activationEvent: 'openSetting',
      hasEagerComponent: false,
      hasLoader: true
    },
    {
      key: 'global-search',
      activationEvent: 'openSearchDialog',
      hasEagerComponent: false,
      hasLoader: true
    },
    {
      key: 'chat-window',
      activationEvent: 'openChat',
      hasEagerComponent: false,
      hasLoader: true
    },
    {
      key: 'fireworks-effect',
      activationEvent: 'triggerFireworks',
      hasEagerComponent: false,
      hasLoader: true
    }
  ])
})

test('stateful security components remain mounted with the application shell', () => {
  for (const key of ['screen-lock', 'watermark']) {
    const config = globalComponentsConfig.find((item) => item.key === key)
    assert.ok(config)
    assert.ok(config.component)
    assert.equal(config.loader, undefined)
    assert.equal(config.activationEvent, undefined)
  }
})
