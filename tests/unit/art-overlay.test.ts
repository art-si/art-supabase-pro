import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope } from 'vue'
import {
  cloneOverlayData,
  useArtOverlay,
  type ArtOverlayOptions
} from '../../src/hooks/core/useArtOverlay'

for (const operation of ['open', 'confirm', 'close'] as const) {
  test(`disposed overlay suppresses pending ${operation} failure and cannot reopen`, async () => {
    const errors: unknown[] = []
    let focusRequests = 0
    let closeCalls = 0
    let resetCalls = 0
    let rejectPending: ((error: Error) => void) | undefined
    const pending = () =>
      new Promise<void>((_resolve, reject) => {
        rejectPending = reject
      })
    const scope = effectScope()
    const overlay = scope.run(() =>
      createOverlay(
        (error) => errors.push(error),
        () => focusRequests++
      )
    )!
    const opening = overlay.handleOpen(
      { id: 'disposed' },
      {
        onOpen: operation === 'open' ? pending : undefined,
        onConfirm: operation === 'confirm' ? pending : undefined,
        onClose: () => {
          closeCalls++
          return operation === 'close' ? pending() : undefined
        },
        onReset: () => resetCalls++
      }
    )
    await Promise.resolve()
    const work =
      operation === 'open'
        ? opening
        : operation === 'confirm'
          ? overlay.handleConfirm()
          : overlay.handleClose()
    scope.stop()
    rejectPending?.(new Error('disposed callback failed'))
    await work
    await overlay.handleOpen({ id: 'stale retry' })
    overlay.handleModelValueChange(true)
    overlay.handleClosed()
    overlay.handleReset()
    assert.equal(await overlay.handleConfirm(), false)
    assert.equal(await overlay.handleClose(), false)
    assert.equal(overlay.visible.value, false)
    assert.equal(overlay.loading.value, false)
    assert.equal(overlay.confirmLoading.value, false)
    assert.equal(overlay.getData().id, 'disposed')
    assert.equal(closeCalls, operation === 'close' ? 1 : 0)
    assert.equal(resetCalls, 0)
    assert.equal(focusRequests, 0)
    assert.deepEqual(errors, [])
  })
}

test('disposal before the open tick prevents starting its business callback', async () => {
  const scope = effectScope()
  const overlay = scope.run(() => createOverlay())!
  let openCalls = 0
  const opening = overlay.handleOpen(
    {},
    {
      onOpen: () => {
        openCalls++
      }
    }
  )
  scope.stop()
  await opening
  assert.equal(openCalls, 0)
  assert.equal(overlay.visible.value, false)
})

test('a successful submission after disposal cannot invoke business close or reset', async () => {
  const scope = effectScope()
  const overlay = scope.run(() => createOverlay())!
  let finishSubmit: (() => void) | undefined
  let closeCalls = 0
  let resetCalls = 0
  await overlay.handleOpen(
    {},
    {
      onConfirm: () =>
        new Promise<void>((resolve) => {
          finishSubmit = resolve
        }),
      onClose: () => {
        closeCalls++
      },
      onReset: () => {
        resetCalls++
      }
    }
  )
  const submitting = overlay.handleConfirm()
  scope.stop()
  finishSubmit?.()
  assert.equal(await submitting, false)
  assert.equal(closeCalls, 0)
  assert.equal(resetCalls, 0)
})

test('a native close continuation after disposal cannot call its business guard or done', async () => {
  const scope = effectScope()
  const overlay = scope.run(() => createOverlay())!
  let release: (() => void) | undefined
  let closeCalls = 0
  await overlay.handleOpen(
    {},
    {
      onClose: () => {
        closeCalls++
      }
    }
  )
  overlay.handleBeforeClose(
    () => assert.fail('disposed native close completed'),
    (done: () => void) => {
      release = done
    }
  )
  scope.stop()
  release?.()
  await Promise.resolve()
  assert.equal(closeCalls, 0)
})

