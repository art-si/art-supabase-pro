import {
  keysToCamelDeep,
  keysToCamelShallow,
  keysToSnakeDeep
} from '@/utils/supabase/key-transform'
import { isPlainObjectRecord } from '@/utils/type-guards'
import { supabase } from '@/plugins/supabase'
import { isBoolean } from 'lodash-es'
import { ElMessage } from 'element-plus'
import {
  DeleteReferenceBlockedError,
  getDeleteReferenceContext
} from '@/utils/supabase/delete-reference'
import { mittBus } from '@/utils/sys'
import type { QueryResult } from '@/types/api/response'
import {
  getFriendlySupabaseErrorMessage,
  isSupabaseUnauthorizedResponse,
  isSupabaseRequestAbortFailure,
  isSupabaseSessionFailure,
  markErrorAsUserNotified,
  normalizeSupabaseFunctionError
} from '@/utils/supabase'
import {
  isSupabaseSessionConfirmedExpired,
  notifySupabaseSessionExpired,
  refreshSupabaseSessionOnce,
  SUPABASE_SESSION_EXPIRED_MESSAGE
} from '@/utils/supabase/session'

export type SupabaseAction = 'select' | 'insert' | 'update' | 'delete' | 'rpc'
export const WRITE_PERMISSION_DENIED_MESSAGE = '当前账号没有该数据的维护权限'

/**
 * Options for responseHandle
 */
export interface RunQueryOptions {
  showMessage?: boolean // 是否显示提示，默认 false
  showErrorMessage?: boolean // 是否显示错误提示；未指定时跟随 showMessage，显式 false 交由调用方处理
  showReferenceFeedback?: boolean // 默认展示全局引用反馈；已有本地删除守卫的调用方设为 false
  convertToCamel?: boolean // 是否将返回字段从 snake_case 转为 camelCase，默认 true
  convertToCamelShadow?: boolean // 是否只转换最外层的驼峰命名，默认 false（深层转换）
  returnRawError?: boolean // 是否返回原生错误字段，默认 false
  message?: string
  errorMessage?: string // 未识别技术异常的用户友好兜底提示
  noAffectedMessage?: string
  formatErrorMessage?: (error: unknown, responseBody?: unknown) => string
  action?: SupabaseAction
  breakReturn?: boolean //打断返回
  requireAffected?: boolean // 写操作至少影响一行；表写入使用 count，RPC 使用数值或布尔 data
}

/**
 * 标准返回类型
 */
interface QueryResponse {
  data?: unknown
  error?: unknown
  count?: number | null
  status?: number
  response?: {
    json?: () => Promise<unknown>
  }
}

type QueryFactory = () => PromiseLike<QueryResponse>

