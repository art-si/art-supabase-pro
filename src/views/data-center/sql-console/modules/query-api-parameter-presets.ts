import { sortBy, uniqBy } from 'lodash-es'
import type { SqlQueryApiParameter, SqlQueryApiParameters } from '@/types/sql-query-api'
import { getOwnRecordValue, isObjectRecord } from '@/utils/record'
import {
  isSqlQueryApiParameterType,
  sqlQueryApiParameters,
  SqlQueryApiParameterError
} from './query-api-ui'

export interface SqlQueryApiParameterPreset {
  id: string
  name: string
  definitionId: string
  definitionVersion: string
  parameterSignature: string
  updatedAt: string
  values: SqlQueryApiParameters
}

export interface SqlQueryApiPresetState {
  version: 2
  presets: SqlQueryApiParameterPreset[]
}

/** Only this module's controlled validation messages may be displayed directly. */
export class SqlQueryApiPresetError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SqlQueryApiPresetError'
  }
}

const maxStoreBytes = 64 * 1024
const maxValueLength = 4000
const maxPresets = 10
const maxParameters = 20
const parameterName = /^[A-Za-z_][A-Za-z\d_]{0,39}$/
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const encoder = new TextEncoder()

function invalid(message = '参数方案已损坏，请清除本机方案后重试'): never {
  throw new SqlQueryApiPresetError(message)
}

/** Presets accept DTO data only: no accessors, custom prototypes, symbols or extra metadata. */
function presetRecord(value: unknown, allowedKeys?: readonly string[]): Record<string, unknown> {
  if (
    !isObjectRecord(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length
  )
    return invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (
    Object.entries(descriptors).some(
      ([key, descriptor]) => !('value' in descriptor) || (allowedKeys && !allowedKeys.includes(key))
    )
  )
    return invalid()
  return value
}

function ownArray(value: unknown, maxLength: number): unknown[] {
  const descriptors = Array.isArray(value) ? Object.getOwnPropertyDescriptors(value) : undefined
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length ||
    !descriptors ||
    Object.values(descriptors).some((descriptor) => !('value' in descriptor))
  )
    return invalid()
  const length = getOwnRecordValue(value, 'length')
  if (
    typeof length !== 'number' ||
    !Number.isInteger(length) ||
    length < 0 ||
    length > maxLength ||
    Object.keys(descriptors).length !== length + 1
  )
    return invalid()
  const entries: unknown[] = []
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !('value' in descriptor)) return invalid()
    entries.push(descriptor.value)
  }
  return entries
}

function parameterDefinitions(parameters: unknown): SqlQueryApiParameter[] {
  const definitions = ownArray(parameters, maxParameters).map((raw) => {
    const value = presetRecord(raw, ['name', 'type', 'required'])
    const name = getOwnRecordValue(value, 'name')
    const type = getOwnRecordValue(value, 'type')
    const required = getOwnRecordValue(value, 'required')
    if (
      typeof name !== 'string' ||
      !parameterName.test(name) ||
      !isSqlQueryApiParameterType(type) ||
      typeof required !== 'boolean'
    )
      return invalid('接口参数定义无效，请刷新接口后重试')
    return { name, type, required }
  })
  if (uniqBy(definitions, 'name').length !== definitions.length)
    return invalid('接口参数名称重复，请联系接口维护者')
  return definitions
}

/** The signature ignores presentation order, while preserving every parameter's exact contract. */
export function queryApiParameterSignature(parameters: readonly SqlQueryApiParameter[]): string {
  return JSON.stringify(
    sortBy(parameterDefinitions(parameters), 'name').map(({ name, type, required }) => [
      name,
      type,
      required
    ])
  )
}

function signatureParameters(signature: unknown): SqlQueryApiParameter[] {
  if (typeof signature !== 'string' || signature.length > 4096) return invalid()
  let parsed: unknown
  try {
    parsed = JSON.parse(signature)
  } catch (cause) {
    throw new SqlQueryApiPresetError('参数方案的字段定义已损坏，请重新保存', { cause })
  }
  const parameters = parameterDefinitions(
    ownArray(parsed, maxParameters).map((raw) => {
      const tuple = ownArray(raw, 3)
      if (tuple.length !== 3) return invalid()
      return { name: tuple[0], type: tuple[1], required: tuple[2] }
    })
  )
  if (queryApiParameterSignature(parameters) !== signature) return invalid()
  return parameters
}

