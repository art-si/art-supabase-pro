import type { PayableReportResponse, PayableReportRow } from '@/api/payable-report.types'
import { isPlainObjectRecord } from '@/utils/type-guards'

export const payableReportAmountKeys = [
  'occurrenceAmount',
  'reductionAmount',
  'balanceAmount',
  'baseBalanceAmount',
  'currentAmount',
  'age1To30',
  'age31To60',
  'age61To90',
  'age91To180',
  'ageOver180',
  'creditBalance'
] as const satisfies ReadonlyArray<keyof PayableReportRow>

export type PayableReportAmountKey = (typeof payableReportAmountKeys)[number]

export function isPayableReportResponse(value: unknown): value is PayableReportResponse {
  if (
    !isPlainObjectRecord(value) ||
    !Array.isArray(value.records) ||
    !Number.isSafeInteger(value.total) ||
    Number(value.total) < value.records.length ||
    !Number.isSafeInteger(value.unavailableCount) ||
    Number(value.unavailableCount) < 0 ||
    typeof value.asOfDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.asOfDate) ||
    !['detail', 'summary', 'aging'].includes(String(value.mode)) ||
    !['due', 'business'].includes(String(value.agingBasis)) ||
    !['oldest_due', 'proportional'].includes(String(value.allocationMode))
  )
    return false
  return value.records.every((row: unknown) => {
    if (!isPlainObjectRecord(row)) return false
    if (
      ![
        'id',
        'tenantId',
        'accountSetId',
        'partyId',
        'partyName',
        'currencyCode',
        'baseCurrencyCode'
      ].every((key) => typeof row[key] === 'string' && Boolean(row[key])) ||
      !['estimated', 'financial'].includes(String(row.kind)) ||
      !['supplier', 'carrier'].includes(String(row.partyType)) ||
      !['ready', 'amount_hidden', 'source_mismatch', 'history_incomplete'].includes(
        String(row.balanceState)
      ) ||
      row.amountReadable !== (row.balanceState === 'ready') ||
      !Number.isSafeInteger(row.documentCount) ||
      Number(row.documentCount) < 1 ||
      (value.mode === 'detail' &&
        (typeof row.documentId !== 'string' || typeof row.documentNo !== 'string'))
    )
      return false
    if (
      row.balanceState === 'ready' &&
      !['occurrenceAmount', 'reductionAmount', 'balanceAmount', 'baseBalanceAmount'].every(
        (key) => typeof row[key] === 'number' && Number.isFinite(row[key])
      )
    )
      return false
    return payableReportAmountKeys.every((key) =>
      row.balanceState !== 'ready'
        ? row[key] === null
        : row[key] === null || (typeof row[key] === 'number' && Number.isFinite(row[key]))
    )
  })
}
