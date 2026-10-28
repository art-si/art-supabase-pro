import { round } from 'lodash-es'
import type { WmsPurchaseLine } from '@/api/wms-purchase.types'

type FinancialLine = Pick<
  WmsPurchaseLine,
  | 'gift'
  | 'unitPrice'
  | 'taxInclusiveUnitPrice'
  | 'taxRate'
  | 'discountMethod'
  | 'unitDiscountRate'
  | 'discountAmount'
  | 'amount'
  | 'taxAmount'
  | 'totalAmount'
>

export interface WmsDocumentLineFinancial {
  discount: number
  amount: number
  tax: number
  total: number
}

/** Shared purchase and opening-sales line amounts; callers own return quantity and view state. */
export function calculateWmsDocumentLineFinancial(
  line: FinancialLine,
  displayQuantity: number,
  viewOpeningReturn: boolean
): WmsDocumentLineFinancial {
  if (viewOpeningReturn)
    return {
      discount: Math.abs(Number(line.discountAmount || 0)),
      amount: Math.abs(Number(line.amount || 0)),
      tax: Math.abs(Number(line.taxAmount || 0)),
      total: Math.abs(Number(line.totalAmount || 0))
    }
  if (line.gift) return { discount: 0, amount: 0, tax: 0, total: 0 }
  const rate = line.discountMethod === 'none' ? 0 : Number(line.unitDiscountRate || 0)
  const discount = round(displayQuantity * Number(line.taxInclusiveUnitPrice || 0) * rate, 2)
  const amount = round(displayQuantity * Number(line.unitPrice || 0) - discount, 2)
  const tax = round(
    (displayQuantity * Number(line.unitPrice || 0) * Number(line.taxRate || 0)) / 100,
    2
  )
  return { discount, amount, tax, total: round(amount + tax, 2) }
}
