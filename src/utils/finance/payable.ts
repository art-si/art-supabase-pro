import type {
  PayablePaymentPlan,
  PurchasePayableDocument,
  PurchasePayableLine
} from '@/api/purchase-payable.types'
import { cloneDeep, round } from 'lodash-es'
import {
  convertWmsMaterialQuantity,
  scaleWmsMaterialBaseQuantity
} from '@/utils/wms/material-quantity'

export const payableStatusLabels = { draft: '暂存', submitted: '已提交', approved: '已审核' }
export const roundPayable = (value: number, digits = 2): number => {
  const rounded = Math.sign(value) * round(Math.abs(value), digits)
  return rounded === 0 ? 0 : rounded
}

export function payableLiabilityAmount(amount: number, isCredit?: boolean): number {
  return isCredit && amount !== 0 ? -Math.abs(amount) : amount
}

export function payableDocumentForEditing(
  source: PurchasePayableDocument
): PurchasePayableDocument {
  const document = cloneDeep(source)
  if (document.isCredit) {
    for (const line of document.lines) {
      line.amount = line.faceAmount ?? Math.abs(line.amount)
      line.taxAmount = line.faceTaxAmount ?? Math.abs(line.taxAmount)
      line.totalAmount = line.faceTotalAmount ?? Math.abs(line.totalAmount)
    }
  }
  return document
}

function configuredBaseQuantity(
  line: PurchasePayableLine,
  quantity = line.quantity
): number | undefined {
  if (!line.inventoryUnitId || !line.baseUnitId || !Number.isFinite(quantity) || quantity <= 0)
    return undefined
  if (line.inventoryUnitId === line.baseUnitId) return quantity
  return line.materialUnits
    ? (convertWmsMaterialQuantity(
        line.materialUnits,
        quantity,
        line.inventoryUnitId,
        line.baseUnitId
      ) ?? undefined)
    : undefined
}

