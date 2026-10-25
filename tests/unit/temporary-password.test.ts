import assert from 'node:assert/strict'
import test from 'node:test'
import { createSecureTemporaryPassword } from '../../src/utils/temporary-password'

test('minimal password policy never produces the shared preset password', () => {
  const passwords = Array.from({ length: 20 }, () => createSecureTemporaryPassword(6, false))
  assert.equal(new Set(passwords).size, passwords.length)
  for (const password of passwords) {
    assert.ok(password.length >= 16)
    assert.notEqual(password, '123456')
  }
})

test('temporary passwords honor a longer minimum and all complex character classes', () => {
  const password = createSecureTemporaryPassword(24, true)
  assert.equal(password.length, 24)
  for (const pattern of [/[A-Z]/, /[a-z]/, /\d/, /[!@#$%^&*]/]) assert.match(password, pattern)
})
