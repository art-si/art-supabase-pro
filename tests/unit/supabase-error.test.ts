import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import {
  createFriendlySupabaseFunctionError,
  formatSupabaseAuthErrorMessage,
  getFriendlySupabaseErrorMessage,
  isSupabaseAccessFailure,
  isSupabaseRequestAbortFailure,
  isSupabaseSessionFailure,
  isSupabaseUnauthorizedResponse,
  markErrorAsUserNotified,
  wasErrorUserNotified,
  normalizeSupabaseFunctionError
} from '../../src/utils/supabase'

class AuthApiErrorFixture extends Error {
  code = 'invalid_credentials'
  status = 400
}

test('converts AuthApiError class instances into a friendly login message', () => {
  const error = new AuthApiErrorFixture('Invalid login credentials')

  assert.equal(getFriendlySupabaseErrorMessage(error), '邮箱或密码错误，请重新输入')
})

test('does not report a wrapped provider error twice', () => {
  const providerError = markErrorAsUserNotified(new Error('当前账号没有此操作权限'))
  const workflowError = new Error('保存未完成', { cause: providerError })

  assert.equal(wasErrorUserNotified(workflowError), true)
  assert.equal(wasErrorUserNotified(new Error('本地校验失败')), false)
})

test('preserves raw database error fields while tracking displayed feedback', () => {
  const rawError = { code: '42501', message: 'permission denied', details: 'restricted record' }
  assert.equal(wasErrorUserNotified(rawError), false)
  assert.equal(markErrorAsUserNotified(rawError), rawError)
  assert.equal(rawError.code, '42501')
  assert.equal(wasErrorUserNotified(new Error('读取失败', { cause: rawError })), true)
  assert.equal(wasErrorUserNotified(null), false)
})

test('uses stable Supabase and Postgres error codes before technical messages', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: '23505', message: 'duplicate key value' }),
    '相同数据已存在，请勿重复提交'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: '42501', message: 'permission denied' }),
    '当前账号没有此操作权限'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: '23503', message: 'foreign key violation' }),
    '该数据正在被其他业务使用，暂时不能修改或删除'
  )
})

test('distinguishes an expired PostgREST session from a real permission denial', () => {
  const expiredSessionError = {
    code: '42501',
    message: 'Authentication required',
    status: 401
  }
  const permissionError = {
    code: '42501',
    message: 'permission denied for table mdm_position'
  }

  assert.equal(isSupabaseSessionFailure(expiredSessionError), true)
  assert.equal(isSupabaseAccessFailure(expiredSessionError), false)
  assert.equal(getFriendlySupabaseErrorMessage(expiredSessionError), '登录状态已失效，请重新登录')
  assert.equal(isSupabaseSessionFailure(permissionError), false)
  assert.equal(isSupabaseAccessFailure(permissionError), true)
  assert.equal(getFriendlySupabaseErrorMessage(permissionError), '当前账号没有此操作权限')
  assert.equal(
    isSupabaseSessionFailure({ code: '42501', status: 401, message: 'permission denied' }),
    false
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: '42501', status: 401, message: 'permission denied' }),
    '当前账号没有此操作权限'
  )
})

test('does not treat a bare 401 or a 500 response as an expired session', () => {
  const error = {
    context: new Response(null, { status: 401 })
  }

  assert.equal(isSupabaseSessionFailure(error), false)
  assert.equal(isSupabaseUnauthorizedResponse(error), true)
  assert.equal(isSupabaseAccessFailure(error), true)
  assert.equal(isSupabaseSessionFailure({ status: 500, message: 'Internal Server Error' }), false)
  assert.equal(isSupabaseUnauthorizedResponse({ status: 500 }), false)
  assert.equal(isSupabaseAccessFailure({ status: 500, message: 'Internal Server Error' }), false)
  assert.equal(isSupabaseAccessFailure({ status: 403, message: 'Forbidden' }), true)
  assert.equal(
    getFriendlySupabaseErrorMessage({ status: 403, message: 'Forbidden' }),
    '当前账号没有此操作权限'
  )
  assert.equal(getFriendlySupabaseErrorMessage(error), '请求未获授权，请检查账号权限或刷新后重试')
  assert.equal(isSupabaseSessionFailure({ code: 'PGRST301', status: 401 }), true)
})

