/**
 * HTTP 请求封装模块
 * 基于 Axios 封装的 HTTP 请求工具，提供统一的请求/响应处理
 *
 * ## 主要功能
 *
 * - 请求/响应拦截器（自动添加 Token、统一错误处理）
 * - 仅明确的会话失效才退出登录；普通 401 保留业务页面
 * - 请求失败自动重试（可配置）
 * - 统一的成功/错误消息提示
 * - 支持 GET/POST/PUT/DELETE 等常用方法
 *
 * @module utils/http
 */

import axios, { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { useUserStore } from '@/store/modules/user'
import { ApiStatus } from './status'
import { HttpError, handleError, showError, showSuccess } from './error'
import { $t } from '@/locales'
import { BaseResponse } from '@/types'
import { isSupabaseApi } from '@/config/api-provider'
import { isSupabaseSessionFailure } from '@/utils/supabase'
import { ApiResponseError, decodeResponseEnvelope, type ResponseContract } from './response'
import {
  isSupabaseSessionConfirmedExpired,
  notifySupabaseSessionExpired,
  refreshSupabaseSessionOnce
} from '@/utils/supabase/session'

/** 请求配置常量 */
const REQUEST_TIMEOUT = 15000
const MAX_RETRIES = 0
const RETRY_DELAY = 1000

/** 扩展 AxiosRequestConfig */
export interface ExtendedAxiosRequestConfig extends AxiosRequestConfig {
  showErrorMessage?: boolean
  showSuccessMessage?: boolean
  skipAuth?: boolean
  skipResponseWrapper?: boolean
  sessionRecoveryRetried?: boolean
  responseContract?: ResponseContract
}

const { VITE_API_URL, VITE_WITH_CREDENTIALS } = import.meta.env

/** Axios实例 */
const axiosInstance = axios.create({
  timeout: REQUEST_TIMEOUT,
  baseURL: VITE_API_URL,
  withCredentials: VITE_WITH_CREDENTIALS === 'true',
  validateStatus: (status) => status >= 200 && status < 300,
  transformResponse: [
    (data, headers) => {
      const contentType = String(headers['content-type'] ?? '')
      if (contentType.includes('application/json')) {
        try {
          return JSON.parse(data)
        } catch {
          return data
        }
      }
      return data
    }
  ]
})

/** 请求拦截器 */
axiosInstance.interceptors.request.use(
  (request: InternalAxiosRequestConfig) => {
    const { accessToken } = useUserStore()
    const config = request as InternalAxiosRequestConfig & ExtendedAxiosRequestConfig
    if (accessToken && !config.skipAuth) request.headers.set('Authorization', accessToken)

    if (request.data && !(request.data instanceof FormData) && !request.headers['Content-Type']) {
      request.headers.set('Content-Type', 'application/json')
      request.data = JSON.stringify(request.data)
    }

    return request
  },
  (error) => {
    showError(createHttpError($t('httpMsg.requestConfigError'), ApiStatus.error))
    return Promise.reject(error)
  }
)

/** 响应拦截器 */
async function retryAfterUnauthorized(
  config: ExtendedAxiosRequestConfig
): Promise<AxiosResponse<BaseResponse> | null> {
  if (!isSupabaseApi || config.skipAuth) return null
  if (!config.sessionRecoveryRetried && (await refreshSupabaseSessionOnce())) {
    const retryConfig: ExtendedAxiosRequestConfig = { ...config, sessionRecoveryRetried: true }
    return axiosInstance.request<BaseResponse>(retryConfig)
  }
  if (await isSupabaseSessionConfirmedExpired()) {
    await notifySupabaseSessionExpired()
  }
  return null
}

axiosInstance.interceptors.response.use(
  async (response: AxiosResponse<BaseResponse>) => {
    const config = response.config as ExtendedAxiosRequestConfig
    if (config.skipResponseWrapper || response.status === 204) return response

    try {
      const decoded = decodeResponseEnvelope(response.data, config.responseContract)
      response.data = { code: ApiStatus.success, msg: decoded.message, data: decoded.data }
      return response
    } catch (error) {
      if (!(error instanceof ApiResponseError)) throw error
      if (error.code === ApiStatus.unauthorized) {
        const retried = await retryAfterUnauthorized(config)
        if (retried) return retried
      }
      throw new HttpError(
        error.message,
        typeof error.code === 'number' ? error.code : ApiStatus.error,
        { data: error.data }
      )
    }
  },
  async (error) => {
    if (error.response?.status === ApiStatus.unauthorized && error.config) {
      const retried = await retryAfterUnauthorized(error.config as ExtendedAxiosRequestConfig)
      if (retried) return retried
    }
    return Promise.reject(handleError(error))
  }
)

/** 统一创建HttpError */
function createHttpError(message: string, code: number) {
  return new HttpError(message, code)
}

/** 是否需要重试 */
function shouldRetry(statusCode: number) {
  return [
    ApiStatus.requestTimeout,
    ApiStatus.internalServerError,
    ApiStatus.badGateway,
    ApiStatus.serviceUnavailable,
    ApiStatus.gatewayTimeout
  ].includes(statusCode)
}

/** 请求重试逻辑 */
async function retryRequest<T>(
  config: ExtendedAxiosRequestConfig,
  retries: number = MAX_RETRIES
): Promise<T> {
  try {
    return await request<T>(config)
  } catch (error) {
    if (retries > 0 && error instanceof HttpError && shouldRetry(error.code)) {
      await delay(RETRY_DELAY)
      return retryRequest<T>(config, retries - 1)
    }
    throw error
  }
}

/** 延迟函数 */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 请求函数 */
async function request<T = unknown>(config: ExtendedAxiosRequestConfig): Promise<T> {
  // POST | PUT 参数自动填充
  if (
    ['POST', 'PUT'].includes(config.method?.toUpperCase() || '') &&
    config.params &&
    !config.data
  ) {
    config.data = config.params
    config.params = undefined
  }

  try {
    const res = await axiosInstance.request<BaseResponse<T> | T>(config)

    if (res.status === 204) return undefined as T

    if (config.skipResponseWrapper) {
      return res.data as T
    }

    // 显示成功消息
    const responseData = res.data as BaseResponse<T>
    if (config.showSuccessMessage && responseData.msg) {
      showSuccess(responseData.msg)
    }

    return responseData.data as T
  } catch (error) {
    if (
      error instanceof HttpError &&
      (useUserStore().isLogin || !isSupabaseSessionFailure(error.data))
    ) {
      const showMsg = config.showErrorMessage !== false
      showError(error, showMsg)
    }
    return Promise.reject(error)
  }
}

/** API方法集合 */
const api = {
  get<T>(config: ExtendedAxiosRequestConfig) {
    return retryRequest<T>({ ...config, method: 'GET' })
  },
  post<T>(config: ExtendedAxiosRequestConfig) {
    return retryRequest<T>({ ...config, method: 'POST' })
  },
  put<T>(config: ExtendedAxiosRequestConfig) {
    return retryRequest<T>({ ...config, method: 'PUT' })
  },
  del<T>(config: ExtendedAxiosRequestConfig) {
    return retryRequest<T>({ ...config, method: 'DELETE' })
  },
  request<T>(config: ExtendedAxiosRequestConfig) {
    return retryRequest<T>(config)
  }
}

export default api
