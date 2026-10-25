import assert from 'node:assert/strict'
import test from 'node:test'
import { getScrollBehavior } from '../../src/utils/ui/scroll'

test('scroll behavior follows live reduced-motion preference and explicit instant requests', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let reduced = true
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      matchMedia: (query: string) => {
        assert.equal(query, '(prefers-reduced-motion: reduce)')
        return { matches: reduced }
      }
    }
  })
  try {
    assert.equal(getScrollBehavior(), 'auto')
    reduced = false
    assert.equal(getScrollBehavior(), 'smooth')
    assert.equal(getScrollBehavior(false), 'auto')
    reduced = true
    assert.equal(getScrollBehavior(), 'auto')
    Reflect.deleteProperty(globalThis, 'window')
    assert.equal(getScrollBehavior(), 'auto')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
