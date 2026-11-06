import assert from 'node:assert/strict'
import test from 'node:test'
import { getDictLabel } from '../../modules/art-supabase-tms/src/views/order-open/modules/order-open-model'

test('order form keeps a known payment label and conceals an unknown dictionary code', () => {
  const options = [{ label: '到付', value: 'collect' }]

  assert.equal(getDictLabel(options, 'collect'), '到付')
  assert.equal(getDictLabel(options, 'legacy_payment_code'), '待核对')
  assert.equal(getDictLabel(options, null), '')
})
