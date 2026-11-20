import assert from 'node:assert/strict'
import test from 'node:test'
import { getScrollBehavior, getScrollIntoViewOptions } from '../../src/utils/ui/scroll'

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

test('scroll options preserve native boolean alignment, object values and caller defaults', () => {
  assert.deepEqual(getScrollIntoViewOptions(true), { behavior: 'auto', block: 'start' })
  assert.deepEqual(getScrollIntoViewOptions(false), { behavior: 'auto', block: 'end' })
  const options = { behavior: 'instant', block: 'nearest', inline: 'center' } as const
  const defaults = { behavior: 'auto', block: 'start', inline: 'nearest' } as const
  assert.deepEqual(getScrollIntoViewOptions(options, defaults), options)
  assert.deepEqual(getScrollIntoViewOptions(undefined, defaults), defaults)
  assert.deepEqual(getScrollIntoViewOptions(false, defaults), { ...defaults, block: 'end' })
  assert.deepEqual(options, { behavior: 'instant', block: 'nearest', inline: 'center' })
  assert.deepEqual(defaults, { behavior: 'auto', block: 'start', inline: 'nearest' })
})

test('scroll option normalization reads changed motion preference without modifying the options', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let reduced = false
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { matchMedia: () => ({ matches: reduced }) }
  })
  const options = { behavior: 'smooth', block: 'end' } as const
  try {
    assert.equal(getScrollIntoViewOptions(options).behavior, 'smooth')
    reduced = true
    assert.equal(getScrollIntoViewOptions(options).behavior, 'auto')
    assert.deepEqual(options, { behavior: 'smooth', block: 'end' })
    assert.equal(getScrollIntoViewOptions({ behavior: 'instant' }).behavior, 'instant')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
