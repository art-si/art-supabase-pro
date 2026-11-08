import { supabase } from '@/plugins/supabase'
import { isPlainObjectRecord } from '@/utils/type-guards'
import { invokeSupabaseFunctionWithSessionRecovery } from '@/utils/supabase/functions'
import { decodeBffGatewayResult, BffResultContractError } from '@/utils/http/bff-result'
import { BffDeadlineError, withBffDeadline } from '@/utils/http/bff-deadline'
import { bffFunctionHttpResponse } from '@/utils/http/bff-edge-error'
import type { QueryResult } from '@/types/api/response'
import type {
  BffCatalog,
  BffGatewayResult,
  BffMethod,
  BffPublishedApi,
  BffPublishedInput,
  BffPublishedOutput,
  BffScalar
} from '@/types/platform/bff'

type BridgePayload =
  | { operation: 'catalog' }
  | {
      operation: 'invoke'
      applicationCode: string
      environment: BffPublishedApi['environment']
      path: string
      method: BffMethod
      query: Record<string, BffScalar>
      body: Record<string, BffScalar>
      idempotencyKey?: string
    }

const endpoint = import.meta.env.DEV ? import.meta.env.VITE_BFF_DEV_ENDPOINT : undefined
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const catalogDeadlineMs = 12_000
const invocationDeadlineMs = 65_000

export class BffBridgeError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
    readonly requestId?: string
  ) {
    super(message)
    this.name = 'BffBridgeError'
  }
}

function failure(status?: number, code = 'BFF_UNAVAILABLE', requestId?: string): BffBridgeError {
  const message =
    status === 400
      ? '接口参数不符合发布合同，请检查输入后重试'
      : status === 504
        ? 'BFF 调用超时；写请求请先核对执行记录，再决定是否重试'
        : status === 401
          ? '统一登录已过期，请重新登录'
          : status === 403
            ? '当前账号没有此应用或接口的访问权限'
            : status === 404
              ? '接口未发布，或当前账号不可访问'
              : status === 409
                ? '调用状态已变化；写请求请先按请求编号核对结果'
                : 'BFF 接入服务暂时不可用，请稍后重试'
  return new BffBridgeError(message, code, status, requestId)
}

function httpFailure(value: unknown, status: number): BffBridgeError {
  const row = isPlainObjectRecord(value) ? value : {}
  return failure(
    status,
    typeof row.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(row.code)
      ? row.code
      : 'BFF_UNAVAILABLE',
    typeof row.requestId === 'string' && uuid.test(row.requestId) ? row.requestId : undefined
  )
}

async function devBridge(payload: BridgePayload, signal: AbortSignal): Promise<unknown> {
  if (endpoint !== '/__bff_bridge') throw failure(503, 'BFF_DEV_ENDPOINT_INVALID')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw failure(401, 'AUTH_REQUIRED')
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal,
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
  } catch {
    throw failure(503)
  }
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw failure(response.status)
  }
  if (!response.ok) throw httpFailure(value, response.status)
  return value
}

async function edgeBridge(payload: BridgePayload, signal: AbortSignal): Promise<unknown> {
  // Catalog and published GETs are read-only; writes must never be replayed automatically.
  const readOnly = payload.operation === 'catalog' || payload.method === 'GET'
  const response = readOnly
    ? await invokeSupabaseFunctionWithSessionRecovery<unknown>('bff-gateway', {
        body: payload,
        signal
      })
    : await supabase.functions.invoke<unknown>('bff-gateway', { body: payload, signal })
  if (response.error) {
    const context = bffFunctionHttpResponse(response.error)
    if (context) {
      let value: unknown = null
      try {
        value = await context.clone().json()
      } catch {
        // Remote errors are never surfaced verbatim.
      }
      throw httpFailure(value, context.status)
    }
    throw failure(503)
  }
  return response.data
}

