import assert from 'node:assert/strict'
import test from 'node:test'
import {
  authorizeVehicleOcrImages,
  type VehicleOcrImageAuthorization
} from '../../supabase/functions/_shared/ai-vms-vehicle-document-ocr-policy'

const tenant = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
const otherTenant = '2824c2b5-2774-4781-b995-f55e8bcee920'
const actor = 'ab881b32-87d4-4dce-9014-ce488b8069df'
const otherActor = '2e294b61-24a9-4eaf-8fac-1daffc1e6131'
const vehicleId = 'a9fc0004-1023-4620-9220-000000000001'
const image = `${tenant}/${actor}/34f44960-d3ea-4e88-893e-f0eb9ec8910a.png`
const storedOther = `${tenant}/${otherActor}/34f44960-d3ea-4e88-893e-f0eb9ec8910b.png`

function input(
  overrides: Partial<VehicleOcrImageAuthorization> = {}
): VehicleOcrImageAuthorization {
  return {
    body: { documentType: 'driving_license', vehicleId },
    imageUrls: [image],
    requestedTenantId: null,
    appTenantId: tenant,
    userId: actor,
    supabaseUrl: 'https://example.supabase.co',
    checkPermission: async () => true,
    isPlatformSuper: async () => false,
    getScopedVehicle: async () => ({ field_access: { documents: 'edit' } }),
    getVehicleTenant: async () => tenant,
    getStoredImage: async () => image,
    canSignPrivateImage: async () => true,
    ...overrides
  }
}

test('private vehicle document OCR allows a scoped stored image and a fresh owned draft', async () => {
  assert.equal(await authorizeVehicleOcrImages(input()), true)
  assert.equal(
    await authorizeVehicleOcrImages(
      input({
        body: { documentType: 'driving_license' },
        getStoredImage: async () => null
      })
    ),
    true
  )
  assert.equal(
    await authorizeVehicleOcrImages(
      input({
        imageUrls: [storedOther],
        getStoredImage: async () => storedOther
      })
    ),
    true
  )
})

test('private vehicle OCR rejects cross-tenant, unowned, hidden, and unsignable images', async () => {
  assert.equal(
    await authorizeVehicleOcrImages(
      input({
        imageUrls: [image.replace(tenant, otherTenant)]
      })
    ),
    false
  )
  assert.equal(
    await authorizeVehicleOcrImages(
      input({
        imageUrls: [storedOther],
        getStoredImage: async () => null
      })
    ),
    false
  )
  assert.equal(
    await authorizeVehicleOcrImages(
      input({
        getScopedVehicle: async () => ({ field_access: { documents: 'hidden' } })
      })
    ),
    false
  )
  assert.equal(
    await authorizeVehicleOcrImages(
      input({
        canSignPrivateImage: async () => false
      })
    ),
    false
  )
  assert.equal(
    await authorizeVehicleOcrImages(
      input({
        imageUrls: [image.replace('.png', '.pdf')]
      })
    ),
    false
  )
  assert.equal(
    await authorizeVehicleOcrImages(
      input({
        requestedTenantId: otherTenant,
        isPlatformSuper: async () => true
      })
    ),
    false
  )
})

test('legacy public image OCR requires an exact stored image on a scoped vehicle', async () => {
  const legacy = `https://example.supabase.co/storage/v1/object/public/attachments/${tenant}/2026/10/26/legacy.png`
  assert.equal(
    await authorizeVehicleOcrImages(
      input({
        imageUrls: [legacy],
        getStoredImage: async () => legacy
      })
    ),
    true
  )
  assert.equal(
    await authorizeVehicleOcrImages(
      input({
        imageUrls: [legacy],
        getStoredImage: async () => null
      })
    ),
    false
  )
  assert.equal(
    await authorizeVehicleOcrImages(
      input({
        imageUrls: [legacy.replace('example.supabase.co', 'attacker.test')],
        getStoredImage: async () => legacy.replace('example.supabase.co', 'attacker.test')
      })
    ),
    false
  )
})
