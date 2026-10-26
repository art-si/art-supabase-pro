import assert from 'node:assert/strict'
import test from 'node:test'
import type { PayableAutomationJob } from '../../src/api/payable-automation.types'
import { newPayableRelationConfig } from '../../src/utils/finance/payable-match'
import {
  newPayableAutomationConfiguration,
  validatePayableAutomationConfiguration,
  payableAutomationWritePayload,
  canRetryPayableAutomationJob
} from '../../src/utils/finance/payable-automation'

const scheme = {
  id: 'scheme',
  tenantId: 'tenant',
  code: 'AUTO',
  name: '独立关系',
  enabled: true,
  automatic: true,
  version: 7,
  relationRules: [newPayableRelationConfig('payable_red_blue')]
}
const book = { id: 'book', tenantId: 'tenant', name: '核算账套', code: 'BOOK', active: true }
const configuration = () => ({
  ...newPayableAutomationConfiguration(scheme),
  name: '后台核销',
  accountSetId: book.id
})

test('background execution and existing-balance processing are explicit opt-ins', () => {
  const model = newPayableAutomationConfiguration(scheme)
  assert.equal(model.enabled, false)
  assert.equal(model.processExisting, false)
  assert.equal(model.allowCrossParty, false)
  assert.equal(model.crossCurrencyMode, 'same_currency')
  assert.equal(model.expectedSchemeVersion, 7)
  assert.deepEqual(model.relations, ['payable_red_blue'])
  assert.equal(validatePayableAutomationConfiguration(configuration(), [scheme], [book]), '')
})

test('background scope cannot silently select a foreign-tenant or inactive book', () => {
  assert.match(
    validatePayableAutomationConfiguration(
      configuration(),
      [scheme],
      [{ ...book, tenantId: 'foreign' }]
    ),
    /同一租户/
  )
  assert.match(
    validatePayableAutomationConfiguration(
      { ...configuration(), enabled: true },
      [scheme],
      [{ ...book, active: false }]
    ),
    /可用的核算账套/
  )
  assert.match(
    validatePayableAutomationConfiguration(
      configuration(),
      [{ ...scheme, tenantId: undefined }],
      [book]
    ),
    /同一租户/
  )
})

test('enabling requires an enabled automatic scheme but disabled configuration can be prepared', () => {
  assert.equal(
    validatePayableAutomationConfiguration(configuration(), [scheme], [{ ...book, active: false }]),
    ''
  )
  const disabled = { ...scheme, automatic: false }
  assert.equal(validatePayableAutomationConfiguration(configuration(), [disabled], [book]), '')
  assert.match(
    validatePayableAutomationConfiguration(
      { ...configuration(), enabled: true },
      [disabled],
      [book]
    ),
    /自动核销开关/
  )
  assert.match(
    validatePayableAutomationConfiguration(
      { ...configuration(), enabled: true },
      [{ ...scheme, enabled: false }],
      [book]
    ),
    /自动核销开关/
  )
})

test('only distinct configured relations can run in the background', () => {
  assert.match(
    validatePayableAutomationConfiguration({ ...configuration(), relations: [] }, [scheme], [book]),
    /请选择/
  )
  assert.match(
    validatePayableAutomationConfiguration(
      { ...configuration(), relations: ['payable_payment'] },
      [scheme],
      [book]
    ),
    /未在当前/
  )
  assert.match(
    validatePayableAutomationConfiguration(
      { ...configuration(), relations: ['payable_red_blue', 'payable_red_blue'] },
      [scheme],
      [book]
    ),
    /不能重复/
  )
})

test('supplier receipt refund automation retains explicit currency and scope controls', () => {
  const refundScheme = { ...scheme, relationRules: [newPayableRelationConfig('payable_refund')] }
  const model = {
    ...newPayableAutomationConfiguration(refundScheme),
    name: '供应商退款后台核销',
    accountSetId: book.id
  }
  assert.deepEqual(model.relations, ['payable_refund'])
  assert.equal(model.enabled, false)
  assert.equal(model.allowCrossParty, false)
  assert.equal(model.crossCurrencyMode, 'same_currency')
  for (const crossCurrencyMode of ['same_currency', 'book_equivalent', 'full_pair'] as const) {
    assert.equal(
      validatePayableAutomationConfiguration(
        { ...model, enabled: true, crossCurrencyMode },
        [refundScheme],
        [book]
      ),
      ''
    )
  }
  assert.match(validatePayableAutomationConfiguration(model, [scheme], [book]), /未在当前/)
})

test('a new enabled automation cannot acknowledge unseen changed scheme conditions', () => {
  assert.match(
    validatePayableAutomationConfiguration(
      { ...configuration(), enabled: true, expectedSchemeVersion: 6 },
      [scheme],
      [book]
    ),
    /版本已变化/
  )
  assert.match(
    validatePayableAutomationConfiguration(
      { ...configuration(), enabled: true, expectedSchemeVersion: undefined },
      [scheme],
      [book]
    ),
    /版本已变化/
  )
  assert.equal(
    validatePayableAutomationConfiguration(
      { ...configuration(), enabled: false, expectedSchemeVersion: 6 },
      [scheme],
      [book]
    ),
    ''
  )
})

test('automation writes whitelist configuration and never accept an actor or tenant override', () => {
  const payload = payableAutomationWritePayload({
    ...configuration(),
    name: '  名称  ',
    version: 3,
    tenantId: 'forged',
    actorName: 'forged',
    jobCount: 99,
    schemeVersion: 999
  })
  assert.equal(payload.name, '名称')
  assert.equal(payload.configurationVersion, 1)
  assert.equal(payload.version, 3)
  assert.equal('tenantId' in payload, false)
  assert.equal('actorName' in payload, false)
  assert.equal('jobCount' in payload, false)
  assert.equal('schemeVersion' in payload, false)
})

test('reversed, completed and obsolete jobs are not resubmitted from history', () => {
  const job: PayableAutomationJob = {
    id: 'job',
    tenantId: 'tenant',
    automationId: 'configuration',
    automationName: '后台核销',
    automationVersion: 2,
    configurationVersion: 2,
    configurationEnabled: true,
    jobNo: 'APHXHT-1',
    relation: 'payable_red_blue',
    status: 'failed',
    sourceKind: 'payable',
    sourceId: 'source',
    sourceDocumentId: 'source',
    sourceDocumentNo: 'AP-1',
    businessDate: '2026-10-24',
    availableAt: '',
    actorName: '验收用户',
    attemptCount: 1,
    recordCount: 0,
    message: '',
    createdAt: ''
  }
  for (const status of ['failed', 'blocked', 'no_match'] as const)
    assert.equal(canRetryPayableAutomationJob({ ...job, status }), true)
  for (const status of ['pending', 'succeeded', 'cancelled'] as const)
    assert.equal(canRetryPayableAutomationJob({ ...job, status }), false)
  assert.equal(canRetryPayableAutomationJob({ ...job, configurationVersion: 3 }), false)
  assert.equal(canRetryPayableAutomationJob({ ...job, configurationEnabled: false }), false)
})
