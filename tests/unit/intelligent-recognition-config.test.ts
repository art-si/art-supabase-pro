import assert from 'node:assert/strict'
import test from 'node:test'
import { getArtifactImageUrls } from '../../src/views/intelligent-recognition/modules/recognition-config'

function createArtifact(
  metadata: Api.IntelligentRecognition.RecognitionArtifactMetadata
): Api.IntelligentRecognition.RecognitionArtifact {
  return {
    id: '280a3a82-6a6b-41a0-91cf-dcf300000000',
    aiRunId: 'run-id',
    authUserId: 'user-id',
    feature: 'invoice_ocr',
    artifactType: 'tms_invoice_draft',
    status: 'pending',
    proposedPayload: {},
    metadata,
    createTime: '2026-08-09T00:00:00Z'
  }
}

test('recognition artifact exposes retained source image URLs', () => {
  const artifact = createArtifact({
    imageCount: 2,
    imageUrls: [' https://example.com/invoice-1.png ', 'https://example.com/invoice-2.png']
  })

  assert.deepEqual(getArtifactImageUrls(artifact), [
    'https://example.com/invoice-1.png',
    'https://example.com/invoice-2.png'
  ])
})

test('recognition artifact ignores invalid source image values', () => {
  const artifact = createArtifact({
    imageUrls: ['javascript:alert(1)', '', 'https://example.com/invoice.png']
  })

  assert.deepEqual(getArtifactImageUrls(artifact), ['https://example.com/invoice.png'])
})
