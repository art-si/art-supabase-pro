import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateSpecialOperationPrecheck,
  type SpecialOperationPrecheckInput
} from '../../supabase/functions/_shared/ai-smis-special-operation-precheck-contract'

const completeInput = (): SpecialOperationPrecheckInput => ({
  operationTypeCode: 'HOT_WORK',
  operationTypeName: '动火作业',
  workContent: '设备管线焊接',
  workStartTime: '2026-09-15T08:00:00+08:00',
  workEndTime: '2026-09-15T10:00:00+08:00',
  workLocation: '一车间北侧管廊',
  workUnit: '检修班组',
  workSection: 'A-03 管线',
  hotWorkLevel: '一级',
  hotWorkMethodCount: 1,
  hazardFactorCount: 2,
  responsibleEmployeeSelected: true,
  guardianCount: 1,
  verifierCount: 1,
  briefingGiverCount: 1,
  briefingReceiverCount: 2,
  workerCount: 2,
  analystCount: 1,
  siteAnalysisTotal: 2,
  siteAnalysisCompleted: 2,
  safetyMeasureTotal: 5,
  safetyMeasureConfirmed: 5,
  sitePhotoCount: 2,
  relatedOperationCount: 0,
  requiredCustomFields: [{ label: '设备编号', present: true }],
  blindPlateItemCount: 0
})

test('完整动火作业票返回可继续人工复核', () => {
  const result = evaluateSpecialOperationPrecheck(completeInput())
  assert.equal(result.readiness, 'ready')
  assert.equal(result.blockers.length, 0)
  assert.equal(result.score, 100)
})

test('识别时间冲突、人员与现场分析缺项', () => {
  const input = completeInput()
  input.workEndTime = '2026-09-15T07:00:00+08:00'
  input.responsibleEmployeeSelected = false
  input.workerCount = 0
  input.guardianCount = 0
  input.siteAnalysisCompleted = 1
  const result = evaluateSpecialOperationPrecheck(input)
  assert.equal(result.readiness, 'blocked')
  const codes = result.blockers.map((item) => item.code)
  for (const code of [
    'work_time_invalid',
    'responsible_missing',
    'workers_missing',
    'guardian_missing',
    'site_analysis_incomplete'
  ]) {
    assert.equal(codes.includes(code), true)
  }
})

test('受限空间与盲板作业应用专属规则', () => {
  const confined = completeInput()
  confined.operationTypeCode = 'CONFINED_SPACE'
  confined.analystCount = 0
  assert.equal(
    evaluateSpecialOperationPrecheck(confined).blockers.some(
      (item) => item.code === 'analyst_missing'
    ),
    true
  )

  const blindPlate = completeInput()
  blindPlate.operationTypeCode = 'BLIND_PLATE'
  blindPlate.blindPlateItemCount = 0
  assert.equal(
    evaluateSpecialOperationPrecheck(blindPlate).blockers.some(
      (item) => item.code === 'blind_plate_items_missing'
    ),
    true
  )
})