test('fallback snapshots isolate nested values while preserving callback identity and cycles', () => {
  const callback = () => 'unchanged'
  const source = { details: { lines: [{ amount: 10 }] }, callback, self: undefined as unknown }
  source.self = source
  const snapshot = cloneOverlayData(source)
  snapshot.details.lines[0].amount = 20
  assert.equal(source.details.lines[0].amount, 10)
  assert.equal(snapshot.callback, callback)
  assert.equal(snapshot.self, snapshot)
})

test('overlay reset restores nested form values when a callback prevents native cloning', async () => {
  const overlay = createOverlay()
  const original = { id: 'record', details: { amount: 10 }, callback: () => undefined }
  await overlay.handleOpen(original)
  const draft = overlay.getData() as typeof original
  draft.details.amount = 20
  assert.equal(original.details.amount, 10)
  overlay.handleReset()
  assert.equal((overlay.getData() as typeof original).details.amount, 10)
})

test('reset invalidates a pending confirmation without closing the reset form', async () => {
  const overlay = createOverlay()
  let complete!: () => void
  await overlay.handleOpen(
    { id: 'same' },
    {
      onConfirm: () =>
        new Promise<void>((resolve) => {
          complete = resolve
        })
    }
  )
  const pending = overlay.handleConfirm()
  overlay.handleReset()
  complete()
  assert.equal(await pending, false)
  assert.equal(overlay.visible.value, true)
  assert.equal(overlay.confirmLoading.value, false)
})

test('reset suppresses a pending open failure from the previous form session', async () => {
  const errors: unknown[] = []
  const overlay = createOverlay((error) => errors.push(error))
  let reject!: (error: Error) => void
  const pending = overlay.handleOpen(
    { id: 'same' },
    {
      onOpen: () =>
        new Promise<void>((_resolve, rejectPending) => {
          reject = rejectPending
        })
    }
  )
  await Promise.resolve()
  overlay.handleReset()
  reject(new Error('old initialization failure'))
  await pending
  assert.deepEqual(errors, [])
  assert.equal(overlay.visible.value, true)
})

test('reset cancels a pending close guard and permits a fresh close request', async () => {
  const overlay = createOverlay()
  let allow!: (value: boolean) => void
  await overlay.handleOpen(
    { id: 'same' },
    {
      onClose: () =>
        new Promise<boolean>((resolve) => {
          allow = resolve
        })
    }
  )
  const closing = overlay.handleClose()
  overlay.handleReset()
  allow(true)
  assert.equal(await closing, false)
  assert.equal(overlay.visible.value, true)
  overlay.setOptions({ onClose: undefined })
  assert.equal(await overlay.handleClose(), true)
})

interface TestData {
  id?: string
}

type TestOptions = ArtOverlayOptions<TestData, { setLoading: (value: boolean) => void }>

const createOverlay = (
  emitError: (error: unknown) => void = () => undefined,
  onConfirmRejected?: () => void
) => {
  let setLoading: (value: boolean) => void = () => undefined
  const overlay = useArtOverlay<TestData, { setLoading: (value: boolean) => void }, TestOptions>({
    getDefaultOptions: () => ({ autoClose: true, resetOnClose: true }),
    mergeOptions: (base, override) => ({ ...base, ...override }),
    getApi: () => ({ setLoading }),
    emitConfirm: () => undefined,
    emitReset: () => undefined,
    emitError,
    onConfirmRejected
  })
  setLoading = overlay.setLoading
  return overlay
}

test('native close waits for both the native callback and the project close guard', async () => {
  const overlay = createOverlay()
  const events: string[] = []
  await overlay.handleOpen(
    {},
    {
      onClose: () => {
        events.push('guard')
        return true
      }
    }
  )
  let release: (() => void) | undefined
  const closed = new Promise<void>((resolve) => {
    overlay.handleBeforeClose(
      () => {
        events.push('closed')
        resolve()
      },
      (done: () => void) => {
        events.push('native')
        release = done
      }
    )
  })
  assert.equal(overlay.visible.value, true)
  assert.deepEqual(events, ['native'])
  release?.()
  await closed
  assert.equal(overlay.visible.value, false)
  assert.deepEqual(events, ['native', 'guard', 'closed'])
})