export function useSupabase() {
  /**
   * 通用查询包装器：从 useSupabase 获取后使用。
   * 用法：
   *   import { useSupabase } from '@/hooks/core/useSupabase'
   *   const { responseHandle } = useSupabase()
   *   const { data, error } = await responseHandle<MyType[]>(() => supabase.from('sys_user').select())
   */

  async function responseHandle<T = unknown>(
    queryFactory: QueryFactory,
    options: RunQueryOptions = {
      showMessage: false,
      showErrorMessage: false,
      convertToCamel: true,
      convertToCamelShadow: false,
      returnRawError: false,
      breakReturn: false,
      requireAffected: false
    }
  ): Promise<QueryResult<T>> {
    const {
      showMessage = false,
      breakReturn = false,
      convertToCamel = true,
      convertToCamelShadow = false,
      returnRawError = false,
      requireAffected = false
    } = options ?? {}
    const showErrorMessage = options?.showErrorMessage ?? showMessage

    let queryResponse = await queryFactory()
    let sessionFailure = isSupabaseSessionFailure(queryResponse, queryResponse.error)
    let unauthorizedResponse = isSupabaseUnauthorizedResponse(queryResponse, queryResponse.error)
    let sessionFailureHandled = false
    let sessionConfirmedExpired = false

    if (sessionFailure || unauthorizedResponse) {
      const refreshedSession = await refreshSupabaseSessionOnce()
      if (refreshedSession) {
        queryResponse = await queryFactory()
        sessionFailure = isSupabaseSessionFailure(queryResponse, queryResponse.error)
        unauthorizedResponse = isSupabaseUnauthorizedResponse(queryResponse, queryResponse.error)
      }

      if (sessionFailure || unauthorizedResponse) {
        sessionConfirmedExpired = await isSupabaseSessionConfirmedExpired()
        if (sessionConfirmedExpired) {
          sessionFailureHandled = await notifySupabaseSessionExpired()
        }
      }
    }

    const { data, error, count, response } = queryResponse
    if (error) {
      if (isSupabaseRequestAbortFailure(error)) {
        const abortError = new Error('请求已取消', { cause: error })
        abortError.name = 'AbortError'
        if (breakReturn) throw abortError
        return {
          data: null,
          error: returnRawError ? keysToCamelDeep(error) : abortError
        }
      }

      let responseJson: unknown
      try {
        responseJson = await response?.json?.()
      } catch {
        // 部分 SDK 响应体已被消费；继续从异常 context 中读取。
      }
      const normalizedError = await normalizeSupabaseFunctionError(error)
      const responseBody = responseJson ?? (normalizedError !== error ? normalizedError : undefined)
      const responseError = isPlainObjectRecord(responseBody) ? responseBody : undefined
      const queryError = isPlainObjectRecord(error) ? error : undefined
      const message = sessionConfirmedExpired
        ? SUPABASE_SESSION_EXPIRED_MESSAGE
        : sessionFailure
          ? '请求未获授权，请检查账号权限或刷新后重试'
          : options.formatErrorMessage?.(error, responseBody) ||
            getFriendlySupabaseErrorMessage(
              [responseError, queryError, normalizedError, error],
              options.errorMessage
            )
      const referenceContext = getDeleteReferenceContext(error)
      const referenceHandled = Boolean(
        options.showReferenceFeedback !== false &&
        referenceContext &&
        mittBus.all.get('deleteReferenceBlocked')?.length
      )
      if (referenceContext && referenceHandled)
        mittBus.emit('deleteReferenceBlocked', referenceContext)
      const showErrorToast = showErrorMessage && !sessionFailureHandled && !referenceHandled
      if (showErrorToast) {
        ElMessage.error(message)
      }
      if (breakReturn) {
        if (referenceHandled) {
          throw markErrorAsUserNotified(new DeleteReferenceBlockedError(error))
        }
        const reportedError = new Error(message, { cause: error })
        throw showErrorToast || sessionFailureHandled
          ? markErrorAsUserNotified(reportedError)
          : reportedError
      }
      const returnedError = referenceHandled
        ? new DeleteReferenceBlockedError(error)
        : returnRawError && responseBody
          ? keysToCamelDeep(responseBody)
          : normalizedError
      if (
        (showErrorToast || sessionFailureHandled || referenceHandled) &&
        typeof returnedError === 'object' &&
        returnedError !== null
      ) {
        markErrorAsUserNotified(returnedError)
      }
      return { data: null, error: returnedError }
    }

    const affectedCount =
      typeof data === 'boolean' ? Number(data) : typeof data === 'number' ? data : count
    if (requireAffected && affectedCount === 0) {
      const message = options.noAffectedMessage || '当前账号没有权限操作该数据，或数据不存在'
      if (showErrorMessage) {
        ElMessage.error(message)
      }
      if (breakReturn) {
        const noAffectedError = new Error(message)
        throw showErrorMessage ? markErrorAsUserNotified(noAffectedError) : noAffectedError
      }
      const noAffectedError = new Error(message)
      return {
        data: null,
        error: showErrorMessage ? markErrorAsUserNotified(noAffectedError) : noAffectedError
      }
    }

    if (showMessage) {
      ElMessage.closeAll()
      ElMessage.success(options.message || '操作成功')
    }
    let out: T
    if (isBoolean(convertToCamel) && !convertToCamel) {
      out = data as T
    } else if (convertToCamelShadow) {
      out = keysToCamelShallow<T>(data)
    } else {
      out = keysToCamelDeep<T>(data)
    }
    return { data: out, total: count ?? 0, error: null }
  }

  return {
    supabase,
    responseHandle,
    keysToCamelDeep,
    keysToSnakeDeep
  }
}
