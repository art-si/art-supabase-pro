import { normalizeNullableNumber } from '@/utils/form/normalize'

interface WmsImportRowContext {
  row: Record<string, unknown>
  code: string
  fileRow: number
}

export interface WmsMaterialImportRow extends WmsImportRowContext {
  quantity: number
}

export interface WmsDocumentImportRow extends WmsImportRowContext {
  amounts: { quantity: number; unitPrice: number; taxRate: number }
}

function assertImportRowCount(rows: readonly Record<string, unknown>[]): void {
  if (!rows.length || rows.length > 500)
    throw new Error('请选择包含 1 至 500 行明细的文件；必填列为物料编码、数量')
}

function readMaterialRow(row: Record<string, unknown>, fileRow: number): WmsMaterialImportRow {
  const code = String(row['物料编码'] ?? row.materialCode ?? '').trim()
  if (!code) throw new Error(`第 ${fileRow} 行请填写物料编码`)
  const quantity = normalizeNullableNumber(row['数量'] ?? row.quantity)
  if (quantity === null || quantity <= 0) throw new Error(`第 ${fileRow} 行数量必须为大于零的数字`)
  return { row, code, fileRow, quantity }
}

/** Positive-quantity imports validate the whole file before reading references or changing a draft. */
export function readWmsMaterialImportRows(
  rows: readonly Record<string, unknown>[]
): WmsMaterialImportRow[] {
  assertImportRowCount(rows)
  return rows.map((row, index) => readMaterialRow(row, index + 2))
}

/** Sales/purchase rows also validate prices and taxes in file-row order. */
export function readWmsDocumentImportRows(
  rows: readonly Record<string, unknown>[]
): WmsDocumentImportRow[] {
  assertImportRowCount(rows)
  return rows.map((row, index) => {
    const { code, fileRow, quantity } = readMaterialRow(row, index + 2)
    const unitPrice = normalizeNullableNumber(row['单价(元)'] ?? row.unitPrice ?? 0)
    const taxRate = normalizeNullableNumber(row['税率(%)'] ?? row.taxRate ?? 13)
    if (unitPrice === null || unitPrice < 0)
      throw new Error(`第 ${fileRow} 行单价必须为不小于零的数字`)
    if (taxRate === null || taxRate < 0 || taxRate > 100)
      throw new Error(`第 ${fileRow} 行税率必须为 0 至 100 的数字`)
    return { row, code, fileRow, amounts: { quantity, unitPrice, taxRate } }
  })
}
