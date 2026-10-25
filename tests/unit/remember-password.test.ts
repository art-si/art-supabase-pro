import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readBrowserPassword,
  readRememberPasswordPreference,
  readRememberedIdentifier,
  requestBrowserPasswordSave,
  writeRememberPasswordPreference,
  writeRememberedIdentifier
} from '../../src/views/auth/login/modules/remember-password'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const replaceGlobal = (name: string, value: unknown): (() => void) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  return () => {
    if (previous) Object.defineProperty(globalThis, name, previous)
    else Reflect.deleteProperty(globalThis, name)
  }
}

test('remembered account storage contains only the identifier and can be cleared', () => {
  const storage = new MemoryStorage()
  const restoreStorage = replaceGlobal('localStorage', storage)
  try {
    assert.equal(readRememberedIdentifier(), '')
    assert.equal(writeRememberedIdentifier(' person@example.com '), true)
    assert.equal(readRememberedIdentifier(), 'person@example.com')
    assert.equal(storage.length, 1)
    assert.equal(storage.getItem('art-auth-remembered-identifier'), 'person@example.com')
    assert.equal(writeRememberedIdentifier(''), true)
    assert.equal(readRememberedIdentifier(), '')
    assert.equal(readRememberPasswordPreference(), true)
    writeRememberPasswordPreference(false)
    assert.equal(readRememberPasswordPreference(), false)
    writeRememberPasswordPreference(true)
    assert.equal(readRememberPasswordPreference(), true)
  } finally {
    restoreStorage()
  }
})

test('browser credentials are requested only through the password manager and restored for the matching account', async () => {
  const saved: Array<{ id: string; password: string }> = []
  class FakePasswordCredential {
    readonly type = 'password'
    readonly id: string
    readonly password: string

    constructor(data: { id: string; password: string }) {
      this.id = data.id
      this.password = data.password
    }
  }
  const restoreWindow = replaceGlobal('window', {
    isSecureContext: true,
    PasswordCredential: FakePasswordCredential
  })
  const restoreNavigator = replaceGlobal('navigator', {
    credentials: {
      store: async (credential: FakePasswordCredential) => {
        saved.push({ id: credential.id, password: credential.password })
        return credential
      },
      get: async () => new FakePasswordCredential({ id: 'person@example.com', password: 'secret' })
    }
  })
  try {
    assert.equal(await requestBrowserPasswordSave('person@example.com', 'secret'), 'requested')
    assert.deepEqual(saved, [{ id: 'person@example.com', password: 'secret' }])
    assert.equal(await readBrowserPassword('person@example.com'), 'secret')
    assert.equal(await readBrowserPassword('other@example.com'), undefined)
  } finally {
    restoreNavigator()
    restoreWindow()
  }
})

test('unsupported browser credential APIs do not block login', async () => {
  const restoreWindow = replaceGlobal('window', { isSecureContext: true })
  const restoreNavigator = replaceGlobal('navigator', { credentials: {} })
  try {
    assert.equal(await requestBrowserPasswordSave('person@example.com', 'secret'), 'unavailable')
    assert.equal(await readBrowserPassword('person@example.com'), undefined)
  } finally {
    restoreNavigator()
    restoreWindow()
  }
})
