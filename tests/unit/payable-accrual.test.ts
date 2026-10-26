import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPayableAccrualPolicyPayload,
  newPayableAccrualPolicy
} from '../../src/utils/finance/payable-accrual'
import { WMS_PURCHASE_INBOUND_PATH } from '../../src/router/business-paths'

test('automatic accrual defaults to paused and manual financial review', () => {
  const policy = newPayableAccrualPolicy()
  assert.equal(policy.id, undefined)
  assert.equal(policy.enabled, false)
  assert.equal(policy.autoApprove, false)
  assert.equal(policy.taxExcludedFromCost, true)
  assert.match(policy.effectiveFrom, /^\d{4}-\d{2}-\d{2}$/)
})

test('policy writes whitelist editable fields and do not choose an execution identity', () => {
  const payload = buildPayableAccrualPolicyPayload({
    ...newPayableAccrualPolicy(),
    id: 'policy',
    version: 7,
    code: ' qa_source ',
    name: ' 验收参数 ',
    organizationId: 'organization',
    accountSetId: 'book',
    remark: ' 备注 ',
    actorName: '只读执行人',
    generatedCount: 2,
    locked: true,
    tenantId: 'do-not-write'
  })
  assert.equal(payload.code, 'QA_SOURCE')
  assert.equal(payload.name, '验收参数')
  assert.equal(payload.remark, '备注')
  assert.equal(payload.version, 7)
  for (const field of ['actorName', 'generatedCount', 'locked', 'tenantId', 'actorAuthUserId'])
    assert.equal(field in payload, false)
})

test('independent parameter forms never retain a previous record identifier', () => {
  const first = newPayableAccrualPolicy()
  first.id = 'old'
  first.enabled = true
  const second = newPayableAccrualPolicy()
  assert.equal(second.id, undefined)
  assert.equal(second.enabled, false)
  assert.equal(WMS_PURCHASE_INBOUND_PATH, '/wms/inbound-business/purchase-inbound')
})