async function transport(
  payload: BridgePayload,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<unknown> {
  try {
    return await withBffDeadline(
      (signal) =>
        endpoint === undefined ? edgeBridge(payload, signal) : devBridge(payload, signal),
      options.timeoutMs ??
        (payload.operation === 'catalog' ? catalogDeadlineMs : invocationDeadlineMs),
      options.signal
    )
  } catch (error) {
    if (error instanceof BffDeadlineError)
      throw error.reason === 'timeout' ? failure(504, 'BFF_TIMEOUT') : failure(503, 'BFF_CANCELLED')
    throw error
  }
}

function inputField(value: unknown): BffPublishedInput {
  if (!isPlainObjectRecord(value)) throw failure(503, 'CATALOG_INVALID')
  const { key, label, location, type, required } = value
  if (
    typeof key !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) ||
    typeof label !== 'string' ||
    label.length > 80 ||
    !['path', 'query', 'body'].includes(String(location)) ||
    !['string', 'number', 'boolean'].includes(String(type)) ||
    typeof required !== 'boolean'
  )
    throw failure(503, 'CATALOG_INVALID')
  return {
    key,
    label,
    location: location as BffPublishedInput['location'],
    type: type as BffPublishedInput['type'],
    required
  }
}

function outputField(value: unknown): BffPublishedOutput {
  if (!isPlainObjectRecord(value)) throw failure(503, 'CATALOG_INVALID')
  const { key, label, type } = value
  if (
    typeof key !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) ||
    typeof label !== 'string' ||
    label.length > 80 ||
    (type !== null && !['string', 'number', 'boolean'].includes(String(type)))
  )
    throw failure(503, 'CATALOG_INVALID')
  return { key, label, type: type as BffPublishedOutput['type'] }
}

function catalogRecord(value: unknown): BffPublishedApi {
  if (!isPlainObjectRecord(value)) throw failure(503, 'CATALOG_INVALID')
  const {
    interfaceId,
    code,
    name,
    method,
    path,
    environment,
    version,
    applicationCode,
    applicationName,
    inputs,
    resultKind,
    outputs,
    pagination
  } = value
  if (
    typeof interfaceId !== 'string' ||
    !uuid.test(interfaceId) ||
    typeof code !== 'string' ||
    typeof name !== 'string' ||
    typeof path !== 'string' ||
    typeof applicationCode !== 'string' ||
    typeof applicationName !== 'string' ||
    !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method)) ||
    !['development', 'staging', 'production'].includes(String(environment)) ||
    !Number.isSafeInteger(version) ||
    Number(version) < 1 ||
    !['scalar', 'page'].includes(String(resultKind)) ||
    !Array.isArray(inputs) ||
    inputs.length > 32 ||
    !Array.isArray(outputs) ||
    outputs.length > 32
  )
    throw failure(503, 'CATALOG_INVALID')
  const pageKeys =
    pagination === null || pagination === undefined
      ? undefined
      : isPlainObjectRecord(pagination) &&
          typeof pagination.currentInputKey === 'string' &&
          typeof pagination.sizeInputKey === 'string'
        ? {
            currentInputKey: pagination.currentInputKey,
            sizeInputKey: pagination.sizeInputKey
          }
        : undefined
  if (pagination !== null && pagination !== undefined && !pageKeys)
    throw failure(503, 'CATALOG_INVALID')
  return {
    interfaceId,
    code,
    name,
    method: method as BffMethod,
    path,
    environment: environment as BffPublishedApi['environment'],
    version: Number(version),
    applicationCode,
    applicationName,
    inputs: inputs.map(inputField),
    resultKind: resultKind as BffPublishedApi['resultKind'],
    outputs: outputs.map(outputField),
    ...(pageKeys ? { pagination: pageKeys } : {})
  }
}

