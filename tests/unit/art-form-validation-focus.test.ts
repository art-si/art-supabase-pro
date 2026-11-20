import assert from 'node:assert/strict'
import test from 'node:test'
import { ref } from 'vue'
import { createArtFormValidationFocusScope } from '../../src/components/core/forms/art-form/focus'

function fixture(visible = true) {
  const scope = { visible: ref(visible), version: ref(1) }
  return { scope, focus: createArtFormValidationFocusScope(scope) }
}

test('unhandled rejection preserves the overlay fallback on each confirmation', () => {
  const { focus } = fixture()
  assert.equal(focus.hasHandledValidationFocus(), false)
  focus.beginConfirmation()
  assert.equal(focus.hasHandledValidationFocus(), false)
  focus.captureValidationFocus().markHandled()
  assert.equal(focus.hasHandledValidationFocus(), true)
  focus.beginConfirmation()
  assert.equal(focus.hasHandledValidationFocus(), false)
})

test('a delayed previous validation cannot claim a newer confirmation', () => {
  const { focus } = fixture()
  focus.beginConfirmation()
  const stale = focus.captureValidationFocus()
  assert.equal(stale.isCurrent(), true)
  focus.beginConfirmation()
  assert.equal(stale.isCurrent(), false)
  stale.markHandled()
  assert.equal(focus.hasHandledValidationFocus(), false)
  focus.captureValidationFocus().markHandled()
  assert.equal(focus.hasHandledValidationFocus(), true)
  stale.markHandled()
  assert.equal(focus.hasHandledValidationFocus(), true)
})

for (const change of ['close', 'reset', 'reopen', 'dispose'] as const) {
  test(`${change} invalidates both completed positioning and its pending notification`, () => {
    const { scope, focus } = fixture()
    focus.beginConfirmation()
    const stale = focus.captureValidationFocus()
    stale.markHandled()
    assert.equal(focus.hasHandledValidationFocus(), true)
    scope.version.value++
    if (change === 'close' || change === 'dispose') scope.visible.value = false
    assert.equal(focus.hasHandledValidationFocus(), false)
    assert.equal(stale.isCurrent(), false)
    stale.markHandled()
    assert.equal(focus.hasHandledValidationFocus(), false)
    if (change === 'reopen') {
      focus.beginConfirmation()
      focus.captureValidationFocus().markHandled()
      assert.equal(focus.hasHandledValidationFocus(), true)
      stale.markHandled()
      assert.equal(focus.hasHandledValidationFocus(), true)
    }
  })
}

test('a hidden overlay cannot accept a notification or lend it to a later opening', () => {
  const { scope, focus } = fixture(false)
  const stale = focus.captureValidationFocus()
  assert.equal(stale.isCurrent(), false)
  stale.markHandled()
  assert.equal(focus.hasHandledValidationFocus(), false)
  scope.visible.value = true
  assert.equal(stale.isCurrent(), false)
  stale.markHandled()
  assert.equal(focus.hasHandledValidationFocus(), false)
})

test('hiding the current overlay immediately stops an already handled rejection', () => {
  const { scope, focus } = fixture()
  focus.captureValidationFocus().markHandled()
  assert.equal(focus.hasHandledValidationFocus(), true)
  scope.visible.value = false
  assert.equal(focus.hasHandledValidationFocus(), false)
})
