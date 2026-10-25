import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterTenantDimensionDescriptors,
  isTenantDimensionDescriptor
} from '../../src/utils/tenant-dimension-visibility'

test('tenant dimension descriptors are recognized from labels and standard field names', () => {
  assert.equal(isTenantDimensionDescriptor({ label: '所属租户', prop: 'tenant.tenantName' }), true)
  assert.equal(isTenantDimensionDescriptor({ label: '租户名称', prop: 'tenantName' }), true)
  assert.equal(isTenantDimensionDescriptor({ label: '租户编码', prop: 'tenant_code' }), true)
  assert.equal(isTenantDimensionDescriptor({ label: '适用范围', key: 'tenantIds' }), true)
  assert.equal(isTenantDimensionDescriptor({ label: '所属组织', prop: 'organization.name' }), false)
})

test('tenant dimensions are hidden for ordinary tenant users and retained for platform users', () => {
  const descriptors = [
    { label: '员工姓名', prop: 'employeeName' },
    { label: '所属租户', prop: 'tenant.tenantName' },
    { label: '所属组织', prop: 'organization.organizationName' }
  ]

  assert.deepEqual(filterTenantDimensionDescriptors(descriptors, false), [
    descriptors[0],
    descriptors[2]
  ])
  assert.equal(filterTenantDimensionDescriptors(descriptors, true), descriptors)
})
