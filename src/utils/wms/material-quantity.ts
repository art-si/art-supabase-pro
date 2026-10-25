import Decimal from 'decimal.js-light'

const UnitDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export interface WmsMaterialUnits {
  baseUnitId?: string | null
  unitConversions?: readonly {
    sourceUnitId: string
    sourceFactor: number
    baseFactor: number
  }[]
}

function baseUnitsPerUnit(material: WmsMaterialUnits, unitId: string): Decimal | null {
  if (unitId === material.baseUnitId) return new UnitDecimal(1)
  const conversion = material.unitConversions?.find((item) => item.sourceUnitId === unitId)
  if (
    !conversion ||
    !Number.isFinite(conversion.sourceFactor) ||
    !Number.isFinite(conversion.baseFactor) ||
    conversion.sourceFactor <= 0 ||
    conversion.baseFactor <= 0
  )
    return null
  return new UnitDecimal(conversion.baseFactor).dividedBy(conversion.sourceFactor)
}

function roundedMaterialQuantity(value: Decimal): number | null {
  const converted = value.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber()
  return Number.isFinite(converted) ? converted : null
}

export function scaleWmsMaterialBaseQuantity(
  baseQuantity: number,
  previousQuantity: number,
  nextQuantity: number
): number | null {
  if (
    !Number.isFinite(baseQuantity) ||
    !Number.isFinite(previousQuantity) ||
    !Number.isFinite(nextQuantity) ||
    baseQuantity < 0 ||
    previousQuantity <= 0 ||
    nextQuantity < 0
  )
    return null
  return roundedMaterialQuantity(
    new UnitDecimal(baseQuantity).times(nextQuantity).dividedBy(previousQuantity)
  )
}

/** Return the quantity in the requested unit, or null when the material lacks a valid conversion. */
export function convertWmsMaterialQuantity(
  material: WmsMaterialUnits,
  quantity: number,
  fromUnitId: string,
  toUnitId: string
): number | null {
  if (!material.baseUnitId || !Number.isFinite(quantity) || quantity < 0) return null
  const sourceFactor = baseUnitsPerUnit(material, fromUnitId)
  const targetFactor = baseUnitsPerUnit(material, toUnitId)
  if (sourceFactor === null || targetFactor === null) return null
  return roundedMaterialQuantity(
    new UnitDecimal(quantity).times(sourceFactor).dividedBy(targetFactor)
  )
}
