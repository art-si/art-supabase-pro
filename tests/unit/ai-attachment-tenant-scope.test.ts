import assert from 'node:assert/strict'
import test from 'node:test'
import {
  areAttachmentImageUrlsInTenant,
  canReviewAiArtifactTenant,
  isValidAttachmentTenantId,
  resolveAttachmentOcrTenantId
} from '../../supabase/functions/_shared/ai-attachment-tenant-scope'

const projectUrl = 'https://example.supabase.co'
const ownTenant = '11111111-1111-4111-8111-111111111111'
const otherTenant = '22222222-2222-4222-8222-222222222222'
const ownImage = `${projectUrl}/storage/v1/object/public/attachments/${ownTenant}/license.png`
const otherImage = `${projectUrl}/storage/v1/object/public/attachments/${otherTenant}/license.png`

test('OCR accepts only project attachment images from one target tenant', () => {
  assert.equal(areAttachmentImageUrlsInTenant([ownImage], projectUrl, ownTenant), true)
  assert.equal(areAttachmentImageUrlsInTenant([otherImage], projectUrl, ownTenant), false)
  assert.equal(areAttachmentImageUrlsInTenant([ownImage, otherImage], projectUrl, ownTenant), false)
  assert.equal(
    areAttachmentImageUrlsInTenant(
      [`https://other.example/storage/v1/object/public/attachments/${ownTenant}/license.png`],
      projectUrl,
      ownTenant
    ),
    false
  )
  assert.equal(
    areAttachmentImageUrlsInTenant(
      [`${projectUrl}/storage/v1/object/public/attachments/${ownTenant}`],
      projectUrl,
      ownTenant
    ),
    false
  )
  assert.equal(isValidAttachmentTenantId('all'), false)
  assert.equal(isValidAttachmentTenantId(null), false)
})

test('ordinary OCR stays at home and platform-all defaults there until a tenant is selected', () => {
  const request = {
    actorTenantId: ownTenant,
    imageUrls: [ownImage],
    supabaseUrl: projectUrl
  }
  assert.equal(
    resolveAttachmentOcrTenantId({
      ...request,
      isPlatformSuper: false,
      requestedTenantId: otherTenant
    }),
    ownTenant
  )
  assert.equal(
    resolveAttachmentOcrTenantId({
      ...request,
      isPlatformSuper: false,
      requestedTenantId: otherTenant,
      imageUrls: [otherImage]
    }),
    null
  )
  assert.equal(
    resolveAttachmentOcrTenantId({
      ...request,
      isPlatformSuper: true,
      requestedTenantId: null
    }),
    ownTenant
  )
  assert.equal(
    resolveAttachmentOcrTenantId({
      ...request,
      isPlatformSuper: true,
      requestedTenantId: null,
      imageUrls: [otherImage]
    }),
    null
  )
  assert.equal(
    resolveAttachmentOcrTenantId({
      ...request,
      isPlatformSuper: true,
      requestedTenantId: otherTenant,
      imageUrls: [otherImage]
    }),
    otherTenant
  )
  assert.equal(
    resolveAttachmentOcrTenantId({
      ...request,
      isPlatformSuper: true,
      requestedTenantId: otherTenant
    }),
    null
  )
})

test('OCR review follows the saved artifact tenant and respects a concrete platform scope', () => {
  const review = {
    actorTenantId: ownTenant,
    artifactTenantId: otherTenant
  }
  assert.equal(
    canReviewAiArtifactTenant({
      ...review,
      isPlatformSuper: false,
      requestedTenantId: otherTenant
    }),
    false
  )
  assert.equal(
    canReviewAiArtifactTenant({
      ...review,
      isPlatformSuper: true,
      requestedTenantId: null
    }),
    true
  )
  assert.equal(
    canReviewAiArtifactTenant({
      ...review,
      isPlatformSuper: true,
      requestedTenantId: ownTenant
    }),
    false
  )
  assert.equal(
    canReviewAiArtifactTenant({
      ...review,
      isPlatformSuper: true,
      requestedTenantId: otherTenant
    }),
    true
  )
})
