import { isPlainObjectRecord } from '../type-guards'
import { getFriendlySupabaseErrorMessage } from '../supabase/error'

/** Each backend declares its envelope. Success codes are never inferred from field presence. */
export interface ResponseContract {
  codeField: string
  messageField: string
  dataField: string
  successCodes: readonly (string | number)[]
}

export const DEFAULT_RESPONSE_CONTRACT: ResponseContract = {
  codeField: 'code',
  messageField: 'msg',
  dataField: 'data',
  successCodes: [200]
}

export class ApiResponseError extends Error {
  constructor(
    message: string,
    public readonly data: unknown,
    public readonly status?: number,
    public readonly code?: string | number,
    public readonly context?: Response
  ) {
    super(message)
    this.name = 'ApiResponseError'
  }
}

export function decodeResponseEnvelope(
  payload: unknown,
  contract: ResponseContract = DEFAULT_RESPONSE_CONTRACT
): { data: unknown; message: string } {
  if (!isPlainObjectRecord(payload)) {
    throw new ApiResponseError('服务返回格式异常，请联系管理员', payload)
  }
  const code = payload[contract.codeField]
  const message = payload[contract.messageField]
  if (typeof code !== 'string' && typeof code !== 'number') {
    throw new ApiResponseError('服务返回格式异常，请联系管理员', payload)
  }
  if (!contract.successCodes.includes(code)) {
    throw new ApiResponseError(
      typeof message === 'string' && message.trim() ? message : '请求未完成，请稍后重试',
      payload,
      undefined,
      code
    )
  }
  return { data: payload[contract.dataField], message: typeof message === 'string' ? message : '' }
}

/** Functions use HTTP status, not the business envelope used by Java APIs. */
export async function decodeFunctionResponse<T>(
  response: Response
): Promise<{ data: T | null; error: ApiResponseError | null }> {
  if (response.status === 204) return { data: null, error: null }
  let payload: unknown
  try {
    payload = await response.clone().json()
  } catch {
    return {
      data: null,
      error: new ApiResponseError(
        '服务返回格式异常，请稍后重试',
        null,
        response.status,
        undefined,
        response
      )
    }
  }
  if (!response.ok) {
    return {
      data: null,
      error: new ApiResponseError(
        getFriendlySupabaseErrorMessage(payload, '服务请求失败，请稍后重试'),
        payload,
        response.status,
        undefined,
        response
      )
    }
  }
  // The invoke<T> boundary retains the SDK contract; domain APIs validate their DTOs.
  return { data: payload as T, error: null }
}
