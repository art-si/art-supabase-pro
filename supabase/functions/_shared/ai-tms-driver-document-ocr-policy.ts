import {
  DRIVER_OCR_IMAGE_TYPES,
  type DriverOcrImageSide
} from './ai-tms-driver-document-ocr-contract.ts'
import {
  areVmsVehicleDocumentImageUrlsInScope,
  isValidVmsVehicleDocumentTenantScope
} from './ai-vms-vehicle-document-ocr-contract.ts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface DriverOcrImageAuthorization {
  body: Record<string, unknown>
  imageUrls: string[]
  requestedTenantId: string | null
  appTenantId: string
  supabaseUrl: string
  checkPermission: (permission: 'TmsDriver:Add' | 'TmsDriver:Edit') => Promise<boolean>
  isPlatformSuper: () => Promise<boolean | null>
  getScopedDriver: (driverId: string) => Promise<Record<string, unknown> | null>
  getDriverTenant: (driverId: string) => Promise<string | null>
}

export async function authorizeDriverOcrImages(input: DriverOcrImageAuthorization): Promise<boolean> {
  const side = input.body.imageSide
  if (
    input.imageUrls.length !== 1 || typeof side !== 'string' ||
    !(side in DRIVER_OCR_IMAGE_TYPES)
  ) return false
  const driverId = input.body.driverId
  if (driverId != null && (typeof driverId !== 'string' || !uuidPattern.test(driverId))) {
    return false
  }
  if (!(await input.checkPermission(driverId ? 'TmsDriver:Edit' : 'TmsDriver:Add'))) return false
  const isPlatformSuper = await input.isPlatformSuper()
  if (isPlatformSuper === null) return false
  if (isPlatformSuper && !isValidVmsVehicleDocumentTenantScope(input.requestedTenantId)) {
    return false
  }

  let imageTenantId = isPlatformSuper ? input.requestedTenantId : input.appTenantId
  if (driverId) {
    const scopedDriver = await input.getScopedDriver(driverId)
    const access = scopedDriver?.field_access
    if (!access || typeof access !== 'object') return false
    const fieldAccess = access as Record<string, unknown>
    if (fieldAccess.identityDocuments !== 'edit') return false
    if (
      DRIVER_OCR_IMAGE_TYPES[side as DriverOcrImageSide] === 'identity' &&
      fieldAccess.idCardNo !== 'edit'
    ) return false
    const rowTenantId = await input.getDriverTenant(driverId)
    if (!rowTenantId) return false
    imageTenantId = rowTenantId
    if (isPlatformSuper && input.requestedTenantId && input.requestedTenantId !== rowTenantId) {
      return false
    }
  }
  return areVmsVehicleDocumentImageUrlsInScope(
    input.imageUrls, input.supabaseUrl, imageTenantId
  )
}
