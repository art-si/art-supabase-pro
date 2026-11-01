import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import type {
  SqlQueryApiDefinition,
  SqlQueryApiParameter,
  SqlQueryApiParameterDraft,
  SqlQueryApiParameters,
  SqlQueryApiParameterValue
} from '@/types/sql-query-api'
import { getOwnRecordValue, isObjectRecord } from '@/utils/record'
import { getSqlQueryApiSample } from './query-api-samples'
import { formatSqlQueryApiRequest, type SqlQueryApiRequestExamples } from './query-api-request'

dayjs.extend(customParseFormat)

export const isSqlQueryApiParameterType = (value: unknown): value is SqlQueryApiParameter['type'] =>
  typeof value === 'string' && ['string', 'number', 'boolean', 'date', 'uuid'].includes(value)

/** Only this class's controlled validation messages may be displayed directly. */
export class SqlQueryApiParameterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SqlQueryApiParameterError'
  }
}

export function toSqlQueryApiParameterDraft(value: unknown): SqlQueryApiParameterDraft {
  if (value === undefined) return { kind: 'omit' }
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string' || typeof value === 'boolean') return { kind: 'value', value }
  throw new SqlQueryApiParameterError('参数值无效，请使用文本、布尔值或 NULL')
}

/** Read literal own DTO fields, including reactive drafts, without executing accessors. */
export function readSqlQueryApiParameterDraft(
  draft: unknown
): SqlQueryApiParameterValue | undefined {
  if (
    !isObjectRecord(draft) ||
    (Object.getPrototypeOf(draft) !== Object.prototype && Object.getPrototypeOf(draft) !== null) ||
    Object.getOwnPropertySymbols(draft).length
  )
    throw new SqlQueryApiParameterError('参数输入状态无效，请重新选择提供方式')
  const descriptors = Object.getOwnPropertyDescriptors(draft)
  const keys = Object.keys(descriptors)
  const kind = getOwnRecordValue(draft, 'kind')
  if (
    Object.values(descriptors).some((descriptor) => !('value' in descriptor)) ||
    !keys.includes('kind') ||
    keys.some((key) => key !== 'kind' && key !== 'value')
  )
    throw new SqlQueryApiParameterError('参数输入状态无效，请重新选择提供方式')
  if (kind === 'omit' && keys.length === 1) return undefined
  if (kind === 'null' && keys.length === 1) return null
  const value = getOwnRecordValue(draft, 'value')
  if (
    kind === 'value' &&
    keys.length === 2 &&
    (typeof value === 'string' || typeof value === 'boolean')
  )
    return value
  throw new SqlQueryApiParameterError('参数输入状态无效，请重新选择提供方式')
}

export interface SqlQueryApiParameterOptions {
  /** Partial presets may omit required fields, but cannot provide NULL for them. */
  allowMissingRequired?: boolean
}

/** Preserve number text so precision is decided at the typed database boundary. */
export function sqlQueryApiParameters(
  definitions: SqlQueryApiParameter[],
  values: Record<string, unknown>,
  options: SqlQueryApiParameterOptions = {}
): SqlQueryApiParameters {
  const entries: [string, SqlQueryApiParameterValue][] = []
  for (const parameter of definitions) {
    const value = getOwnRecordValue(values, parameter.name)
    const text = typeof value === 'string' ? value.trim() : ''
    if (value === undefined) {
      if (parameter.required && !options.allowMissingRequired)
        throw new SqlQueryApiParameterError(`请填写参数 ${parameter.name}`)
      continue
    }
    if (value === null) {
      if (parameter.required)
        throw new SqlQueryApiParameterError(`必填参数 ${parameter.name} 不能为 NULL`)
      entries.push([parameter.name, null])
      continue
    }
    if (parameter.type === 'boolean') {
      if (typeof value !== 'boolean')
        throw new SqlQueryApiParameterError(`参数 ${parameter.name} 请选择 true 或 false`)
      entries.push([parameter.name, value])
      continue
    }
    if (typeof value !== 'string')
      throw new SqlQueryApiParameterError(`参数 ${parameter.name} 的格式无效`)
    if (
      parameter.type === 'number' &&
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)
    )
      throw new SqlQueryApiParameterError(`参数 ${parameter.name} 请输入有效数值`)
    if (parameter.type === 'date' && !dayjs(text, 'YYYY-MM-DD', true).isValid())
      throw new SqlQueryApiParameterError(`参数 ${parameter.name} 请输入有效日期`)
    if (
      parameter.type === 'uuid' &&
      !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(text)
    )
      throw new SqlQueryApiParameterError(`参数 ${parameter.name} 请输入有效 UUID`)
    entries.push([parameter.name, parameter.type === 'string' ? value : text])
  }
  return Object.fromEntries(entries)
}

export function sqlQueryApiExampleValues(
  definition: SqlQueryApiDefinition
): Record<string, string | boolean> {
  const sample = getSqlQueryApiSample(definition)
  if (sample) return { ...sample.values }
  return Object.fromEntries(
    definition.parameters.map((parameter) => [
      parameter.name,
      parameter.type === 'boolean'
        ? true
        : parameter.type === 'number'
          ? '100.50'
          : parameter.type === 'date'
            ? '2026-01-01'
            : parameter.type === 'uuid'
              ? '00000000-0000-4000-8000-000000000001'
              : '示例值'
    ])
  )
}

/** Examples contain placeholders only, never the application's live session. */
export function sqlQueryApiExamples(
  definition: SqlQueryApiDefinition,
  url: string
): SqlQueryApiRequestExamples {
  return formatSqlQueryApiRequest(url, sqlQueryApiExampleValues(definition))
}
