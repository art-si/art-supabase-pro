import type {
  PayableStockCostBatch,
  PayableStockCostLine,
  PayableStockCostPreview
} from '@/api/purchase-payable.types'
import { isPlainObjectRecord } from '@/utils/type-guards'

export const payableStockCostUnitFormat = {
  maximumFractionDigits: 20,
  minimumFractionDigits: 0,
  useGrouping: false
} as const satisfies Intl.NumberFormatOptions

function isStockCostBatch(value: unknown): value is PayableStockCostBatch {
  return (
    isPlainObjectRecord(value) &&
    ['id', 'organizationId', 'warehouseId', 'ownerType'].every(
      (key) => typeof value[key] === 'string' && Boolean(value[key])
    ) &&
    typeof value.batchNo === 'string' &&
    typeof value.quantity === 'number' &&
    Number.isFinite(value.quantity) &&
    value.quantity > 0 &&
    typeof value.unitCost === 'number' &&
    Number.isFinite(value.unitCost) &&
    value.unitCost >= 0 &&
    ['organizationName', 'warehouseName', 'accountSetId', 'accountSetName'].every(
      (key) => value[key] === null || typeof value[key] === 'string'
    ) &&
    ['afterUnitCost', 'adjustmentAmount'].every(
      (key) =>
        value[key] === null || (typeof value[key] === 'number' && Number.isFinite(value[key]))
    )
  )
}

function isStockCostLine(value: unknown): value is PayableStockCostLine {
  if (!isPlainObjectRecord(value)) return false
  return (
    [
      'financialLineId',
      'sourceLineId',
      'sourceDocumentNo',
      'sourceBaseUnitName',
      'tenantId',
      'accountSetId',
      'currencyCode'
    ].every((key) => typeof value[key] === 'string' && Boolean(value[key])) &&
    Number.isSafeInteger(value.lineNo) &&
    Number(value.lineNo) > 0 &&
    [
      'logicalQuantity',
      'physicalQuantity',
      'basicQuantity',
      'originalAmount',
      'actualCostAmount',
      'apCostDifference',
      'baselineDifference',
      'adjustmentAmount',
      'stockQuantity',
      'transitQuantity',
      'stockValue',
      'valuationGap'
    ].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key])) &&
    ['logicalQuantity', 'physicalQuantity', 'basicQuantity'].every(
      (key) => Number(value[key]) > 0
    ) &&
    ['originalAmount', 'actualCostAmount', 'stockQuantity', 'transitQuantity', 'stockValue'].every(
      (key) => Number(value[key]) >= 0
    ) &&
    ['allStock', 'matched', 'mixedSource'].every((key) => typeof value[key] === 'boolean') &&
    ['materialCode', 'materialDescription'].every(
      (key) => value[key] === null || typeof value[key] === 'string'
    ) &&
    (value.matchedDate === null ||
      (typeof value.matchedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.matchedDate))) &&
    Array.isArray(value.batches) &&
    value.batches.every(isStockCostBatch)
  )
}

export function isPayableStockCostPreview(value: unknown): value is PayableStockCostPreview {
  if (
    !isPlainObjectRecord(value) ||
    ![
      'id',
      'documentNo',
      'tenantId',
      'tenantName',
      'accountSetId',
      'accountSetName',
      'baseCurrencyCode',
      'previewToken'
    ].every((key) => typeof value[key] === 'string' && Boolean(value[key])) ||
    !['costDate', 'minimumDate'].every(
      (key) => typeof value[key] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value[key])
    ) ||
    (value.supplierName !== null && typeof value.supplierName !== 'string') ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 0 ||
    !Array.isArray(value.lines) ||
    !value.lines.every(isStockCostLine)
  )
    return false
  return value.lines.every(
    (line) =>
      line.tenantId === value.tenantId &&
      line.accountSetId === value.accountSetId &&
      line.currencyCode === value.baseCurrencyCode
  )
}

export function payableStockCostBlocker(preview: PayableStockCostPreview): string {
  if (!preview.lines.length) return '当前单据没有可核对的物料明细，请检查采购来源。'
  const pending = preview.lines.filter((line) => !line.matched)
  if (!pending.length) return '全部明细已完成成本勾稽，当前展示执行时的金额与批次快照。'
  if (preview.minimumDate > preview.costDate)
    return '原单或库存业务日期晚于今天，暂不能进行成本勾稽。'
  if (pending.some((line) => !line.allStock || line.mixedSource || line.transitQuantity > 0))
    return '来源包含已发出、在途或混合库存，请先核对相应成本分配方案，不能直接改写现存批次单价。'
  if (pending.some((line) => line.valuationGap !== 0))
    return '库存金额与已登记成本流水不一致，请先核对批次计价后重新预览。'
  if (
    pending.some((line) =>
      line.batches.some((batch) => batch.accountSetId !== preview.accountSetId)
    )
  )
    return '相关库存组织未明确归属当前核算账套，请核对逐批次账套映射后再勾稽。'
  if (
    pending.some(
      (line) =>
        !line.batches.length ||
        line.batches.some(
          (batch) =>
            batch.ownerType !== 'self' ||
            batch.afterUnitCost === null ||
            batch.afterUnitCost < 0 ||
            batch.adjustmentAmount === null
        )
    )
  )
    return '存在非自有库存或无法形成有效金额分配的批次，请核对库存计价后重试。'
  return ''
}
