import type { FunctionInvokeOptions } from '@supabase/supabase-js'
import { supabase } from '@/plugins/supabase'
import { isSupabaseSessionFailure, isSupabaseUnauthorizedResponse } from './error'
import {
  isSupabaseSessionConfirmedExpired,
  notifySupabaseSessionExpired,
  refreshSupabaseSessionOnce
} from './session'

type SupabaseFunctionResponse<T> = {
  data: T | null
  error: unknown | null
}

/**
 * 调用需要登录态的 Edge Function；遇到明确的过期访问令牌时恢复一次会话并重试。
 * 多个页面同时初始化时共用同一个刷新 Promise，避免 refresh token 竞争。
 */
export async function invokeSupabaseFunctionWithSessionRecovery<T>(
  functionName: string,
  options: FunctionInvokeOptions = {}
): Promise<SupabaseFunctionResponse<T>> {
  const invoke = (): Promise<SupabaseFunctionResponse<T>> =>
    supabase.functions.invoke<T>(functionName, options)

  let response = await invoke()
  if (
    !isSupabaseSessionFailure(response.error) &&
    !isSupabaseUnauthorizedResponse(response.error)
  ) {
    return response
  }
  if (!(await refreshSupabaseSessionOnce())) {
    if (await isSupabaseSessionConfirmedExpired()) await notifySupabaseSessionExpired()
    return response
  }

  response = await invoke()
  if (
    (isSupabaseSessionFailure(response.error) || isSupabaseUnauthorizedResponse(response.error)) &&
    (await isSupabaseSessionConfirmedExpired())
  ) {
    await notifySupabaseSessionExpired()
  }
  return response
}
