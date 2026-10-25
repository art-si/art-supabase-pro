import assert from 'node:assert/strict'
import test from 'node:test'
import { hasPlatformSuperAccess } from '../../src/utils/platform-super-access'

const protectedProfile = {
  status: '1',
  userRoles: ['R_SUPER', 'R_ADMIN'],
  tenant: { builtinType: 'platform' as const }
}

test('server-confirmed platform super can use cross-tenant controls', () => {
  assert.equal(hasPlatformSuperAccess({ ...protectedProfile, platformSuper: true }), true)
})

test('role and tenant labels do not grant access without server confirmation', () => {
  assert.equal(hasPlatformSuperAccess(protectedProfile), false)
  assert.equal(hasPlatformSuperAccess({ ...protectedProfile, platformSuper: false }), false)
})