export function calculatePayableLine(
  line: PurchasePayableLine,
  settings: Pick<
    PurchasePayableDocument,
    'inputTaxInclusivePrice' | 'inputAmount' | 'discountIncludesTax' | 'basis'
  >,
  changed:
    | 'unitPrice'
    | 'taxInclusiveUnitPrice'
    | 'quantity'
    | 'amount'
    | 'inventoryUnitId'
    | 'baseUnitId'
    | 'baseQuantity' = 'quantity',
  previousQuantity?: number
): PurchasePayableLine {
  if (changed === 'baseQuantity') return { ...line, baseQuantityEdited: true }
  if (changed === 'inventoryUnitId' || changed === 'baseUnitId') {
    return { ...line, baseQuantity: configuredBaseQuantity(line), baseQuantityEdited: false }
  }
  const taxFactor = 1 + Number(line.taxRate ?? 0) / 100
  const priceBasis =
    changed === 'unitPrice'
      ? 'net'
      : changed === 'taxInclusiveUnitPrice'
        ? 'gross'
        : line.priceBasis || 'net'
  const enteredPrice = roundPayable(
    Number((priceBasis === 'gross' ? line.taxInclusiveUnitPrice : line.unitPrice) || 0),
    4
  )
  const unitPrice = priceBasis === 'gross' ? enteredPrice / taxFactor : enteredPrice
  const taxInclusiveUnitPrice = priceBasis === 'gross' ? enteredPrice : enteredPrice * taxFactor
  const quantity = Number(line.quantity || 0)
  let baseQuantity = line.baseQuantity
  if (
    changed === 'quantity' &&
    quantity > 0 &&
    previousQuantity &&
    previousQuantity > 0 &&
    baseQuantity !== undefined
  ) {
    const configuredPrevious = configuredBaseQuantity(line, previousQuantity)
    const configuredNext = configuredBaseQuantity(line)
    baseQuantity =
      !line.baseQuantityEdited &&
      configuredPrevious !== undefined &&
      configuredPrevious === baseQuantity &&
      configuredNext !== undefined
        ? configuredNext
        : (scaleWmsMaterialBaseQuantity(baseQuantity, previousQuantity, quantity) ?? undefined)
  }
  const discountValue = Number(line.discountValue || 0)
  const priceBase = settings.discountIncludesTax === false ? unitPrice : taxInclusiveUnitPrice
  const discountAmount = roundPayable(
    line.discountMethod === 'rate'
      ? (quantity * priceBase * discountValue) / 100
      : line.discountMethod === 'unit'
        ? quantity * discountValue
        : 0
  )
  const discountNet =
    settings.discountIncludesTax === false ? discountAmount : discountAmount / taxFactor
  const amountEntry = settings.inputAmount || settings.basis === 'amount'
  const grossEntry = amountEntry && settings.inputTaxInclusivePrice !== false
  let amount = quantity * unitPrice - discountNet
  let totalAmount: number
  let taxAmount: number
  if (amountEntry) {
    if (grossEntry && changed !== 'amount') amount = Number(line.totalAmount || 0) / taxFactor
    else amount = Number(line.amount || 0)
  }
  amount = roundPayable(amount)
  if (grossEntry && changed !== 'amount') {
    totalAmount = roundPayable(Number(line.totalAmount || 0))
    taxAmount = roundPayable(totalAmount - amount)
  } else if (!amountEntry && priceBasis === 'gross') {
    totalAmount = roundPayable(
      quantity * taxInclusiveUnitPrice -
        (settings.discountIncludesTax === false ? discountAmount * taxFactor : discountAmount)
    )
    amount = roundPayable(totalAmount / taxFactor)
    taxAmount = roundPayable(totalAmount - amount)
  } else {
    taxAmount = roundPayable(amount * (taxFactor - 1))
    totalAmount = roundPayable(amount + taxAmount)
  }
  return {
    ...line,
    baseQuantity,
    unitPrice: roundPayable(unitPrice, 4),
    priceBasis,
    taxInclusiveUnitPrice: roundPayable(taxInclusiveUnitPrice, 4),
    discountAmount: roundPayable(discountAmount),
    amount: line.gift ? 0 : amount,
    taxAmount: line.gift ? 0 : taxAmount,
    totalAmount: line.gift ? 0 : totalAmount
  }
}

export function calculatePaymentPlans(
  plans: PayablePaymentPlan[],
  total: number,
  byRatio: boolean
): PayablePaymentPlan[] {
  const calculated = plans.map((plan) => ({
    ...plan,
    ratio: byRatio ? plan.ratio : total ? roundPayable((plan.amount / total) * 100, 6) : 0,
    amount: byRatio ? roundPayable((total * plan.ratio) / 100) : roundPayable(plan.amount)
  }))
  if (
    byRatio &&
    calculated.length &&
    roundPayable(
      plans.reduce((sum, plan) => sum + plan.ratio, 0),
      6
    ) === 100
  ) {
    const last = calculated[calculated.length - 1]
    last.amount = roundPayable(
      total - calculated.slice(0, -1).reduce((sum, plan) => sum + plan.amount, 0)
    )
  }
  return calculated
}

export function validatePaymentPlans(plans: PayablePaymentPlan[], total: number): string | null {
  if (!plans.length) return null
  if (
    plans.some(
      (plan) => !isValidPlanDate(plan.dueDate) || plan.amount < 0 || !Number.isFinite(plan.amount)
    )
  )
    return '请填写每期到期日期及有效的应付金额'
  if (roundPayable(plans.reduce((sum, plan) => sum + plan.amount, 0) - total) !== 0)
    return '付款计划金额合计必须等于单据价税合计'
  return null
}

function isValidPlanDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function payableCostDifference(
  estimated: { amount: number; totalAmount: number; taxExcludedFromCost: boolean },
  financial: { amount: number; totalAmount: number; taxExcludedFromCost: boolean }
): number {
  return roundPayable(
    (financial.taxExcludedFromCost ? financial.amount : financial.totalAmount) -
      (estimated.taxExcludedFromCost ? estimated.amount : estimated.totalAmount)
  )
}
