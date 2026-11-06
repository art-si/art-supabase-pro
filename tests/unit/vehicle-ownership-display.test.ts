import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getVehicleOwnershipOrganization } from '../../src/utils/business/vehicle-ownership-display'

test('自营车辆展示所属公司，不使用历史承运商', () => {
  assert.deepEqual(
    getVehicleOwnershipOrganization({
      vehicleOwnership: 'self_operated',
      companyName: ' 自营公司 ',
      carrier: { companyName: '历史承运商' }
    }),
    { label: '所属公司', name: '自营公司' }
  )
})

for (const vehicleOwnership of ['carrier', 'third_party']) {
  test(`${vehicleOwnership} 展示所属承运商，不使用历史公司`, () => {
    assert.deepEqual(
      getVehicleOwnershipOrganization({
        vehicleOwnership,
        companyName: '历史公司',
        carrier: { companyName: ' 所属承运商 ' }
      }),
      { label: '所属承运商', name: '所属承运商' }
    )
  })
  test(`${vehicleOwnership} 缺少承运商时保留准确的空状态`, () => {
    assert.deepEqual(
      getVehicleOwnershipOrganization({ vehicleOwnership, companyName: '历史公司' }),
      { label: '所属承运商', name: '' }
    )
  })
}

test('个人挂靠不展示不适用的公司，也不额外暴露车主信息', () => {
  assert.equal(
    getVehicleOwnershipOrganization({
      vehicleOwnership: 'individual_affiliation',
      companyName: '历史公司'
    }),
    null
  )
})

test('旧档案未标归属时保留所属公司的展示', () => {
  assert.deepEqual(getVehicleOwnershipOrganization({ companyName: '历史自营公司' }), {
    label: '所属公司',
    name: '历史自营公司'
  })
  assert.deepEqual(
    getVehicleOwnershipOrganization({ vehicleOwnership: 'self_operated', companyName: ' ' }),
    { label: '所属公司', name: '' }
  )
  assert.equal(getVehicleOwnershipOrganization(null), null)
})
