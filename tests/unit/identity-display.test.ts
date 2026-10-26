import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeIdentityDisplayText } from '../../src/utils/identity-display'

test('identity display text removes serialized null sentinels without hiding real names', () => {
  for (const value of [null, undefined, ' null ', 'UNDEFINED']) {
    assert.equal(normalizeIdentityDisplayText(value), '')
  }
  assert.equal(normalizeIdentityDisplayText(' Undefined User '), 'Undefined User')
  assert.equal(normalizeIdentityDisplayText(0), '0')
})
