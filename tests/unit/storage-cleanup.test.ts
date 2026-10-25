import assert from 'node:assert/strict'
import test from 'node:test'

test('compatibility recovery removes versioned caches without clearing login memory', async () => {
  Object.defineProperty(globalThis, '__APP_VERSION__', { value: 'test', configurable: true })
  try {
    const { StorageConfig } = await import('../../src/utils/storage/storage-config')
    const values = new Map([
      ['sys-vtest-user', 'corrupt'],
      ['sys-vold-setting', 'legacy'],
      ['art-auth-remembered-identifier', 'remembered'],
      ['art-auth-remember-password', '1'],
      ['sys-theme', 'dark'],
      ['other-application', 'keep']
    ])
    const storage: Storage = {
      get length() {
        return values.size
      },
      key: (index) => [...values.keys()][index] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value)
      },
      removeItem: (key) => {
        values.delete(key)
      },
      clear: () => assert.fail('must not clear unrelated storage')
    }
    StorageConfig.clearVersionedStorage(storage)
    assert.deepEqual(
      [...values.keys()],
      [
        'art-auth-remembered-identifier',
        'art-auth-remember-password',
        'sys-theme',
        'other-application'
      ]
    )
    assert.equal(storage.getItem('art-auth-remembered-identifier'), 'remembered')
    assert.equal(storage.getItem('art-auth-remember-password'), '1')
  } finally {
    Reflect.deleteProperty(globalThis, '__APP_VERSION__')
  }
})
