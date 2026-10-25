const TEXT_FIELDS = [
  'originStationName',
  'destinationStationName',
  'transferStationName',
  'deliveryMethod',
  'shippingCustomerName',
  'shippingContactName',
  'shippingContactPhone',
  'shippingAddressDetail',
  'receivingCustomerName',
  'receivingContactName',
  'receivingContactPhone',
  'receivingAddressDetail',
  'paymentMethod',
  'transportMode',
  'orderRemark'
] as const

const NUMBER_FIELDS = [
  'transportFee',
  'deliveryFee',
  'unloadingFee',
  'collectPaymentFee',
  'transferFee',
  'declaredValue',
  'insuranceFee',
  'packageFee',
  'otherFee',
  'cashAmount',
  'collectAmount',
  'monthlyAmount',
  'codAmount',
  'handlingFee'
] as const

const CONFIG_TEXT_FIELDS = [
  'loadType',
  'billingMode',
  'billingUnit',
  'cargoCategory',
  'packaging',
  'trackingMethod',
  'trackingNumber',
  'remark'
] as const
const CONFIG_BOOLEAN_FIELDS = ['allowConsolidation', 'selfPickup', 'insured'] as const
const CONFIG_NUMBER_FIELDS = ['truckCount', 'tempMinC', 'tempMaxC'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

function isNullableNonNegativeNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

function flattenFieldConfidence(
  value: unknown,
  path: string,
  result: Record<string, number>,
  depth = 0
): void {
  if (Object.keys(result).length >= 60 || depth > 4) return

  const confidence = typeof value === 'number' ? value : Number(value)
  if (value !== '' && Number.isFinite(confidence)) {
    if (path) result[path] = confidence
    return
  }

  if (Array.isArray(value)) {
    value.slice(0, 20).forEach((item, index) => {
      flattenFieldConfidence(item, path ? `${path}.${index}` : String(index), result, depth + 1)
    })
    return
  }

  if (!isRecord(value)) return
  Object.entries(value).forEach(([field, item]) => {
    flattenFieldConfidence(item, path ? `${path}.${field}` : field, result, depth + 1)
  })
}

/**
 * Provider models occasionally return nested confidence metadata for cargo items.
 * Keep the business payload strict while flattening this non-critical metadata into
 * the Record<string, number> shape consumed by the review UI and audit table.
 */
export function normalizeAiOrderProviderMetadata(payload: unknown): unknown {
  if (!isRecord(payload) || !isRecord(payload.fieldConfidence)) return payload

  const fieldConfidence: Record<string, number> = {}
  flattenFieldConfidence(payload.fieldConfidence, '', fieldConfidence)
  return { ...payload, fieldConfidence }
}

export interface AiOrderContractValidation {
  valid: boolean
  errors: string[]
}

export function validateAiOrderProviderPayload(payload: unknown): AiOrderContractValidation {
  const errors: string[] = []
  const addError = (message: string) => {
    if (errors.length < 20) errors.push(message)
  }

  if (!isRecord(payload)) {
    return { valid: false, errors: ['响应必须是 JSON 对象'] }
  }

  if (typeof payload.summary !== 'string' || !payload.summary.trim()) {
    addError('summary 必须是非空字符串')
  }
  if (
    typeof payload.confidence !== 'number' ||
    !Number.isFinite(payload.confidence) ||
    payload.confidence < 0 ||
    payload.confidence > 1
  ) {
    addError('confidence 必须是 0 到 1 之间的数字')
  }
  if (
    !Array.isArray(payload.missingFields) ||
    !payload.missingFields.every((item) => typeof item === 'string')
  ) {
    addError('missingFields 必须是字符串数组')
  }
  if (
    !Array.isArray(payload.warnings) ||
    !payload.warnings.every((item) => typeof item === 'string')
  ) {
    addError('warnings 必须是字符串数组')
  }
  if (!isRecord(payload.fieldConfidence)) {
    addError('fieldConfidence 必须是对象')
  } else {
    for (const [field, confidence] of Object.entries(payload.fieldConfidence)) {
      if (
        typeof confidence !== 'number' ||
        !Number.isFinite(confidence) ||
        confidence < 0 ||
        confidence > 1
      ) {
        addError(`fieldConfidence.${field} 必须是 0 到 1 之间的数字`)
      }
    }
  }

  if (!isRecord(payload.order)) {
    addError('order 必须是对象')
    return { valid: false, errors }
  }

  for (const field of TEXT_FIELDS) {
    if (field in payload.order && !isNullableString(payload.order[field])) {
      addError(`order.${field} 必须是字符串或 null`)
    }
  }
  for (const field of NUMBER_FIELDS) {
    if (field in payload.order && !isNullableNonNegativeNumber(payload.order[field])) {
      addError(`order.${field} 必须是非负数字或 null`)
    }
  }

  if (
    'orderConfig' in payload.order &&
    payload.order.orderConfig !== null &&
    !isRecord(payload.order.orderConfig)
  ) {
    addError('order.orderConfig 必须是对象或 null')
  } else if (isRecord(payload.order.orderConfig)) {
    const config = payload.order.orderConfig
    for (const field of CONFIG_TEXT_FIELDS) {
      if (field in config && !isNullableString(config[field])) {
        addError(`order.orderConfig.${field} 必须是字符串或 null`)
      }
    }
    for (const field of CONFIG_BOOLEAN_FIELDS) {
      if (field in config && config[field] !== null && typeof config[field] !== 'boolean') {
        addError(`order.orderConfig.${field} 必须是布尔值或 null`)
      }
    }
    for (const field of CONFIG_NUMBER_FIELDS) {
      const value = config[field]
      const validTemperature =
        field !== 'truckCount' &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= -80 &&
        value <= 80
      const validTruckCount =
        field === 'truckCount' &&
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 10
      if (field in config && value !== null && !validTemperature && !validTruckCount) {
        addError(`order.orderConfig.${field} 数值无效`)
      }
    }
    if (
      'transportRequirements' in config &&
      config.transportRequirements !== null &&
      (!Array.isArray(config.transportRequirements) ||
        !config.transportRequirements.every((item) => typeof item === 'string'))
    ) {
      addError('order.orderConfig.transportRequirements 必须是字符串数组或 null')
    }
  }

  if (!Array.isArray(payload.order.cargoItems)) {
    addError('order.cargoItems 必须是数组')
  } else if (payload.order.cargoItems.length > 20) {
    addError('order.cargoItems 最多允许 20 项')
  } else {
    payload.order.cargoItems.forEach((item, index) => {
      if (!isRecord(item)) {
        addError(`order.cargoItems[${index}] 必须是对象`)
        return
      }
      for (const field of ['cargoName', 'packageType', 'unit']) {
        if (field in item && !isNullableString(item[field])) {
          addError(`order.cargoItems[${index}].${field} 必须是字符串或 null`)
        }
      }
      for (const field of ['quantity', 'weightKg', 'volumeM3']) {
        if (field in item && !isNullableNonNegativeNumber(item[field])) {
          addError(`order.cargoItems[${index}].${field} 必须是非负数字或 null`)
        }
      }
    })
  }

  return { valid: errors.length === 0, errors }
}

function hasProposedValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return Boolean(value.trim())
  if (Array.isArray(value)) return value.length > 0
  if (isRecord(value)) return Object.keys(value).length > 0
  return true
}

