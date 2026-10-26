import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DRIVER_OCR_IMAGE_TYPES,
  normalizeDriverOcrResponse,
  validateDriverOcrPayload
} from '../../supabase/functions/_shared/ai-tms-driver-document-ocr-contract'

test('driver OCR maps every supported certificate image to its document kind', () => {
  assert.equal(DRIVER_OCR_IMAGE_TYPES.idCardBackUrl, 'identity')
  assert.equal(DRIVER_OCR_IMAGE_TYPES.licenseBackExtraUrl, 'license')
  assert.equal(DRIVER_OCR_IMAGE_TYPES.qualificationAssessmentUrl, 'qualification')
})

test('driver OCR keeps dates and classes structured for manual review', () => {
  const result = normalizeDriverOcrResponse({
    rawText: '档案编号 1234', confidence: 0.87,
    fieldConfidence: { licenseArchiveNo: 0.7 },
    document: {
      licenseArchiveNo: ' 1234 ', licenseClasses: ['A2', 'B2'],
      licenseExpireDate: '2029/12/31'
    }
  })
  assert.equal(result.document.licenseArchiveNo, '1234')
  assert.deepEqual(result.document.licenseClasses, ['A2', 'B2'])
  assert.equal(result.document.licenseExpireDate, '2029-12-31')
  assert.equal(result.fieldConfidence.licenseArchiveNo, 0.7)
})

test('driver OCR rejects empty images and invalid confidence', () => {
  assert.equal(validateDriverOcrPayload({
    rawText: '', confidence: 0.9, fieldConfidence: {}, document: { driverName: null }
  }).valid, false)
  assert.equal(validateDriverOcrPayload({
    rawText: '司机姓名 张某', confidence: 1.3,
    fieldConfidence: {}, document: { driverName: '张某' }
  }).valid, false)
  assert.equal(validateDriverOcrPayload({
    rawText: '司机姓名 张某', confidence: 0.9,
    fieldConfidence: {}, document: { driverName: '张某' }
  }).valid, true)
})
