import assert from 'node:assert/strict'
import test from 'node:test'
import { copyTextToClipboard } from '../../src/utils/file/clipboard'

interface SelectionFixture {
  created: number
  appended: number
  selected: number
  commands: string[]
  removed: number
  restored: number
  text: string
}

async function withClipboardEnvironment(
  clipboard: Partial<Clipboard> | undefined,
  run: (fixture: SelectionFixture) => Promise<void>,
  legacyResult = true
): Promise<void> {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const elementDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  const fixture: SelectionFixture = {
    created: 0,
    appended: 0,
    selected: 0,
    commands: [],
    removed: 0,
    restored: 0,
    text: ''
  }
  class TestElement {
    isConnected = true
    focus() {
      fixture.restored++
    }
  }
  const previousFocus = new TestElement()
  const textarea = {
    value: '',
    readOnly: false,
    style: { position: '', top: '' },
    focus() {},
    select() {
      fixture.selected++
      fixture.text = this.value
    },
    remove() {
      fixture.removed++
    }
  }
  const document = {
    activeElement: previousFocus,
    createElement(tag: string) {
      assert.equal(tag, 'textarea')
      fixture.created++
      return textarea
    },
    body: {
      appendChild(element: unknown) {
        assert.equal(element, textarea)
        fixture.appended++
      }
    },
    execCommand(command: string) {
      fixture.commands.push(command)
      return legacyResult
    }
  }
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true })
  Object.defineProperty(globalThis, 'HTMLElement', { value: TestElement, configurable: true })
  try {
    await run(fixture)
  } finally {
    for (const [key, descriptor] of [
      ['navigator', navigatorDescriptor],
      ['document', documentDescriptor],
      ['HTMLElement', elementDescriptor]
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}

function options(signal: AbortSignal, legacyFallback = false) {
  // Keep the pre-change fixture type-compatible; behaviour, rather than compilation, is the baseline.
  return { signal, legacyFallback }
}

test('an already aborted text copy never calls the native writer', async () => {
  const controller = new AbortController()
  const reason = new DOMException('Preview owner changed', 'AbortError')
  controller.abort(reason)
  let writes = 0
  await withClipboardEnvironment(
    {
      writeText: async () => {
        writes++
      }
    },
    async (fixture) => {
      await assert.rejects(
        copyTextToClipboard('stale SQL', options(controller.signal, true)),
        (cause: unknown) => cause === reason
      )
      assert.equal(writes, 0)
      assert.equal(fixture.created, 0)
      assert.deepEqual(fixture.commands, [])
    }
  )
})

test('an already aborted compatibility copy never creates selection DOM or executes copy', async () => {
  const controller = new AbortController()
  const reason = new Error('Closed preview')
  controller.abort(reason)
  await withClipboardEnvironment(undefined, async (fixture) => {
    await assert.rejects(
      copyTextToClipboard('stale text', options(controller.signal, true)),
      (cause: unknown) => cause === reason
    )
    assert.equal(fixture.created, 0)
    assert.equal(fixture.appended, 0)
    assert.deepEqual(fixture.commands, [])
  })
})

test('aborting a pending native acknowledgement rejects its later success without fallback', async () => {
  const controller = new AbortController()
  const reason = new DOMException('Reopened preview', 'AbortError')
  let finish = () => {
    throw new Error('Native writer did not start')
  }
  let writes = 0
  await withClipboardEnvironment(
    {
      writeText: () => {
        writes++
        return new Promise<void>((resolve) => {
          finish = resolve
        })
      }
    },
    async (fixture) => {
      const pending = copyTextToClipboard('old text', options(controller.signal, true))
      const rejected = assert.rejects(pending, (cause: unknown) => cause === reason)
      assert.equal(writes, 1)
      controller.abort(reason)
      finish()
      await rejected
      assert.equal(fixture.created, 0)
      assert.deepEqual(fixture.commands, [])
    }
  )
})

test('aborting a pending native rejection prevents a stale execCommand fallback', async () => {
  const controller = new AbortController()
  const reason = new DOMException('Content changed', 'AbortError')
  const denied = new DOMException('Permission denied', 'NotAllowedError')
  let fail: (cause: unknown) => void = () => {
    throw new Error('Native writer did not start')
  }
  await withClipboardEnvironment(
    {
      writeText: () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject
        })
    },
    async (fixture) => {
      const pending = copyTextToClipboard('stale denied text', options(controller.signal, true))
      const rejected = assert.rejects(pending, (cause: unknown) => cause === reason)
      controller.abort(reason)
      fail(denied)
      await rejected
      assert.equal(fixture.created, 0)
      assert.deepEqual(fixture.commands, [])
    }
  )
})

