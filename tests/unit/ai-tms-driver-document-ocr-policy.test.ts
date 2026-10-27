import assert from 'node:assert/strict'
import test from 'node:test'
import {
  authorizeDriverOcrImages,
  type DriverOcrImageAuthorization
} from '../../supabase/functions/_shared/ai-tms-driver-document-ocr-policy'

const ownTenant = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
const otherTenant = '2824c2b5-2774-4781-b995-f55e8bcee920'
const driverId = '01234567-89ab-4cde-8f01-23456789abcd'
const userId = '3b65f565-a78a-423f-9ec1-0a487680f3c4'
const otherUserId = 'd923c459-6ab1-4981-ac35-8174717d4c76'
const objectId = '18f5c884-c2e8-49e9-9204-f9c7917e9947'
const image = (tenantId: string, owner = userId) => `${tenantId}/${owner}/${objectId}.png`

function input(overrides: Partial<DriverOcrImageAuthorization> = {}): DriverOcrImageAuthorization {
  return {
    body: { imageSide: 'idCardFrontUrl' },
    imageUrls: [image(ownTenant)],
    requestedTenantId: otherTenant,
    targetTenantId: ownTenant,
    appTenantId: ownTenant,
    userId,
    checkPermission: async () => true,
    isPlatformSuper: async () => false,
    getScopedDriver: async () => ({
      field_access: { identityDocuments: 'edit', idCardNo: 'edit' }
    }),
    getDriverTenant: async () => ownTenant,
    getStoredImagePath: async () => null,
    canSignImage: async () => true,
    ...overrides
  }
}

test('ordinary add uses authenticated tenant despite a forged header', async () => {
  let checkedPermission = ''
  const allowed = await authorizeDriverOcrImages(
    input({
      checkPermission: async (permission) => {
        checkedPermission = permission
        return true
      }
    })
  )
  assert.equal(allowed, true)
  assert.equal(checkedPermission, 'TmsDriver:Add')
  assert.equal(await authorizeDriverOcrImages(input({ imageUrls: [image(otherTenant)] })), false)
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        targetTenantId: otherTenant,
        imageUrls: [image(otherTenant)]
      })
    ),
    false
  )
})

test('existing driver requires edit permission, scoped row and editable sensitive fields', async () => {
  const existing = input({ body: { imageSide: 'idCardFrontUrl', driverId } })
  assert.equal(await authorizeDriverOcrImages(existing), true)
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        ...existing,
        checkPermission: async (permission) => permission !== 'TmsDriver:Edit'
      })
    ),
    false
  )
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        ...existing,
        getScopedDriver: async () => null
      })
    ),
    false
  )
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        ...existing,
        getScopedDriver: async () => ({
          field_access: { identityDocuments: 'read', idCardNo: 'edit' }
        })
      })
    ),
    false
  )
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        ...existing,
        getScopedDriver: async () => ({
          field_access: { identityDocuments: 'edit', idCardNo: 'masked' }
        })
      })
    ),
    false
  )
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        ...existing,
        imageUrls: [image(ownTenant, otherUserId)]
      })
    ),
    false
  )
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        ...existing,
        imageUrls: [image(ownTenant, otherUserId)],
        getStoredImagePath: async () => image(ownTenant, otherUserId)
      })
    ),
    true
  )
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        ...existing,
        canSignImage: async () => false
      })
    ),
    false
  )
})

test('platform selected tenant follows row tenant and blocks cross-tenant image', async () => {
  const selected = input({
    body: { imageSide: 'driverLicenseBackUrl', driverId },
    isPlatformSuper: async () => true,
    requestedTenantId: otherTenant,
    targetTenantId: otherTenant,
    imageUrls: [image(otherTenant)],
    getDriverTenant: async () => otherTenant
  })
  assert.equal(await authorizeDriverOcrImages(selected), true)
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        ...selected,
        imageUrls: [image(ownTenant)]
      })
    ),
    false
  )
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        ...selected,
        getDriverTenant: async () => ownTenant
      })
    ),
    false
  )
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        ...selected,
        requestedTenantId: null
      })
    ),
    true
  )
})

test('public URL, malformed path, invalid side and extra images fail closed', async () => {
  assert.equal(await authorizeDriverOcrImages(input({ imageUrls: ['not-a-url'] })), false)
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        imageUrls: [
          `https://example.supabase.co/storage/v1/object/public/attachments/${ownTenant}/x.png`
        ]
      })
    ),
    false
  )
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        body: { imageSide: 'portraitUrl' }
      })
    ),
    false
  )
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        imageUrls: [image(ownTenant), image(ownTenant)]
      })
    ),
    false
  )
  assert.equal(
    await authorizeDriverOcrImages(
      input({
        body: { imageSide: 'idCardFrontUrl', driverId: 'invalid' }
      })
    ),
    false
  )
})