test('recognizes Supabase AbortSignal responses without confusing database cancellations', () => {
  const requestAbort = {
    code: '',
    message: 'AbortError: This operation was aborted',
    details: 'AbortError: This operation was aborted',
    hint: 'Request was aborted (timeout or manual cancellation)'
  }
  const statementTimeout = {
    code: '57014',
    message: 'canceling statement due to statement timeout'
  }

  assert.equal(isSupabaseRequestAbortFailure(requestAbort), true)
  assert.equal(
    isSupabaseRequestAbortFailure(new DOMException('The user aborted a request.', 'AbortError')),
    true
  )
  assert.equal(isSupabaseRequestAbortFailure(statementTimeout), false)
})

test('parses serialized errors without exposing JSON to the user', () => {
  const error = JSON.stringify({
    name: 'AuthApiError',
    message: 'Invalid login credentials',
    status: 400,
    code: 'invalid_credentials'
  })

  assert.equal(getFriendlySupabaseErrorMessage(error), '邮箱或密码错误，请重新输入')
})

test('preserves an existing Chinese business error', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage({ message: '该车辆已关联运单，暂时不能删除' }),
    '该车辆已关联运单，暂时不能删除'
  )
})

test('shows a safe business reason for a Postgres check violation', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: '23514', message: '第 2 行单位换算关系不完整' }),
    '第 2 行单位换算关系不完整'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: '23514', message: 'check constraint violation' }),
    '提交内容不符合业务规则，请检查后重试'
  )
})

test('hides unknown English implementation details behind the caller fallback', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage(
      new Error('Unexpected internal provider response'),
      '登录失败，请稍后重试'
    ),
    '登录失败，请稍后重试'
  )
})

test('shows a safe overlap reason without exposing unique constraint details', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage({
      code: '23505',
      message: '该资金账户存在期间重叠的有效对账批次'
    }),
    '该资金账户存在期间重叠的有效对账批次'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({
      code: '23505',
      message: 'duplicate key value violates unique constraint "内部批次约束"'
    }),
    '相同数据已存在，请勿重复提交'
  )
})

test('converts common network failures into actionable guidance', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage(new TypeError('Failed to fetch')),
    '网络连接异常，请检查网络后重试'
  )
})

test('keeps the existing friendly messages for Supabase Auth error classes', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage(new AuthApiError('User is banned', 400, 'user_banned')),
    '账号已被禁用，请联系管理员'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage(new AuthRetryableFetchError('fetch failed', 503)),
    '认证服务连接失败，请检查网络后重试'
  )
  assert.equal(
    formatSupabaseAuthErrorMessage({ code: 'future_auth_error' }),
    '认证服务暂时不可用，请稍后重试'
  )
})

test('normalizes an Edge Function response body before creating the user message', async () => {
  const rawError = {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(
      JSON.stringify({ code: 'BUSINESS_BLOCKED', message: '当前记录不允许提交' }),
      {
        status: 409,
        headers: { 'content-type': 'application/json' }
      }
    )
  }

  const normalized = await normalizeSupabaseFunctionError(rawError)

  assert.equal(getFriendlySupabaseErrorMessage(normalized), '当前记录不允许提交')
})

test('creates one friendly Edge Function error with the response as its cause', async () => {
  const rawError = {
    context: new Response(
      JSON.stringify({ code: 'BUSINESS_BLOCKED', message: '当前记录不允许提交' }),
      {
        status: 409,
        headers: { 'content-type': 'application/json' }
      }
    )
  }

  const error = await createFriendlySupabaseFunctionError(rawError, '操作失败，请稍后重试')

  assert.equal(error.message, '当前记录不允许提交')
  assert.ok(error.cause)
})

test('does not expose long or technical Chinese provider details', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage(
      { message: 'Supabase SQLSTATE 42P01：relation sys_user 不存在，select * from sys_user' },
      '数据加载失败，请稍后重试'
    ),
    '数据加载失败，请稍后重试'
  )
})

test('provider authorization failures remain distinct from application login failures', async () => {
  const error = {
    context: new Response(
      JSON.stringify({ code: 'server_error', message: 'AI provider request failed with HTTP 401' }),
      { status: 500 }
    )
  }
  assert.equal(
    (await createFriendlySupabaseFunctionError(error)).message,
    '模型服务鉴权失败，请联系平台管理员检查服务密钥'
  )
  assert.equal(isSupabaseSessionFailure(error), false)
  assert.equal(
    getFriendlySupabaseErrorMessage(new Error('AI provider request failed with HTTP 410')),
    '当前模型服务不可用，请联系平台管理员检查模型配置'
  )
})
