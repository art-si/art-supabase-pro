import assert from 'node:assert/strict'
import test from 'node:test'
import { pickDefinedPayload } from '../../src/utils/form/pick-defined-payload'

test('write payload whitelists fields while preserving explicit empty business values', () => {
  const source = Object.freeze({
    code: 'A',
    count: 0,
    enabled: false,
    remark: null,
    omitted: undefined,
    extra: 1
  })
  assert.deepEqual(pickDefinedPayload(source, ['code', 'count', 'enabled', 'remark', 'omitted']), {
    code: 'A',
    count: 0,
    enabled: false,
    remark: null
  })
  assert.equal('extra' in source, true)
})
