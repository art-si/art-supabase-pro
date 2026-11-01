import type { ExcelColumn } from '@/utils/file'
import { getOwnRecordValue } from '@/utils/record'
import type { SqlResultSnapshot } from './result-compare'

/** Readable cell text shared by Excel and clipboard output; typed JSON preserves types. */
export function formatSqlResultCellText(row: Record<string, unknown>, property: string): string {
  const value = getOwnRecordValue(row, property)
  if (value === null) return 'NULL'
  if (typeof value === 'object')
    return JSON.stringify(value, (_key, nested: unknown) =>
      typeof nested === 'bigint' ? nested.toString() : nested
    )
  return String(value ?? '')
}

/** Excel remains a readable text export; typed JSON is the lossless alternative. */
export function createSqlResultExcelColumns(
  snapshot: SqlResultSnapshot
): ExcelColumn<Record<string, unknown>>[] {
  return snapshot.columns.map((column) => {
    const property = column.property ?? column.name
    return {
      key: property,
      title: column.name,
      // Generic Excel reads use Reflect.get; SQL text only reads exact own data fields.
      formatter: (_value, row) => formatSqlResultCellText(row, property)
    }
  })
}