test('native close cancellation preserves visibility without invoking the project guard', async () => {
  const overlay = createOverlay()
  let guardCalls = 0
  await overlay.handleOpen(
    {},
    {
      onClose: () => {
        guardCalls += 1
      }
    }
  )
  overlay.handleBeforeClose(
    () => assert.fail('cancelled overlay closed'),
    (done: (cancel?: boolean) => void) => done(true)
  )
  assert.equal(overlay.visible.value, true)
  assert.equal(guardCalls, 0)
})

test('a rejected project guard prevents the native overlay from beginning its close transition', async () => {
  const overlay = createOverlay()
  await overlay.handleOpen({}, { onClose: () => false })
  overlay.handleBeforeClose(() => assert.fail('blocked overlay closed'))
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(overlay.visible.value, true)
})

test('native callback failures retain the overlay and reach the shared error boundary', async () => {
  const errors: unknown[] = []
  const overlay = createOverlay((error) => errors.push(error))
  await overlay.handleOpen({})
  const synchronous = new Error('sync close failure')
  const asynchronous = new Error('async close failure')
  overlay.handleBeforeClose(
    () => assert.fail('failed callback closed overlay'),
    () => {
      throw synchronous
    }
  )
  overlay.handleBeforeClose(
    () => assert.fail('failed callback closed overlay'),
    async () => {
      throw asynchronous
    }
  )
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(overlay.visible.value, true)
  assert.deepEqual(errors, [synchronous, asynchronous])
})

test('closing an overlay invalidates a pending open callback and suppresses its stale error', async () => {
  const errors: unknown[] = []
  const overlay = createOverlay((error) => errors.push(error))
  let rejectOpen: ((error: Error) => void) | undefined

  const opening = overlay.handleOpen(
    { id: 'first' },
    {
      onOpen: () =>
        new Promise<void>((_resolve, reject) => {
          rejectOpen = reject
        })
    }
  )
  await Promise.resolve()
  await overlay.handleClose(true)
  rejectOpen?.(new Error('stale load failed'))
  await opening

  assert.equal(overlay.visible.value, false)
  assert.deepEqual(errors, [])
})

test('a pending close cannot close a subsequently opened record', async () => {
  const overlay = createOverlay()
  let finishClose: ((allowed: boolean) => void) | undefined
  await overlay.handleOpen(
    { id: 'first' },
    {
      onClose: () =>
        new Promise<boolean>((resolve) => {
          finishClose = resolve
        })
    }
  )
  const closing = overlay.handleClose()
  await overlay.handleOpen({ id: 'second' })
  finishClose?.(true)
  assert.equal(await closing, false)
  assert.equal(overlay.visible.value, true)
  assert.equal(overlay.getData().id, 'second')
})

test('confirm locking prevents duplicate side effects while a submit is pending', async () => {
  const overlay = createOverlay()
  let submitCount = 0
  let finishSubmit: (() => void) | undefined

  await overlay.handleOpen(
    { id: 'submit' },
    {
      onConfirm: () =>
        new Promise<void>((resolve) => {
          submitCount += 1
          finishSubmit = resolve
        })
    }
  )
  const first = overlay.handleConfirm()
  const second = await overlay.handleConfirm()
  finishSubmit?.()

  assert.equal(second, false)
  assert.equal(await first, true)
  assert.equal(submitCount, 1)
})

test('confirmation is blocked while closed or explicitly disabled', async () => {
  const overlay = createOverlay()
  let submissions = 0
  const onConfirm = () => {
    submissions += 1
  }
  overlay.setOptions({ onConfirm })
  assert.equal(await overlay.handleConfirm(), false)
  await overlay.handleOpen({ id: 'disabled' }, { onConfirm, confirmDisabled: true })
  assert.equal(await overlay.handleConfirm(), false)
  assert.equal(submissions, 0)
  assert.equal(overlay.visible.value, true)
  overlay.setOptions({ confirmDisabled: false })
  assert.equal(await overlay.handleConfirm(), true)
  assert.equal(submissions, 1)
  assert.equal(await overlay.handleConfirm(), false)
  assert.equal(submissions, 1)
})