function canonicalize(value: unknown): unknown {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map(canonicalize)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    )
  }
  return value
}

export function compareAiOrderPayloads(
  proposedPayload: Record<string, unknown>,
  finalPayload: Record<string, unknown>
): { acceptedFields: string[]; correctedFields: string[] } {
  const acceptedFields: string[] = []
  const correctedFields: string[] = []

  for (const [field, proposedValue] of Object.entries(proposedPayload)) {
    if (!hasProposedValue(proposedValue)) continue
    if (field === 'orderConfig' && isRecord(proposedValue)) {
      const finalConfig = isRecord(finalPayload.orderConfig) ? finalPayload.orderConfig : {}
      for (const [configField, configValue] of Object.entries(proposedValue)) {
        if (!hasProposedValue(configValue)) continue
        const accepted =
          JSON.stringify(canonicalize(configValue)) ===
          JSON.stringify(canonicalize(finalConfig[configField]))
        ;(accepted ? acceptedFields : correctedFields).push(`orderConfig.${configField}`)
      }
      continue
    }
    const accepted =
      JSON.stringify(canonicalize(proposedValue)) ===
      JSON.stringify(canonicalize(finalPayload[field]))
    ;(accepted ? acceptedFields : correctedFields).push(field)
  }

  return { acceptedFields: acceptedFields.sort(), correctedFields: correctedFields.sort() }
}

