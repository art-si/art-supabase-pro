import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRecognitionBusinessRoute } from '../../src/utils/intelligent-recognition'
import { financePaths } from '../../src/router/business-paths'

function createArtifact(
  feature: Api.IntelligentRecognition.Feature,
  proposedPayload: Record<string, unknown>
): Api.IntelligentRecognition.RecognitionArtifact {
  return {
    id: 'artifact-id',
    aiRunId: 'run-id',
    authUserId: 'user-id',
    feature,
    artifactType: 'draft',
    status: 'pending',
    proposedPayload,
    rawOcrText: '原始识别内容',
    createTime: '2026-08-10T00:00:00Z'
  }
}

test('waybill expense review returns to the finance cost workflow', () => {
  const artifact = createArtifact('waybill_expense_ocr', {})

  assert.deepEqual(buildRecognitionBusinessRoute(artifact), {
    path: financePaths.waybillCost,
    query: { aiArtifactId: 'artifact-id' }
  })
})
