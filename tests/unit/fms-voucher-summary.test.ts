import assert from 'node:assert/strict'
import test from 'node:test'
import { formatVoucherSummary } from '../../modules/art-supabase-fms/src/views/modules/voucher-summary'

const taxTypes = [
  { value: 'vat', label: '增值税' },
  { value: 'surcharge', label: '附加税' }
]

test('tax summaries translate complete tax tokens and retain dates and spacing', () => {
  assert.equal(
    formatVoucherSummary('2025年第1期 vat 税费缴纳', [], { sourceType: 'tax', taxTypes }),
    '2025年第1期 增值税 税费缴纳'
  )
  assert.equal(
    formatVoucherSummary('2025年第1期  surcharge 税费缴纳', [], { sourceType: 'tax', taxTypes }),
    '2025年第1期  附加税 税费缴纳'
  )
})

test('unknown tax tokens, identifiers and unrelated sources remain intact', () => {
  const summary = 'private VAT-001 vat_code unknown 税费缴纳'
  assert.equal(formatVoucherSummary(summary, [], { sourceType: 'tax', taxTypes }), summary)
  assert.equal(
    formatVoucherSummary('vat 手工摘要', [], { sourceType: 'manual', taxTypes }),
    'vat 手工摘要'
  )
  assert.equal(formatVoucherSummary('vat 税费缴纳', [], { sourceType: 'tax' }), 'vat 税费缴纳')
})

test('existing bill events and waybill cost labels keep their source-specific behavior', () => {
  assert.equal(
    formatVoucherSummary('商业票据 · PJ001 · discount', [], {
      sourceType: 'commercial_bill',
      billEvents: [{ value: 'discount', label: '贴现' }],
      taxTypes
    }),
    '商业票据 · PJ001 · 贴现'
  )
  assert.equal(
    formatVoucherSummary('运单费用审核 · FY001 · parking', [{ value: 'parking', label: '停车费' }]),
    '运单费用审核 · FY001 · 停车费'
  )
})
