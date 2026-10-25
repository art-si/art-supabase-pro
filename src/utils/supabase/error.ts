interface ErrorDetails {
  codes: string[]
  names: string[]
  messages: string[]
  statuses: number[]
}

const DEFAULT_ERROR_MESSAGE = '操作未完成，请稍后重试'
const USER_NOTIFIED = Symbol('user-notified')

type UserNotifiedError = { [USER_NOTIFIED]?: true; cause?: unknown }

/** 标记共享响应层已经提示过的异常，避免上层再弹一次相同错误。 */
export function markErrorAsUserNotified<T extends object>(error: T): T {
  const notifiedError = error as T & UserNotifiedError
  notifiedError[USER_NOTIFIED] = true
  return error
}

export function wasErrorUserNotified(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current = error
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    if ((current as UserNotifiedError)[USER_NOTIFIED] === true) return true
    seen.add(current)
    current = (current as UserNotifiedError).cause
  }
  return false
}

const ERROR_CODE_MESSAGES: Record<string, string> = {
  password_not_set: '账号尚未设置登录密码，请联系管理员设置后重试',
  invalid_username_or_password: '账号或密码错误，请重新输入',
  password_policy_rejected: '密码不符合安全要求，请重新设置后登录',
  invalid_credentials: '邮箱或密码错误，请重新输入',
  email_not_confirmed: '邮箱尚未验证，请先完成邮箱验证',
  phone_not_confirmed: '手机号尚未验证，请先完成验证',
  user_banned: '账号已被禁用，请联系管理员',
  user_not_found: '邮箱或密码错误，请重新输入',
  session_not_found: '登录状态已失效，请重新登录',
  session_expired: '登录状态已过期，请重新登录',
  refresh_token_not_found: '登录状态已失效，请重新登录',
  refresh_token_already_used: '登录状态已失效，请重新登录',
  bad_jwt: '登录状态无效，请重新登录',
  otp_expired: '验证链接或验证码已过期，请重新获取',
  captcha_failed: '人机验证失败，请重新验证',
  weak_password: '密码不符合安全要求，请按提示重新设置',
  same_password: '新密码不能与当前密码相同',
  email_exists: '该邮箱已经注册',
  user_already_exists: '该邮箱已经注册',
  phone_exists: '该手机号已注册，请直接登录或更换手机号',
  signup_disabled: '系统暂未开放注册',
  provider_disabled: '登录服务暂不可用，请联系管理员',
  email_provider_disabled: '邮箱登录暂不可用，请联系管理员',
  email_address_invalid: '邮箱格式不正确',
  email_address_not_authorized: '当前邮箱不允许使用',
  identity_not_found: '未找到对应的登录身份，请重新登录',
  identity_already_exists: '该登录身份已关联其他账号',
  invite_not_found: '邀请链接已失效或已被使用',
  flow_state_expired: '登录流程已过期，请重新发起登录',
  flow_state_not_found: '登录流程已失效，请重新发起登录',
  bad_code_verifier: '登录验证已失效，请重新发起登录',
  bad_oauth_state: '第三方登录验证失败，请重新登录',
  bad_oauth_callback: '第三方登录返回信息不完整，请重新登录',
  oauth_provider_not_supported: '当前第三方登录方式暂不可用',
  sso_provider_not_found: '未找到对应的单点登录配置，请联系管理员',
  mfa_verification_failed: '安全验证码不正确，请重新输入',
  mfa_verification_rejected: '安全验证未通过，请重新验证',
  mfa_challenge_expired: '安全验证已过期，请重新发起验证',
  mfa_factor_not_found: '安全验证方式已失效，请重新设置',
  insufficient_aal: '当前操作需要完成更高级别的安全验证',
  conflict: '数据状态发生冲突，请刷新后重试',
  no_authorization: '请先登录后再操作',
  not_admin: '当前账号没有管理员权限',
  bad_json: '提交内容格式不正确，请检查后重试',
  sms_send_failed: '短信发送失败，请稍后重试',
  hook_timeout: '服务响应超时，请稍后重试',
  hook_timeout_after_retry: '服务暂时不可用，请稍后重试',
  validation_failed: '提交内容格式不正确，请检查后重试',
  reauthentication_needed: '身份验证已失效，请重新登录',
  reauthentication_not_valid: '身份验证已失效，请重新登录',
  over_request_rate_limit: '登录尝试过于频繁，请稍后再试',
  over_email_send_rate_limit: '邮件发送过于频繁，请稍后再试',
  over_sms_send_rate_limit: '短信发送过于频繁，请稍后再试',
  request_timeout: '请求处理超时，请稍后重试',
  unexpected_failure: '认证服务暂时不可用，请稍后重试',
  '42501': '当前账号没有此操作权限',
  '23505': '相同数据已存在，请勿重复提交',
  '23503': '该数据正在被其他业务使用，暂时不能修改或删除',
  '23502': '必填信息不完整，请检查后重试',
  '23514': '提交内容不符合业务规则，请检查后重试',
  '23P01': '提交内容与现有数据冲突，请检查后重试',
  '22P02': '提交的数据格式不正确，请检查后重试',
  '22001': '输入内容过长，请缩短后重试',
  '22003': '输入数值超出允许范围，请检查后重试',
  '22007': '日期或时间格式不正确，请检查后重试',
  '22008': '日期或时间超出允许范围，请检查后重试',
  '40001': '数据已被其他操作更新，请刷新后重试',
  '40P01': '操作发生冲突，请稍后重试',
  '57014': '请求处理超时，请稍后重试',
  '53300': '服务当前繁忙，请稍后重试',
  '42P01': '服务配置异常，请联系管理员',
  '42703': '服务配置异常，请联系管理员',
  '42883': '服务配置异常，请联系管理员',
  PGRST000: '数据库服务暂时不可用，请稍后重试',
  PGRST001: '数据库服务暂时不可用，请稍后重试',
  PGRST002: '数据库服务正在初始化，请稍后重试',
  PGRST003: '服务当前繁忙，请稍后重试',
  PGRST100: '查询条件格式不正确，请检查后重试',
  PGRST102: '提交内容为空或格式不正确，请检查后重试',
  PGRST202: '服务接口配置异常，请联系管理员',
  PGRST204: '提交字段与服务配置不一致，请刷新后重试',
  PGRST116: '未找到对应数据，或当前账号无权查看',
  PGRST301: '登录状态已失效，请重新登录'
}

