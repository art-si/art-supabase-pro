import type {
  BffGatewayResult,
  BffPageResult,
  BffPublishedApi,
  BffScalar
} from '../../types/platform/bff'
import { isPlainObjectRecord } from '../type-guards'

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const maxDataBytes = 64 * 1024

export class BffResultContractError extends Error {
  constructor() {
    super('BFF 返回结果不符合已发布接口合同')
    this.name = 'BffResultContractError'
  }
}

function invalid(): never {
  throw new BffResultContractError()
}

function boundedData(value: unknown): void {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch {
    invalid()
  }
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > maxDataBytes)
    invalid()
}

function declaredRow(value: unknown, api: BffPublishedApi): Record<string, BffScalar> {
  if (!isPlainObjectRecord(value)) invalid()
  const declared = new Map(api.outputs.map((field) => [field.key, field.type]))
  if (Object.keys(value).length > declared.size) invalid()
  const row: Record<string, BffScalar> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!declared.has(key)) invalid()
    if (
      entry !== null &&
      typeof entry !== 'string' &&
      (typeof entry !== 'number' || !Number.isFinite(entry)) &&
      typeof entry !== 'boolean'
    )
      invalid()
    const expected = declared.get(key)
    if (entry !== null && expected && typeof entry !== expected) invalid()
    row[key] = entry
  }
  return row
}

function pageData(value: unknown, api: BffPublishedApi): BffPageResult {
  if (!isPlainObjectRecord(value)) invalid()
  if (Object.keys(value).some((key) => !['records', 'total', 'current', 'size'].includes(key)))
    invalid()
  const { records, total, current, size } = value
  if (
    !Array.isArray(records) ||
    records.length > 100 ||
    !Number.isSafeInteger(total) ||
    Number(total) < 0 ||
    !Number.isSafeInteger(current) ||
    Number(current) < 1 ||
    Number(current) > 1_000_000 ||
    !Number.isSafeInteger(size) ||
    Number(size) < 1 ||
    Number(size) > 100 ||
    records.length > Number(size)
  )
    invalid()
  return {
    records: records.map((row) => declaredRow(row, api)),
    total: Number(total),
    current: Number(current),
    size: Number(size)
  }
}

/** Validate and project every gateway result at the SDK boundary, including direct invoke callers. */
export function decodeBffGatewayResult(api: BffPublishedApi, value: unknown): BffGatewayResult {
  if (!isPlainObjectRecord(value)) invalid()
  const { code, msg, requestId, version, data } = value
  if (
    code !== 200 ||
    typeof msg !== 'string' ||
    msg.length > 200 ||
    typeof requestId !== 'string' ||
    !requestIdPattern.test(requestId) ||
    !Number.isSafeInteger(version) ||
    Number(version) < 1
  )
    invalid()
  boundedData(data)
  return {
    code: 200,
    msg,
    requestId,
    version: Number(version),
    data: api.resultKind === 'page' ? pageData(data, api) : declaredRow(data, api)
  }
}
