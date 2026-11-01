import assert from 'node:assert/strict'
import test from 'node:test'
import {
  copyFormattedTextToClipboard,
  supportsFormattedClipboard
} from '../../src/utils/file/clipboard'

const payload = { html: '<table><tr><td>00123</td></tr></table>', text: '00123' }

async function withClipboard(
  clipboard: Partial<Clipboard>,
  run: () => Promise<void>,
  itemSupport = true
) {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const itemDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem')
  class TestClipboardItem {
    static supports = () => true
    readonly types: string[]
    constructor(private readonly representations: Record<string, Promise<Blob>>) {
      this.types = Object.keys(representations)
    }
    getType(type: string) {
      return this.representations[type]
    }
  }
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true })
  Object.defineProperty(globalThis, 'ClipboardItem', {
    value: itemSupport ? TestClipboardItem : undefined,
    configurable: true
  })
  try {
    await run()
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else Reflect.deleteProperty(globalThis, 'navigator')
    if (itemDescriptor) Object.defineProperty(globalThis, 'ClipboardItem', itemDescriptor)
    else Reflect.deleteProperty(globalThis, 'ClipboardItem')
  }
}

test('native formatted write starts in the click stack and waits for both deferred representations', async () => {
  const order: string[] = []
  let received: string[] = []
  await withClipboard(
    {
      write: async (items) => {
        order.push('native')
        assert.equal(items.length, 1)
        assert.deepEqual(items[0].types, ['text/html', 'text/plain'])
        received = await Promise.all(
          items[0].types.map(async (type) => (await items[0].getType(type)).text())
        )
      }
    },
    async () => {
      assert.equal(supportsFormattedClipboard(), true)
      const pending = copyFormattedTextToClipboard(async () => {
        order.push('prepare')
        return payload
      })
      assert.deepEqual(order, ['native'])
      await pending
      assert.deepEqual(order, ['native', 'prepare'])
      assert.deepEqual(received, [payload.html, payload.text])
    }
  )
})

test('an explicit text copy supplies only text/plain rather than silently choosing HTML', async () => {
  await withClipboard(
    {
      write: async (items) => {
        assert.deepEqual(items[0].types, ['text/plain'])
        assert.equal(await (await items[0].getType('text/plain')).text(), payload.text)
      }
    },
    () => copyFormattedTextToClipboard(async () => payload, 'text')
  )
})

test('unsupported rich copying never starts preparation or silently writes plain text', async () => {
  let preparations = 0
  let textWrites = 0
  await withClipboard(
    {
      writeText: async () => {
        textWrites++
      }
    },
    async () => {
      assert.equal(supportsFormattedClipboard(), false)
      await assert.rejects(
        copyFormattedTextToClipboard(async () => {
          preparations++
          return payload
        }),
        /不支持表格复制/
      )
      assert.equal(preparations, 0)
      assert.equal(textWrites, 0)
      await copyFormattedTextToClipboard(async () => payload, 'text')
      assert.equal(textWrites, 1)
    },
    false
  )
})

test('native permission rejection stays a failure and does not fall back to another copy method', async () => {
  let textWrites = 0
  await withClipboard(
    {
      write: async () => {
        throw new DOMException('Denied', 'NotAllowedError')
      },
      writeText: async () => {
        textWrites++
      }
    },
    async () => {
      await assert.rejects(
        copyFormattedTextToClipboard(async () => payload),
        /剪贴板权限/
      )
      assert.equal(textWrites, 0)
    }
  )
})

test('deferred preparation failures remain actionable instead of becoming opaque native errors', async () => {
  const sourceError = new Error('复制内容过大，请减少字段')
  await withClipboard(
    {
      write: async (items) => {
        await Promise.all(items[0].types.map((type) => items[0].getType(type)))
      }
    },
    async () => {
      await assert.rejects(
        copyFormattedTextToClipboard(async () => {
          throw sourceError
        }),
        (cause: unknown) => cause === sourceError
      )
    }
  )
})

test('a late preparation abort after native rejection is handled without a stray rejection', async () => {
  let fail: (cause: unknown) => void = () => {
    throw new Error('Preparation did not start')
  }
  await withClipboard(
    {
      write: async () => {
        throw new DOMException('Denied', 'NotAllowedError')
      }
    },
    async () => {
      const prepared = new Promise<typeof payload>((_resolve, reject) => {
        fail = reject
      })
      await assert.rejects(
        copyFormattedTextToClipboard(() => prepared),
        /剪贴板权限/
      )
      fail(new DOMException('Cancelled', 'AbortError'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  )
})
