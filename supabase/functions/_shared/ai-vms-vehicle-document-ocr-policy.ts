import {
  areVmsVehicleDocumentImageUrlsInScope,
  isValidVmsVehicleDocumentTenantScope
} from './ai-vms-vehicle-document-ocr-contract.ts'

export type VehicleOcrDocumentType = 'driving_license' | 'operation_license'

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const uuidPattern = new RegExp(`^${uuid}$`, 'i')
const privateImagePath = new RegExp(`^(${uuid})/(${uuid})/(${uuid})\\.(png|jpg|webp)$`, 'i')

export function isVmsPrivateOcrImagePath(value: string): boolean {
  return privateImagePath.test(value)
}

export interface VehicleOcrImageAuthorization {
  body: Record<string, unknown>
  imageUrls: string[]
  requestedTenantId: string | null
  appTenantId: string
  userId: string
  supabaseUrl: string
  checkPermission: (permission: 'VehicleArchive:Add' | 'VehicleArchive:Edit') => Promise<boolean>
  isPlatformSuper: () => Promise<boolean | null>
  getScopedVehicle: (id: string) => Promise<Record<string, unknown> | null>
  getVehicleTenant: (id: string) => Promise<string | null>
  getStoredImage: (id: string, type: VehicleOcrDocumentType) => Promise<string | null>
  canSignPrivateImage: (path: string) => Promise<boolean>
}

export async function authorizeVehicleOcrImages(input: VehicleOcrImageAuthorization): Promise<boolean> {
  if (input.imageUrls.length !== 1) return false
  const documentType = input.body.documentType
  if (documentType !== 'driving_license' && documentType !== 'operation_license') return false
  const vehicleId = input.body.vehicleId
  if (vehicleId != null && (typeof vehicleId !== 'string' || !uuidPattern.test(vehicleId))) return false
  if (!(await input.checkPermission(vehicleId ? 'VehicleArchive:Edit' : 'VehicleArchive:Add'))) return false
  const platformSuper = await input.isPlatformSuper()
  if (platformSuper === null || !isValidVmsVehicleDocumentTenantScope(input.requestedTenantId)) return false
  const explicitTenant = input.body.targetTenantId
  if (explicitTenant != null && (typeof explicitTenant !== 'string' || !uuidPattern.test(explicitTenant))) return false
  if (!platformSuper && explicitTenant && explicitTenant !== input.appTenantId) return false

  let tenantId = platformSuper
    ? (explicitTenant as string | null) ?? input.requestedTenantId ?? input.appTenantId
    : input.appTenantId
  let storedImage: string | null = null
  if (vehicleId) {
    const scoped = await input.getScopedVehicle(vehicleId)
    const access = scoped?.field_access
    if (!access || typeof access !== 'object' ||
      (access as Record<string, unknown>).documents !== 'edit') return false
    const rowTenant = await input.getVehicleTenant(vehicleId)
    if (!rowTenant) return false
    if (platformSuper && input.requestedTenantId && input.requestedTenantId !== rowTenant) return false
    if (explicitTenant && explicitTenant !== rowTenant) return false
    tenantId = rowTenant
    storedImage = await input.getStoredImage(vehicleId, documentType)
  }

  const image = input.imageUrls[0]
  if (isVmsPrivateOcrImagePath(image)) {
    const [imageTenant, imageOwner] = image.split('/')
    if (imageTenant !== tenantId) return false
    if (storedImage !== image && imageOwner !== input.userId) return false
    return input.canSignPrivateImage(image)
  }
  return Boolean(vehicleId && storedImage === image &&
    areVmsVehicleDocumentImageUrlsInScope([image], input.supabaseUrl, tenantId))
}
