import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isBuiltinMemberRole,
  isProtectedAdminRole,
  ROLE_BUILTIN_TYPES
} from '../../src/config/builtin-roles'

test('native and hosted administrator roles remain protected', () => {
  assert.equal(isProtectedAdminRole(ROLE_BUILTIN_TYPES.PLATFORM_SUPER), true)
  assert.equal(isProtectedAdminRole(ROLE_BUILTIN_TYPES.TENANT_ADMIN), true)
  assert.equal(isProtectedAdminRole(ROLE_BUILTIN_TYPES.DEFAULT_REGISTER), false)
  assert.equal(isProtectedAdminRole(null), false)
})

test('native and hosted member roles retain restricted delete behavior', () => {
  assert.equal(isBuiltinMemberRole(ROLE_BUILTIN_TYPES.DEFAULT_REGISTER), true)
  assert.equal(isBuiltinMemberRole(ROLE_BUILTIN_TYPES.MEMBER), true)
  assert.equal(isBuiltinMemberRole(ROLE_BUILTIN_TYPES.PLATFORM_SUPER), false)
  assert.equal(isBuiltinMemberRole(undefined), false)
})
