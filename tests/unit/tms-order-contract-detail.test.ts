import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateContractTransportFee,
  createCargoItemFromContractDetail,
  synchronizeContractCargoFreight
} from '../../modules/art-supabase-tms/src/views/order-open/modules/order-contract-detail'

const detail = {
  key: 'contract:1',
  contractId: 'contract',
  contractNo: 'HT-001',
  contractName: '客户运输合同',
  cargoDescription: '钢材',
  cargoCode: 'CARGO-001',
  contractQuantity: 10,
  unit: 'ton',
  transportUnitPrice: null,
  freight: null
} satisfies Api.Tms.BasicData.ContractDetailSelectorItem

test('masked contract price does not become a zero freight amount', () => {
  const cargo = createCargoItemFromContractDetail(detail)
  assert.equal(cargo.unitPrice, null)
  assert.equal(cargo.freight, null)
  assert.equal(calculateContractTransportFee([cargo]), null)
  assert.deepEqual(synchronizeContractCargoFreight([cargo]), {
    hasContractCargo: true,
    transportFee: null
  })
  assert.equal(cargo.freight, null)
})

test('visible contract price calculates the selected cargo amount', () => {
  const cargo = createCargoItemFromContractDetail({ ...detail, transportUnitPrice: 12.5 })
  cargo.quantity = 3
  assert.deepEqual(synchronizeContractCargoFreight([cargo]), {
    hasContractCargo: true,
    transportFee: 37.5
  })
  assert.equal(cargo.freight, 37.5)
})
