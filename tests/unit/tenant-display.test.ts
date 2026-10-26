import assert from 'node:assert/strict'
import test from 'node:test'
import { toTenantSelectOptions } from '../../src/utils/tenant-display'

test('tenant select options show one stable identity without duplicating a missing name', () => {
  assert.deepEqual(
    toTenantSelectOptions([
      { id: 'tenant-a', tenantName: ' 验收租户 ', tenantCode: ' QA ' },
      { id: 'tenant-b', tenantName: '', tenantCode: 'ONLY-CODE' },
      { id: 'tenant-c', tenantName: '', tenantCode: '' }
    ]),
    [
      { label: '验收租户（QA）', value: 'tenant-a' },
      { label: 'ONLY-CODE', value: 'tenant-b' },
      { label: 'tenant-c', value: 'tenant-c' }
    ]
  )
})
