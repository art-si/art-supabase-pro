import type { DataSelectRecord } from '@/components/core/forms/art-data-select/types'
import type { MaterialSelectRecord } from '@/components/business/art-material-select/types'
import type { WmsPurchaseMaterial } from '@/api/wms-purchase.types'

function isUnitConversion(
  value: unknown
): value is { sourceUnitId: string; sourceFactor: number; baseFactor: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const conversion = value as Record<string, unknown>
  return (
    typeof conversion.sourceUnitId === 'string' &&
    conversion.sourceUnitId.length > 0 &&
    typeof conversion.sourceFactor === 'number' &&
    Number.isFinite(conversion.sourceFactor) &&
    conversion.sourceFactor > 0 &&
    typeof conversion.baseFactor === 'number' &&
    Number.isFinite(conversion.baseFactor) &&
    conversion.baseFactor > 0
  )
}

export function createWmsMaterialFromSelectRow(
  row: DataSelectRecord,
  tenantId: string
):
  | (WmsPurchaseMaterial & Pick<MaterialSelectRecord, 'drawingNo' | 'brand' | 'materialSource'>)
  | null {
  if (
    !tenantId.trim() ||
    (typeof row.tenantId === 'string' && row.tenantId !== tenantId) ||
    typeof row.id !== 'string' ||
    !row.id.trim() ||
    typeof row.code !== 'string' ||
    !row.code.trim() ||
    typeof row.name !== 'string' ||
    !row.name.trim()
  ) {
    return null
  }

  return {
    id: row.id,
    tenantId,
    code: row.code,
    name: row.name,
    drawingNo: typeof row.drawingNo === 'string' ? row.drawingNo : null,
    brand: typeof row.brand === 'string' ? row.brand : null,
    materialSource: typeof row.materialSource === 'string' ? row.materialSource : null,
    description: typeof row.description === 'string' ? row.description : null,
    specificationModel: typeof row.specificationModel === 'string' ? row.specificationModel : null,
    inventoryUnitId: typeof row.inventoryUnitId === 'string' ? row.inventoryUnitId : null,
    baseUnitId: typeof row.baseUnitId === 'string' ? row.baseUnitId : null,
    auxiliaryUnitId: typeof row.auxiliaryUnitId === 'string' ? row.auxiliaryUnitId : null,
    auxiliaryUnit2Id: typeof row.auxiliaryUnit2Id === 'string' ? row.auxiliaryUnit2Id : null,
    unitConversions: Array.isArray(row.unitConversions)
      ? row.unitConversions.filter(isUnitConversion)
      : [],
    serialManagementEnabled: row.serialManagementEnabled === true,
    batchManagementEnabled: row.batchManagementEnabled === true
  }
}
