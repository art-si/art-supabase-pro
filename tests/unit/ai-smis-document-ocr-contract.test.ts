import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareAiSmisCertificatePayloads,
  normalizeAiSmisCertificateResponse,
  validateAiSmisCertificatePayload
} from '../../supabase/functions/_shared/ai-smis-certificate-ocr-contract'
import {
  compareAiSmisInspectionReportPayloads,
  normalizeAiSmisInspectionReportResponse,
  validateAiSmisInspectionReportPayload
} from '../../supabase/functions/_shared/ai-smis-inspection-report-ocr-contract'

test('normalizes certificate OCR dates, confidence, and duplicate work items', () => {
  const result = normalizeAiSmisCertificateResponse({
    rawText: ' 姓名：张三\r\n证号：T001 ',
    summary: '识别到一张人员证件。',
    confidence: 1.2,
    fieldConfidence: { certificateNumber: 0.92, effectiveDate: -0.4 },
    warnings: ['姓名需核对', '姓名需核对'],
    certificate: {
      holderName: '张三',
      certificateNumber: ' T001 ',
      issuingAuthority: '应急管理部门',
      archiveNumber: 'A-01',
      approvalDate: '2026/01/02',
      effectiveDate: '2029年01月02日',
      workItemCodes: ['G1', 'G1', 'G2']
    }
  })

  assert.equal(result.confidence, 1)
  assert.equal(result.certificate.certificateNumber, 'T001')
  assert.equal(result.certificate.approvalDate, '2026-01-02')
  assert.equal(result.certificate.effectiveDate, '2029-01-02')
  assert.deepEqual(result.certificate.workItemCodes, ['G1', 'G2'])
  assert.deepEqual(result.warnings, ['姓名需核对'])
  assert.deepEqual(result.missingFields, [])
})

test('validates certificate OCR and records human corrections', () => {
  assert.equal(
    validateAiSmisCertificatePayload({
      confidence: 0.8,
      fieldConfidence: {},
      certificate: { certificateNumber: 'T001' }
    }).valid,
    true
  )
  assert.equal(validateAiSmisCertificatePayload({ confidence: 2, certificate: {} }).valid, false)
  assert.deepEqual(
    compareAiSmisCertificatePayloads(
      { certificateNumber: 'T001', issuingAuthority: '机构A', approvalDate: null },
      { certificateNumber: 'T001', issuingAuthority: '机构B' }
    ),
    {
      acceptedFields: ['certificateNumber'],
      correctedFields: ['issuingAuthority']
    }
  )
})

test('normalizes inspection-report OCR and rejects unsupported conclusions', () => {
  const result = normalizeAiSmisInspectionReportResponse({
    rawText: '报告编号：R001',
    confidence: 0.74,
    fieldConfidence: { conclusion: 0.81 },
    warnings: [],
    report: {
      reportNumber: 'R001',
      equipmentCode: 'EQ-01',
      inspectionDate: '2026.03.04',
      conclusion: 'operable_after_rectification',
      nextDueDate: '2027-03-04'
    }
  })

  assert.equal(result.report.inspectionDate, '2026-03-04')
  assert.equal(result.report.conclusion, 'operable_after_rectification')
  assert.deepEqual(result.missingFields, [])
  assert.equal(
    validateAiSmisInspectionReportPayload({
      confidence: 0.8,
      fieldConfidence: {},
      report: { conclusion: 'qualified' }
    }).valid,
    false
  )
})

test('compares inspection-report fields after human review', () => {
  assert.deepEqual(
    compareAiSmisInspectionReportPayloads(
      {
        inspectionDate: '2026-03-04',
        conclusion: 'operable',
        nextDueDate: '2027-03-04',
        remark: ''
      },
      {
        inspectionDate: '2026-03-04',
        conclusion: 'inoperable',
        nextDueDate: '2027-03-04'
      }
    ),
    {
      acceptedFields: ['inspectionDate', 'nextDueDate'],
      correctedFields: ['conclusion']
    }
  )
})