const ERROR_NAME_MESSAGES: Record<string, string> = {
  AuthInvalidCredentialsError: ERROR_CODE_MESSAGES.invalid_credentials,
  AuthRetryableFetchError: '认证服务连接失败，请检查网络后重试',
  AuthSessionMissingError: ERROR_CODE_MESSAGES.session_not_found,
  AuthWeakPasswordError: ERROR_CODE_MESSAGES.weak_password,
  FunctionsFetchError: '服务连接失败，请检查网络后重试',
  FunctionsRelayError: '服务暂时不可用，请稍后重试'
}

const MESSAGE_RULES: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /AI provider request failed with HTTP (401|403)\b/i,
    message: '模型服务鉴权失败，请联系平台管理员检查服务密钥'
  },
  {
    pattern: /AI provider request failed with HTTP (404|410)\b/i,
    message: '当前模型服务不可用，请联系平台管理员检查模型配置'
  },
  {
    pattern: /invalid login credentials|login credentials or grant type not recognized/i,
    message: ERROR_CODE_MESSAGES.invalid_credentials
  },
  {
    pattern: /email not confirmed/i,
    message: ERROR_CODE_MESSAGES.email_not_confirmed
  },
  {
    pattern:
      /authentication required|jwt expired|invalid jwt|missing.*jwt|token.*expired|refresh token.*not found/i,
    message: '登录状态已失效，请重新登录'
  },
  {
    pattern: /permission denied|row-level security|violates row-level security/i,
    message: '当前账号没有此操作权限'
  },
  {
    pattern: /duplicate key|already exists/i,
    message: '相同数据已存在，请勿重复提交'
  },
  {
    pattern: /foreign key constraint|is still referenced/i,
    message: '该数据正在被其他业务使用，暂时不能修改或删除'
  },
  {
    pattern: /failed to fetch|networkerror|network request failed|load failed/i,
    message: '网络连接异常，请检查网络后重试'
  },
  {
    pattern: /edge function.*non-2xx|failed to send a request to the edge function/i,
    message: '服务暂时不可用，请稍后重试'
  },
  {
    pattern: /timeout|timed out/i,
    message: '请求处理超时，请稍后重试'
  }
]

const STATUS_MESSAGES: Record<number, string> = {
  401: '请求未获授权，请检查账号权限或刷新后重试',
  403: '当前账号没有此操作权限',
  404: '未找到对应数据，请刷新后重试',
  409: '数据状态已发生变化，请刷新后重试',
  413: '上传内容过大，请压缩后重试',
  422: '提交内容无法处理，请检查后重试',
  429: '操作过于频繁，请稍后再试',
  500: '服务暂时不可用，请稍后重试',
  502: '服务暂时不可用，请稍后重试',
  503: '服务暂时不可用，请稍后重试',
  504: '请求处理超时，请稍后重试'
}