test('an abort during capability probing is checked again before compatibility DOM work', async () => {
  const controller = new AbortController()
  const reason = new Error('Capability owner changed')
  const clipboard = Object.defineProperty({}, 'writeText', {
    get() {
      controller.abort(reason)
      return undefined
    }
  })
  await withClipboardEnvironment(clipboard, async (fixture) => {
    await assert.rejects(
      copyTextToClipboard('not current', options(controller.signal, true)),
      (cause: unknown) => cause === reason
    )
    assert.equal(fixture.created, 0)
    assert.deepEqual(fixture.commands, [])
  })
})

test('native copying keeps exact original whitespace, newlines, Unicode and precision text', async () => {
  const original = "  SELECT '😀', '12345678901234567890.1234567890123456789';\r\n\t尾行  "
  const written: string[] = []
  await withClipboardEnvironment(
    {
      writeText: async (value) => {
        written.push(value)
      }
    },
    async (fixture) => {
      await copyTextToClipboard(original)
      assert.deepEqual(written, [original])
      assert.equal(fixture.created, 0)
    }
  )
})

test('a live signal preserves successful native copying and never starts compatibility selection', async () => {
  const controller = new AbortController()
  let written = ''
  await withClipboardEnvironment(
    {
      writeText: async (value) => {
        written = value
      }
    },
    async (fixture) => {
      await copyTextToClipboard('current text', options(controller.signal, true))
      assert.equal(written, 'current text')
      assert.deepEqual(fixture.commands, [])
    }
  )
})

test('a live explicit fallback succeeds after native denial and cleans selection DOM', async () => {
  const controller = new AbortController()
  await withClipboardEnvironment(
    {
      writeText: async () => {
        throw new DOMException('Denied', 'NotAllowedError')
      }
    },
    async (fixture) => {
      await copyTextToClipboard('  当前原文\r\n ', options(controller.signal, true))
      assert.equal(fixture.text, '  当前原文\r\n ')
      assert.equal(fixture.created, 1)
      assert.equal(fixture.appended, 1)
      assert.equal(fixture.selected, 1)
      assert.deepEqual(fixture.commands, ['copy'])
      assert.equal(fixture.removed, 1)
      assert.equal(fixture.restored, 1)
    }
  )
})

test('unsupported native copying still supports explicit compatibility mode', async () => {
  await withClipboardEnvironment(undefined, async (fixture) => {
    await copyTextToClipboard('legacy without signal', { legacyFallback: true })
    assert.deepEqual(fixture.commands, ['copy'])
    assert.equal(fixture.removed, 1)
  })
})

test('a false compatibility result rejects and still removes DOM and restores focus', async () => {
  const controller = new AbortController()
  await withClipboardEnvironment(
    undefined,
    async (fixture) => {
      await assert.rejects(
        copyTextToClipboard('not copied', options(controller.signal, true)),
        /复制失败/
      )
      assert.deepEqual(fixture.commands, ['copy'])
      assert.equal(fixture.removed, 1)
      assert.equal(fixture.restored, 1)
    },
    false
  )
})

test('native permission errors retain their cause and do not silently use compatibility mode', async () => {
  const denied = new DOMException('Denied by policy', 'NotAllowedError')
  await withClipboardEnvironment(
    {
      writeText: async () => {
        throw denied
      }
    },
    async (fixture) => {
      await assert.rejects(
        copyTextToClipboard('cannot write'),
        (cause: unknown) =>
          cause instanceof Error && /剪贴板权限/.test(cause.message) && cause.cause === denied
      )
      assert.equal(fixture.created, 0)
      assert.deepEqual(fixture.commands, [])
    }
  )
})

test('unsupported native copying without explicit fallback keeps the existing manual-copy error', async () => {
  await withClipboardEnvironment(undefined, async (fixture) => {
    await assert.rejects(copyTextToClipboard('manual only'), /不支持复制/)
    assert.equal(fixture.created, 0)
  })
})