export async function fetchBffCatalog(
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<BffCatalog> {
  const value = await transport({ operation: 'catalog' }, options)
  if (!isPlainObjectRecord(value) || !Array.isArray(value.records) || value.records.length > 500)
    throw failure(503, 'CATALOG_INVALID')
  return { records: value.records.map(catalogRecord) }
}

function invocation(
  api: BffPublishedApi,
  input: Record<string, BffScalar>,
  idempotencyKey?: string
): BridgePayload {
  if (!isPlainObjectRecord(input)) throw failure(400, 'INVALID_INPUT')
  const allowed = new Set(api.inputs.map((field) => field.key))
  if (Object.keys(input).some((key) => !allowed.has(key))) throw failure(400, 'INVALID_INPUT')
  let concretePath = api.path
  const query: Record<string, BffScalar> = {}
  const body: Record<string, BffScalar> = {}
  for (const field of api.inputs) {
    const value = input[field.key]
    if (value === undefined || value === null) {
      if (field.required) throw failure(400, 'INVALID_INPUT')
      continue
    }
    if (
      (field.type === 'string' && typeof value !== 'string') ||
      (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) ||
      (field.type === 'boolean' && typeof value !== 'boolean')
    )
      throw failure(400, 'INVALID_INPUT')
    if (field.location === 'path')
      concretePath = concretePath.replaceAll(`{${field.key}}`, encodeURIComponent(String(value)))
    else if (field.location === 'query') query[field.key] = value
    else body[field.key] = value
  }
  if (/\{[^}]+\}/.test(concretePath)) throw failure(400, 'INVALID_INPUT')
  if (api.method === 'GET' && Object.keys(body).length) throw failure(400, 'INVALID_INPUT')
  return {
    operation: 'invoke',
    applicationCode: api.applicationCode,
    environment: api.environment,
    path: concretePath,
    method: api.method,
    query,
    body,
    ...(api.method === 'GET' ? {} : { idempotencyKey: idempotencyKey ?? crypto.randomUUID() })
  }
}

function gatewayResult(api: BffPublishedApi, value: unknown): BffGatewayResult {
  try {
    return decodeBffGatewayResult(api, value)
  } catch (error) {
    if (error instanceof BffResultContractError) throw failure(503, 'GATEWAY_INVALID')
    throw error
  }
}

export async function invokeBffInterface(
  api: BffPublishedApi,
  input: Record<string, BffScalar>,
  options: { idempotencyKey?: string } = {}
): Promise<BffGatewayResult> {
  return gatewayResult(api, await transport(invocation(api, input, options.idempotencyKey)))
}

export async function fetchBffPage(
  api: BffPublishedApi,
  input: Record<string, BffScalar>,
  page: { current: number; size: number }
): Promise<
  QueryResult<Array<Record<string, BffScalar>>> & {
    requestId?: string
    version?: number
    gatewayResult?: BffGatewayResult
  }
> {
  try {
    if (
      api.resultKind !== 'page' ||
      !api.pagination ||
      !Number.isSafeInteger(page.current) ||
      page.current < 1 ||
      page.current > 1_000_000 ||
      !Number.isSafeInteger(page.size) ||
      page.size < 1 ||
      page.size > 100 ||
      !api.inputs.some(
        (field) => field.key === api.pagination?.currentInputKey && field.type === 'number'
      ) ||
      !api.inputs.some(
        (field) => field.key === api.pagination?.sizeInputKey && field.type === 'number'
      )
    )
      throw failure(400, 'PAGE_CONTRACT_INVALID')
    const response = await invokeBffInterface(api, {
      ...input,
      [api.pagination.currentInputKey]: page.current,
      [api.pagination.sizeInputKey]: page.size
    })
    const value: unknown = response.data
    if (
      !isPlainObjectRecord(value) ||
      !Array.isArray(value.records) ||
      value.records.length > 100 ||
      !Number.isSafeInteger(value.total) ||
      Number(value.total) < 0 ||
      value.current !== page.current ||
      value.size !== page.size
    )
      throw failure(503, 'PAGE_RESPONSE_INVALID', response.requestId)
    const declared = new Set(api.outputs.map((field) => field.key))
    const records = value.records.map((item) => {
      if (!isPlainObjectRecord(item) || Object.keys(item).some((key) => !declared.has(key)))
        throw failure(503, 'PAGE_RESPONSE_INVALID', response.requestId)
      const row: Record<string, BffScalar> = {}
      for (const [key, field] of Object.entries(item)) {
        if (
          field !== null &&
          typeof field !== 'string' &&
          typeof field !== 'number' &&
          typeof field !== 'boolean'
        )
          throw failure(503, 'PAGE_RESPONSE_INVALID', response.requestId)
        row[key] = field
      }
      return row
    })
    return {
      data: records,
      total: Number(value.total),
      error: null,
      requestId: response.requestId,
      version: response.version,
      gatewayResult: response
    }
  } catch (error) {
    return { data: null, error: error instanceof BffBridgeError ? error : failure(503) }
  }
}