const CODE_KEYS = ['code', 'error_code', 'errorCode'] as const
const NAME_KEYS = ['name', 'error_name', 'errorName'] as const
const MESSAGE_KEYS = ['message', 'msg', 'error_description', 'errorDescription', 'details'] as const
const STATUS_KEYS = ['status', 'statusCode', 'httpStatusCode'] as const
const SESSION_ERROR_CODES = new Set([
  'PGRST301',
  'bad_jwt',
  'session_expired',
  'refresh_token_already_used',
  'refresh_token_not_found',
  'session_not_found'
])
const SESSION_ERROR_MESSAGE =
  /authentication required|jwt (?:has )?expired|invalid jwt|missing.*jwt|token.*expired|refresh token.*not found/i
const REQUEST_ABORT_CODES = new Set(['ABORT_ERR'])
const REQUEST_ABORT_NAMES = new Set(['AbortError'])
const REQUEST_ABORT_MESSAGE = /\baborterror\b|(?:operation|request|signal) (?:was |is )?aborted/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function pushString(target: string[], value: unknown): void {
  if (typeof value !== 'string') return
  const normalized = value.trim()
  if (normalized && !target.includes(normalized)) target.push(normalized)
}

function pushStatus(target: number[], value: unknown): void {
  const status = typeof value === 'number' ? value : Number(value)
  if (Number.isInteger(status) && status > 0 && !target.includes(status)) target.push(status)
}

function collectErrorDetails(value: unknown, details: ErrorDetails, depth = 0): void {
  if (depth > 3 || value === null || value === undefined) return

  if (Array.isArray(value)) {
    value.forEach((item) => collectErrorDetails(item, details, depth + 1))
    return
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) return

    if ((normalized.startsWith('{') || normalized.startsWith('[')) && normalized.length < 10_000) {
      try {
        collectErrorDetails(JSON.parse(normalized), details, depth + 1)
        return
      } catch {
        // 非 JSON 文本继续按普通错误消息处理。
      }
    }

    pushString(details.messages, normalized)
    return
  }

  if (!isRecord(value)) return

  CODE_KEYS.forEach((key) => pushString(details.codes, value[key]))
  NAME_KEYS.forEach((key) => pushString(details.names, value[key]))
  MESSAGE_KEYS.forEach((key) => pushString(details.messages, value[key]))
  STATUS_KEYS.forEach((key) => pushStatus(details.statuses, value[key]))

  if ('error' in value) collectErrorDetails(value.error, details, depth + 1)
  if ('cause' in value) collectErrorDetails(value.cause, details, depth + 1)
  if ('context' in value) collectErrorDetails(value.context, details, depth + 1)
  if ('data' in value) collectErrorDetails(value.data, details, depth + 1)
  if ('response' in value) collectErrorDetails(value.response, details, depth + 1)
}

/** HTTP 401 本身不证明会话失效；业务权限拒绝也可能使用 401。 */
export function isSupabaseSessionFailure(...values: unknown[]): boolean {
  const details: ErrorDetails = { codes: [], names: [], messages: [], statuses: [] }
  values.forEach((value) => collectErrorDetails(value, details))

  return (
    details.codes.some((code) => SESSION_ERROR_CODES.has(code)) ||
    details.messages.some((message) => SESSION_ERROR_MESSAGE.test(message))
  )
}

/** 无法仅凭 401 判断原因；调用方可刷新一次会话后重试并复核。 */
export function isSupabaseUnauthorizedResponse(...values: unknown[]): boolean {
  const details: ErrorDetails = { codes: [], names: [], messages: [], statuses: [] }
  values.forEach((value) => collectErrorDetails(value, details))
  return details.statuses.includes(401)
}

/** 已登录请求的权限拒绝保留当前会话，由页面显示无权限。 */
export function isSupabaseAccessFailure(...values: unknown[]): boolean {
  if (isSupabaseSessionFailure(...values)) return false
  const details: ErrorDetails = { codes: [], names: [], messages: [], statuses: [] }
  values.forEach((value) => collectErrorDetails(value, details))
  return (
    details.codes.includes('42501') ||
    details.statuses.includes(401) ||
    details.statuses.includes(403)
  )
}

/**
 * 识别由 AbortSignal 主动取消的 Supabase 请求。
 * 取消是“旧请求让位给新请求”的正常控制流，不应展示为接口加载失败。
 */
