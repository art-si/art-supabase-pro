import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeVmsVehicleDocumentOcrResponse,
  validateVmsVehicleDocumentOcrPayload
} from '../../supabase/functions/_shared/ai-vms-vehicle-document-ocr-contract'

test('vehicle OCR normalizes document fields and requires structured confidence', () => {
  const result = normalizeVmsVehicleDocumentOcrResponse({
    rawText: ' 车牌号：测试A12345 ',
    confidence: 1.3,
    fieldConfidence: { plateNo: 0.9 },
    warnings: [],
    document: { plateNo: ' 测试A12345 ', registerDate: '2026/09/29' }
  })
  assert.equal(result.document.plateNo, '测试A12345')
  assert.equal(result.document.registerDate, '2026-09-29')
  assert.equal(result.confidence, 1)
  assert.equal(
    validateVmsVehicleDocumentOcrPayload({
      rawText: '号牌号码：测试A12345',
      confidence: 0.9,
      fieldConfidence: {},
      document: { plateNo: '测试A12345' }
    }).valid,
    true
  )
  assert.equal(validateVmsVehicleDocumentOcrPayload({ confidence: 2, document: {} }).valid, false)
  assert.deepEqual(
    validateVmsVehicleDocumentOcrPayload({
      rawText: '',
      confidence: 0.9,
      fieldConfidence: {},
      document: {}
    }).errors,
    ['document_fields_missing', 'image_text_missing']
  )
})
