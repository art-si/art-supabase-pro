import assert from 'node:assert/strict'
import test from 'node:test'
import { withAlpha } from '../../modules/art-supabase-tms/src/views/in-transit-monitor/modules/monitor-utils'

test('monitor colors share bounded alpha conversion for valid hex colors', () => {
  assert.equal(withAlpha('#3366CC', 0.18), 'rgba(51, 102, 204, 0.18)')
  assert.equal(withAlpha('#000000', -1), 'rgba(0, 0, 0, 0)')
  assert.equal(withAlpha('#ffffff', 2), 'rgba(255, 255, 255, 1)')
  assert.equal(withAlpha('#ffffff', Number.NaN), 'rgba(255, 255, 255, 1)')
})

test('monitor colors preserve non-hex CSS values', () => {
  assert.equal(withAlpha('var(--transit-accent)', 0.18), 'var(--transit-accent)')
  assert.equal(withAlpha('rgb(1 2 3)', 0.18), 'rgb(1 2 3)')
  assert.equal(withAlpha('#fff', 0.18), '#fff')
})