export function isSupabaseRequestAbortFailure(...values: unknown[]): boolean {
  const details: ErrorDetails = { codes: [], names: [], messages: [], statuses: [] }
  values.forEach((value) => collectErrorDetails(value, details))

  return (
    details.codes.some((code) => REQUEST_ABORT_CODES.has(code.toUpperCase())) ||
    details.names.some((name) => REQUEST_ABORT_NAMES.has(name)) ||
    details.messages.some((message) => REQUEST_ABORT_MESSAGE.test(message))
  )
}

function hasChineseText(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value)
}

function isSafeBusinessMessage(value: string): boolean {
  if (!hasChineseText(value) || value.length > 160) return false
  if (value.startsWith('{') || value.startsWith('[')) return false
  return !/sqlstate|postgres|postgrest|supabase|stack|\b(select|insert|update|delete)\b|relation |column |constraint /i.test(
    value
  )
}

/**
 * 读取 Edge Function 非 2xx 响应中的业务错误，供 API 层统一返回。
 * 无法解析响应体时保留原始 SDK 异常，避免丢失诊断信息。
 */
export async function normalizeSupabaseFunctionError(error: unknown): Promise<unknown | null> {
  if (!error) return null
  if (!isRecord(error)) return error

  const context = error.context
  if (!(context instanceof Response)) return error

  try {
    const payload: unknown = await context.clone().json()
    if (!isRecord(payload)) return error

    const code = CODE_KEYS.map((key) => payload[key]).find((value) => typeof value === 'string')
    const message = MESSAGE_KEYS.map((key) => payload[key]).find(
      (value) => typeof value === 'string' && value.trim()
    )
    const status = STATUS_KEYS.map((key) => payload[key]).find(
      (value) => typeof value === 'number' || typeof value === 'string'
    )

    if (!code && !message && !status) return error

    return {
      code,
      message,
      status,
      cause: error
    }
  } catch {
    return error
  }
}

export async function createFriendlySupabaseFunctionError(
  error: unknown,
  fallback?: string
): Promise<Error> {
  const normalized = await normalizeSupabaseFunctionError(error)
  return createFriendlySupabaseError(normalized ?? error, fallback)
}

/**
 * 将 Supabase Auth、PostgREST 与 Edge Function 的技术异常转换为用户可读提示。
 * 稳定错误码优先；已有中文业务提示会被保留，未知英文或序列化异常不会泄露到界面。
 */
export function getFriendlySupabaseErrorMessage(
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE
): string {
  const details: ErrorDetails = { codes: [], names: [], messages: [], statuses: [] }
  collectErrorDetails(error, details)

  // PostgREST may pair SQLSTATE 42501 with HTTP 401 and "Authentication required".
  // Only an explicit authentication marker means the login session is invalid.
  const authenticationMessage = details.messages.find((rawMessage) =>
    SESSION_ERROR_MESSAGE.test(rawMessage)
  )
  if (details.codes.some((code) => SESSION_ERROR_CODES.has(code)) || authenticationMessage) {
    return ERROR_CODE_MESSAGES.session_not_found
  }

  if (details.names.includes('DeleteReferenceBlockedError')) {
    return '删除受阻，请处理弹窗中的关联记录后重试'
  }

  // 业务 RPC 会用校验或唯一冲突报告业务阻断；保留安全中文原因。
  if (details.codes.includes('23514') || details.codes.includes('23505')) {
    const businessMessage = details.messages.find(isSafeBusinessMessage)
    if (businessMessage) return businessMessage
  }

  for (const code of details.codes) {
    const message =
      ERROR_CODE_MESSAGES[code] ??
      ERROR_CODE_MESSAGES[code.toUpperCase()] ??
      ERROR_CODE_MESSAGES[code.toLowerCase()]
    if (message) return message
  }

  for (const name of details.names) {
    const message = ERROR_NAME_MESSAGES[name]
    if (message) return message
  }

  const businessMessage = details.messages.find(isSafeBusinessMessage)
  if (businessMessage) return businessMessage

  for (const rawMessage of details.messages) {
    const matchedRule = MESSAGE_RULES.find(({ pattern }) => pattern.test(rawMessage))
    if (matchedRule) return matchedRule.message
  }

  for (const status of details.statuses) {
    const message = STATUS_MESSAGES[status]
    if (message) return message
  }

  return fallback
}

/** 适配 responseHandle 的认证错误格式化回调签名。 */
export function formatSupabaseAuthErrorMessage(error: unknown, responseBody?: unknown): string {
  return getFriendlySupabaseErrorMessage([responseBody, error], '认证服务暂时不可用，请稍后重试')
}

/** 保留原始 cause，同时向界面与业务层传递安全、可读的错误消息。 */
export function createFriendlySupabaseError(error: unknown, fallback?: string): Error {
  return new Error(getFriendlySupabaseErrorMessage(error, fallback), { cause: error })
}
