import assert from 'node:assert/strict'
import test from 'node:test'
import { getFilePreviewTarget, openFilePreview } from '../../src/hooks/core/useFilePreview'

test('file preview cache accepts valid targets and removes malformed or expired entries', () => {
  const entries = new Map<string, string>()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      removeItem: (key: string) => entries.delete(key)
    } satisfies Pick<Storage, 'getItem' | 'removeItem'>
  })
  try {
    const storageKey = 'art-file-preview:test'
    const validFile = { url: 'https://example.invalid/test.pdf', name: '测试.pdf', fileType: 'pdf' }
    entries.set(storageKey, JSON.stringify({ file: validFile, expiresAt: Date.now() + 60_000 }))
    assert.deepEqual(getFilePreviewTarget('test'), validFile)
    assert.equal(entries.has(storageKey), true)
    const invalidEntries = [
      'not-json',
      JSON.stringify(null),
      JSON.stringify({ file: validFile }),
      JSON.stringify({ file: validFile, expiresAt: '9999999999999' }),
      JSON.stringify({ file: validFile, expiresAt: Date.now() - 1 }),
      JSON.stringify({ file: { url: 123 }, expiresAt: Date.now() + 60_000 }),
      JSON.stringify({ file: { url: validFile.url, name: {} }, expiresAt: Date.now() + 60_000 }),
      JSON.stringify({
        file: { url: validFile.url, fileType: false },
        expiresAt: Date.now() + 60_000
      })
    ]
    for (const value of invalidEntries) {
      entries.set(storageKey, value)
      assert.equal(getFilePreviewTarget('test'), undefined, value)
      assert.equal(entries.has(storageKey), false, '无效预览缓存应被清理')
    }
    assert.equal(getFilePreviewTarget(), undefined)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

test('opening previews isolates storage failures, blocked popups and successful navigation', () => {
  const entries = new Map<string, string>()
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let failure: 'read' | 'write' | 'remove' | undefined
  let blocked = false
  let openCount = 0
  const popup = { opener: {} }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        if (failure === 'read') throw new Error('Storage denied')
        return entries.size
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failure === 'write') throw new Error('Quota exceeded')
        entries.set(key, value)
      },
      removeItem: (key: string) => {
        if (failure === 'remove') throw new Error('Storage denied')
        entries.delete(key)
      }
    } satisfies Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { href: 'https://example.invalid/#/dashboard' },
      open: (url: string, target: string) => {
        openCount += 1
        assert.equal(target, '_blank')
        assert.match(new URL(url).hash, /^#\/file-preview\?key=/)
        return blocked ? null : popup
      }
    }
  })
  try {
    const file = { url: 'https://example.invalid/test.pdf', name: '测试.pdf' }
    assert.equal(openFilePreview({}), 'missing-url')
    assert.equal(openFilePreview({ url: '   ' }), 'missing-url')
    for (const mode of ['read', 'write'] as const) {
      failure = mode
      assert.equal(openFilePreview(file), 'storage-unavailable')
      assert.equal(openCount, 0)
      assert.equal(entries.size, 0)
    }
    failure = undefined
    blocked = true
    assert.equal(openFilePreview(file), 'blocked')
    assert.equal(entries.size, 0)
    failure = 'remove'
    assert.equal(openFilePreview(file), 'storage-unavailable')
    failure = undefined
    entries.clear()
    blocked = false
    const before = Date.now()
    assert.equal(openFilePreview(file), 'opened')
    assert.equal(popup.opener, null)
    assert.equal(entries.size, 1)
    const key = [...entries.keys()][0]
    assert.deepEqual(getFilePreviewTarget(key.replace('art-file-preview:', '')), file)
    const cached: unknown = JSON.parse(entries.get(key) ?? '')
    assert.ok(typeof cached === 'object' && cached !== null && 'expiresAt' in cached)
    assert.ok(typeof cached.expiresAt === 'number' && cached.expiresAt > before)
  } finally {
    for (const [key, descriptor] of [
      ['localStorage', previousStorage],
      ['window', previousWindow]
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
