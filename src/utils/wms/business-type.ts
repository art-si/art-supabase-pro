export interface WmsBusinessTypeAssignment {
  documentTypeIds?: string[]
  menuIds?: string[]
  enabled?: boolean
}

export function isWmsBusinessTypeAvailable(
  businessType: WmsBusinessTypeAssignment,
  documentTypeId: string,
  menuId: string
): boolean {
  return Boolean(
    documentTypeId &&
    menuId &&
    businessType.enabled &&
    businessType.documentTypeIds?.includes(documentTypeId) &&
    businessType.menuIds?.includes(menuId)
  )
}
