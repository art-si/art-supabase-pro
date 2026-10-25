import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseIconCache,
  parseIconCollectionNames
} from '../../src/components/core/forms/art-icon-picker/icon-data'

test('Iconify collection tolerates malformed groups without exposing invalid names', () => {
  assert.deepEqual(
    parseIconCollectionNames(
      {
        prefix: 'ri',
        uncategorized: ['home-line', null, {}, 'wrong name'],
        categories: { general: ['home-line', 'menu-line'], broken: 42 },
        aliases: { 'dashboard-line': { parent: 'home-line' } }
      },
      'ri'
    ),
    ['ri:dashboard-line', 'ri:home-line', 'ri:menu-line']
  )
  for (const value of [
    null,
    [],
    { prefix: 'other', uncategorized: ['home-line'] },
    { prefix: null, uncategorized: ['home-line'] }
  ]) {
    assert.deepEqual(parseIconCollectionNames(value, 'ri'), [])
  }
})

test('corrupted, expired or cross-library cache must be refetched', () => {
  const now = 1000
  for (const value of [
    null,
    [],
    { expiresAt: '2000', icons: ['ri:home-line'] },
    { expiresAt: Infinity, icons: ['ri:home-line'] },
    { expiresAt: now, icons: ['ri:home-line'] },
    { expiresAt: 2000, icons: ['ri:home-line', null] },
    { expiresAt: 2000, icons: ['solar:home-line'] },
    { expiresAt: 2000, icons: ['ri:<script>'] }
  ]) {
    assert.equal(parseIconCache(value, 'ri', now), undefined)
  }
  assert.deepEqual(
    parseIconCache({ expiresAt: 2000, icons: ['ri:home-line', 'ri:home-line'] }, 'ri', now),
    ['ri:home-line']
  )
})