test('an old submission cannot close a new record or release its submission lock', async () => {
  const overlay = createOverlay()
  let finishFirst: (() => void) | undefined
  let finishSecond: (() => void) | undefined
  await overlay.handleOpen(
    { id: 'first' },
    {
      onConfirm: () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve
        })
    }
  )
  const first = overlay.handleConfirm()
  await overlay.handleOpen(
    { id: 'second' },
    {
      onConfirm: () =>
        new Promise<void>((resolve) => {
          finishSecond = resolve
        })
    }
  )
  const second = overlay.handleConfirm()
  finishFirst?.()
  assert.equal(await first, false)
  assert.equal(overlay.visible.value, true)
  assert.equal(overlay.confirmLoading.value, true)
  assert.equal(overlay.getData().id, 'second')
  finishSecond?.()
  assert.equal(await second, true)
  assert.equal(overlay.visible.value, false)
  assert.equal(overlay.confirmLoading.value, false)
})

test('an old native close callback cannot close a new record', async () => {
  const overlay = createOverlay()
  let release: (() => void) | undefined
  await overlay.handleOpen({ id: 'first' })
  overlay.handleBeforeClose(
    () => assert.fail('stale close completed'),
    (done: () => void) => {
      release = done
    }
  )
  await overlay.handleOpen({ id: 'second' })
  release?.()
  await Promise.resolve()
  assert.equal(overlay.visible.value, true)
  assert.equal(overlay.getData().id, 'second')
})

test('a stale submission failure cannot report errors or focus validation in a new record', async () => {
  const errors: unknown[] = []
  let focusRequests = 0
  const overlay = createOverlay(
    (error) => errors.push(error),
    () => {
      focusRequests += 1
    }
  )
  let rejectSubmit: ((error: Error) => void) | undefined
  await overlay.handleOpen(
    { id: 'first' },
    {
      closeOnConfirmError: true,
      onConfirm: () =>
        new Promise<void>((_resolve, reject) => {
          rejectSubmit = reject
        })
    }
  )
  const submitting = overlay.handleConfirm()
  await overlay.handleOpen({ id: 'second' })
  rejectSubmit?.(new Error('old submission failed'))
  assert.equal(await submitting, false)
  assert.equal(overlay.visible.value, true)
  assert.equal(overlay.getData().id, 'second')
  assert.equal(focusRequests, 0)
  assert.deepEqual(errors, [])
})

test('invalid confirmation requests field focus and leaves the overlay available for correction', async () => {
  let focusRequests = 0
  const overlay = createOverlay(undefined, () => {
    focusRequests += 1
  })
  await overlay.handleOpen({}, { onConfirm: () => false })

  assert.equal(await overlay.handleConfirm(), false)
  assert.equal(focusRequests, 1)
  assert.equal(overlay.visible.value, true)
  assert.equal(overlay.confirmLoading.value, false)
})

test('rejected validation requests focus unless the overlay closes on error', async () => {
  let focusRequests = 0
  const errors: unknown[] = []
  const overlay = createOverlay(
    (error) => errors.push(error),
    () => {
      focusRequests += 1
    }
  )
  const failure = new Error('invalid form')
  const onConfirm = () => {
    throw failure
  }
  await overlay.handleOpen({}, { onConfirm })
  assert.equal(await overlay.handleConfirm(), false)
  assert.equal(focusRequests, 1)
  assert.equal(overlay.visible.value, true)

  overlay.setOptions({ closeOnConfirmError: true })
  assert.equal(await overlay.handleConfirm(), false)
  assert.equal(focusRequests, 1)
  assert.equal(overlay.visible.value, false)
  assert.equal(overlay.confirmLoading.value, false)
  assert.deepEqual(errors, [failure, failure])
})
