import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent } from 'vue'
import { useLazyComponent } from '../../src/hooks/core/useLazyComponent'

test('lazy component loads once and remains reusable', async () => {
  const expected = defineComponent({ name: 'LazyTestComponent' })
  let loadCount = 0
  const lazyComponent = useLazyComponent(async () => {
    loadCount += 1
    return { default: expected }
  })

  assert.equal(lazyComponent.component.value, undefined)
  await lazyComponent.load()
  await lazyComponent.load()

  assert.equal(lazyComponent.component.value, expected)
  assert.equal(loadCount, 1)
})

test('concurrent opens share one component load and wait for mounting', async () => {
  const expected = defineComponent({ name: 'ConcurrentLazyTestComponent' })
  let complete!: (module: { default: typeof expected }) => void
  let loadCount = 0
  const lazyComponent = useLazyComponent(() => {
    loadCount += 1
    return new Promise((resolve) => {
      complete = resolve
    })
  })

  const first = lazyComponent.load()
  const second = lazyComponent.load()
  assert.equal(loadCount, 1)
  assert.equal(lazyComponent.component.value, undefined)
  complete({ default: expected })
  await Promise.all([first, second])
  assert.equal(lazyComponent.component.value, expected)
})

test('a failed load rejects every opener and can be retried', async () => {
  const expected = defineComponent({ name: 'RetryLazyTestComponent' })
  const failure = new Error('component unavailable')
  let loadCount = 0
  const lazyComponent = useLazyComponent(async () => {
    loadCount += 1
    if (loadCount === 1) throw failure
    return { default: expected }
  })

  const results = await Promise.allSettled([lazyComponent.load(), lazyComponent.load()])
  assert.deepEqual(results, [
    { status: 'rejected', reason: failure },
    { status: 'rejected', reason: failure }
  ])
  assert.equal(lazyComponent.component.value, undefined)
  await lazyComponent.load()
  assert.equal(loadCount, 2)
  assert.equal(lazyComponent.component.value, expected)
})