/** Partial form values are valid presets; filled typed values obey the normal call policy. */
export function normalizeQueryApiPresetValues(
  parameters: readonly SqlQueryApiParameter[],
  values: Record<string, unknown>
): SqlQueryApiParameters {
  const definitions = parameterDefinitions(parameters)
  const source = presetRecord(values)
  const declared = definitions.map((parameter) => parameter.name)
  for (const key of Object.getOwnPropertyNames(source)) {
    const value = getOwnRecordValue(source, key)
    if (!declared.includes(key)) return invalid('参数方案包含未定义字段，请刷新接口后重新保存')
    if (typeof value !== 'string' && typeof value !== 'boolean' && value != null)
      return invalid('参数方案只支持文本、布尔值或 NULL，请检查输入')
    if (typeof value === 'string' && value.length > maxValueLength)
      return invalid(`方案中的每个参数最多 ${maxValueLength} 个字符，请缩短输入`)
  }
  try {
    return sqlQueryApiParameters(definitions, source, { allowMissingRequired: true })
  } catch (cause) {
    // Names and types were validated above; this helper emits controlled form-validation copy.
    throw new SqlQueryApiPresetError(
      cause instanceof SqlQueryApiParameterError ? cause.message : '参数格式无效，请检查输入后重试',
      { cause }
    )
  }
}

function metadataText(value: unknown, maxLength: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maxLength ||
    value.includes('\0')
  )
    return invalid()
  return value
}

export function normalizeQueryApiPresetName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 32 || name.includes('\0'))
    return invalid('方案名称须为 1 至 32 个字符，请修改名称')
  return name
}

function presetState(
  state: unknown,
  definitionId: string,
  allowLegacy = false
): SqlQueryApiPresetState {
  if (typeof definitionId !== 'string' || !uuid.test(definitionId))
    return invalid('接口编号无效，请刷新接口后重试')
  const source = presetRecord(state, ['version', 'presets'])
  const version = getOwnRecordValue(source, 'version')
  if (version !== 2 && !(allowLegacy && version === 1)) return invalid()
  const rawPresets = getOwnRecordValue(source, 'presets')
  if (Array.isArray(rawPresets) && rawPresets.length > maxPresets)
    return invalid(`每个接口最多保存 ${maxPresets} 个参数方案，请先移除不用的方案`)
  const presets = ownArray(rawPresets, maxPresets).map((raw) => {
    const value = presetRecord(raw, [
      'id',
      'name',
      'definitionId',
      'definitionVersion',
      'parameterSignature',
      'updatedAt',
      'values'
    ])
    const id = getOwnRecordValue(value, 'id')
    const storedDefinitionId = getOwnRecordValue(value, 'definitionId')
    if (typeof id !== 'string' || !uuid.test(id) || storedDefinitionId !== definitionId)
      return invalid('参数方案不属于当前接口，请清除本机方案后重试')
    const name = normalizeQueryApiPresetName(getOwnRecordValue(value, 'name'))
    const definitionVersion = metadataText(getOwnRecordValue(value, 'definitionVersion'), 256)
    const signature = getOwnRecordValue(value, 'parameterSignature')
    const parameters = signatureParameters(signature)
    const updatedAt = metadataText(getOwnRecordValue(value, 'updatedAt'), 24)
    const date = new Date(updatedAt)
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== updatedAt) return invalid()
    const values = presetRecord(getOwnRecordValue(value, 'values'))
    if (
      Object.getOwnPropertyNames(values).some((key) => {
        const scalar = getOwnRecordValue(values, key)
        return !['string', 'boolean'].includes(typeof scalar) && !(version === 2 && scalar === null)
      })
    )
      return invalid('参数方案包含不支持的值，请清除损坏方案后重试')
    // Version 1 treated every empty string as omitted, even for declared string parameters.
    const compatibleValues =
      version === 1
        ? Object.fromEntries(
            Object.entries(values).map(([key, scalar]) => [key, scalar === '' ? undefined : scalar])
          )
        : values
    return {
      id,
      name,
      definitionId,
      definitionVersion,
      parameterSignature: queryApiParameterSignature(parameters),
      updatedAt,
      values: normalizeQueryApiPresetValues(parameters, compatibleValues)
    }
  })
  if (uniqBy(presets, 'id').length !== presets.length)
    return invalid('参数方案编号重复，请清除后重试')
  if (uniqBy(presets, 'name').length !== presets.length)
    return invalid('参数方案名称重复，请使用不同名称')
  return { version: 2, presets }
}

function checkStoreBudget(raw: string): void {
  if (typeof raw !== 'string') return invalid()
  // UTF-8 cannot use fewer bytes than UTF-16 code units; reject huge data before allocating/parse.
  if (raw.length > maxStoreBytes || encoder.encode(raw).byteLength > maxStoreBytes)
    return invalid('本接口的参数方案超过 64 KiB，请移除部分方案或缩短内容')
}

export function readQueryApiPresetState(raw: string, definitionId: string): SqlQueryApiPresetState {
  checkStoreBudget(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw new SqlQueryApiPresetError('参数方案已损坏，请清除本机方案后重试', { cause })
  }
  return presetState(parsed, definitionId, true)
}

export function writeQueryApiPresetState(
  state: SqlQueryApiPresetState,
  definitionId: string
): string {
  const raw = JSON.stringify(presetState(state, definitionId))
  checkStoreBudget(raw)
  return raw
}
