import Decimal from 'decimal.js-light'

const PriceDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

function taxFactor(taxRate: number): Decimal {
  return new PriceDecimal(taxRate).dividedBy(100).plus(1)
}

/** Match PostgreSQL numeric round(price, 4) for document unit prices. */
export function calculateTaxInclusiveUnitPrice(unitPrice: number, taxRate: number): number {
  if (!Number.isFinite(unitPrice) || !Number.isFinite(taxRate)) return Number.NaN
  return new PriceDecimal(unitPrice).times(taxFactor(taxRate)).toDecimalPlaces(4).toNumber()
}

export function calculateTaxExclusiveUnitPrice(taxInclusivePrice: number, taxRate: number): number {
  if (!Number.isFinite(taxInclusivePrice) || !Number.isFinite(taxRate) || taxRate === -100)
    return Number.NaN
  return new PriceDecimal(taxInclusivePrice)
    .dividedBy(taxFactor(taxRate))
    .toDecimalPlaces(4)
    .toNumber()
}
